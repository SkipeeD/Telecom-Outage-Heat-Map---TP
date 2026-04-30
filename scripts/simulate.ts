import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import type { Technology, AlarmSeverity, Alarm } from '../src/types'

if (getApps().length === 0) {
  const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS)
    : resolve(process.cwd(), 'service-account.json')
  initializeApp({ credential: cert(serviceAccountPath) })
}

const db = getFirestore()

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const ONCE         = process.argv.includes('--once')
const DRAIN        = process.argv.includes('--drain')
const DURATION_ARG = process.argv.find(a => a.startsWith('--duration='))
const DURATION_MS  = DURATION_ARG ? parseInt(DURATION_ARG.split('=')[1], 10) : null
const MIN_ARG      = process.argv.find(a => a.startsWith('--min='))
const MAX_ARG      = process.argv.find(a => a.startsWith('--max='))
const MIN_INTERVAL = MIN_ARG ? parseInt(MIN_ARG.split('=')[1], 10) : 60_000
const MAX_INTERVAL = MAX_ARG ? parseInt(MAX_ARG.split('=')[1], 10) : 120_000

// Real NOC networks run at ~5% alarm rate. Higher = simulated outage territory.
const TARGET_ALARM_RATE = 0.05

// Hard cap on Firestore writes per run — safety valve for free tier.
// Each tick does at most 3 writes (alarm + topology + incident).
// 288 runs/day × 60 writes = 17,280 writes/day (under 20k free tier limit).
const WRITE_BUDGET = 60
let writesThisRun  = 0

// ---------------------------------------------------------------------------
// Alarm catalogue
// ---------------------------------------------------------------------------

interface AlarmTemplate { alarmNumber: number; text: string; severity: AlarmSeverity }

const ALARM_CATALOGUE: AlarmTemplate[] = [
  { alarmNumber: 7767,  text: 'Cluster degraded',                            severity: 'critical' },
  { alarmNumber: 7116,  text: 'Unit power reset',                            severity: 'critical' },
  { alarmNumber: 7107,  text: '04 Battery Fault_TT',                         severity: 'critical' },
  { alarmNumber: 9001,  text: 'Site unreachable — all services dropped',     severity: 'critical' },
  { alarmNumber: 9002,  text: 'Hardware failure — remote unit offline',       severity: 'critical' },
  { alarmNumber: 69034, text: 'FAN ALARM',                                   severity: 'major'    },
  { alarmNumber: 69034, text: 'BASE STATION CONFIGURATION PROBLEM',          severity: 'major'    },
  { alarmNumber: 7657,  text: '22 Door open_TT',                             severity: 'major'    },
  { alarmNumber: 7115,  text: 'CELL SERVICE PROBLEM',                        severity: 'major'    },
  { alarmNumber: 8801,  text: 'High packet loss detected — voice degraded',  severity: 'major'    },
  { alarmNumber: 8802,  text: 'Backhaul link down',                          severity: 'major'    },
  { alarmNumber: 8803,  text: 'VSWR Alarm — antenna cable fault',            severity: 'major'    },
  { alarmNumber: 9047,  text: 'Diagnostic Check Error',                      severity: 'minor'    },
  { alarmNumber: 7767,  text: 'OVERALL SECURITY STATE AT RISK',              severity: 'minor'    },
  { alarmNumber: 8101,  text: '08 Fault in Cooling Unit No.1_TT',            severity: 'minor'    },
  { alarmNumber: 8102,  text: 'Elevated latency on backhaul link',           severity: 'minor'    },
  { alarmNumber: 8103,  text: 'RRU clock synchronisation lost',              severity: 'minor'    },
  { alarmNumber: 6001,  text: 'CPU load above 80% — monitor for escalation', severity: 'warning' },
  { alarmNumber: 6002,  text: 'Disk usage above 85%',                        severity: 'warning' },
  { alarmNumber: 6003,  text: 'License capacity threshold reached',          severity: 'warning' },
  { alarmNumber: 6004,  text: 'Temperature threshold exceeded',              severity: 'warning' },
]

// Weighted severity distribution for new alarms — realistic NOC mix
const SEVERITY_WEIGHTS: { severity: AlarmSeverity; weight: number }[] = [
  { severity: 'warning',  weight: 50 },
  { severity: 'minor',    weight: 30 },
  { severity: 'major',    weight: 15 },
  { severity: 'critical', weight: 5  },
]

function pickSeverity(): AlarmSeverity {
  const total = SEVERITY_WEIGHTS.reduce((s, w) => s + w.weight, 0)
  let r = Math.random() * total
  for (const { severity, weight } of SEVERITY_WEIGHTS) {
    r -= weight
    if (r <= 0) return severity
  }
  return 'warning'
}

function pickAlarm(severity: AlarmSeverity): AlarmTemplate {
  const pool = ALARM_CATALOGUE.filter(a => a.severity === severity)
  return pool[Math.floor(Math.random() * pool.length)]
}

function toUrgency(severity: AlarmSeverity): string {
  switch (severity) {
    case 'critical': return '1-Critical'
    case 'major':    return '2-High'
    case 'minor':    return '3-Medium'
    default:         return '4-Low'
  }
}

const ASSIGNEES = ['USER1', 'USER2', 'USER3', 'USER4', 'USER5', 'USER6', 'USER7', 'USER8']

// ---------------------------------------------------------------------------
// In-memory state — loaded once from Firestore at startup
// ---------------------------------------------------------------------------

// Full cell list from config/cells manifest (1 read at startup)
interface CellEntry { antennaId: string; siteId: string; technology: Technology }
let allCells: CellEntry[] = []

// Active alarm cache (loaded with limit at startup, updated in memory)
// antennaId-tech → alarm doc
const activeAlarmCache = new Map<string, Alarm>()

let incidentCounter = 1

// ---------------------------------------------------------------------------
// initCaches — efficient startup: 3 Firestore reads total
// ---------------------------------------------------------------------------

async function initCaches() {
  // ── Read 1: cell manifest (1 doc) ────────────────────────────────────────
  const manifestSnap = await db.collection('config').doc('cells').get()
  if (!manifestSnap.exists) {
    console.error('[simulate] config/cells manifest not found — run yarn tsx scripts/seed.ts first')
    process.exit(1)
  }
  allCells = (manifestSnap.data()?.entries ?? []) as CellEntry[]
  console.log(`[simulate] Cell manifest loaded — ${allCells.length} cells`)

  // ── Read 2: active alarms (limit 30) ─────────────────────────────────────
  // We only need a sample to (a) build the active set for trigger exclusion
  // and (b) pick candidates for resolve. 30 is enough for realistic simulation.
  const alarmSnap = await db.collection('alarms')
    .where('resolved', '==', false)
    .limit(30)
    .get()
  for (const doc of alarmSnap.docs) {
    const alarm = { id: doc.id, ...doc.data() } as Alarm
    activeAlarmCache.set(doc.id, alarm)
  }
  console.log(`[simulate] Active alarm sample loaded — ${activeAlarmCache.size} alarms (sample of 30 max)`)

  // ── Read 3: incident counter (1 doc) ─────────────────────────────────────
  const incSnap = await db.collection('incidents')
    .orderBy('incidentNumber', 'desc')
    .limit(1)
    .get()
  if (!incSnap.empty) {
    const lastId = incSnap.docs[0].data().incidentNumber as string
    incidentCounter = parseInt(lastId.replace('INC', ''), 10) + 1
  }
  console.log(`[simulate] Incident counter: INC${String(incidentCounter).padStart(7, '0')}\n`)
}

function nextIncidentId(): string {
  return `INC${String(incidentCounter++).padStart(7, '0')}`
}

// ---------------------------------------------------------------------------
// triggerAlarm — raise an alarm on a cell that is currently ok
// Reads: 1 (topology doc for the chosen antenna)
// Writes: 2-3 (alarm + topology + optional incident)
// ---------------------------------------------------------------------------

async function triggerAlarm() {
  if (writesThisRun >= WRITE_BUDGET) {
    console.log('[simulate] Write budget exhausted — skipping trigger')
    return
  }

  // Find ok cells: all cells minus those with an active alarm in our cache
  const activeKeys = new Set(activeAlarmCache.keys())
  const okCells = allCells.filter(c => {
    const key = `${c.antennaId}-${c.technology.toLowerCase()}-alarm-active`
    return !activeKeys.has(key)
  })

  if (okCells.length === 0) {
    console.log('[simulate] No ok cells available — skipping trigger')
    return
  }

  const pick     = okCells[Math.floor(Math.random() * okCells.length)]
  const severity = pickSeverity()
  const template = pickAlarm(severity)
  const alarmId  = `${pick.antennaId}-${pick.technology.toLowerCase()}-alarm-active`
  const alarmTime = new Date().toISOString()

  // Read current topology to update the cells array correctly (1 read)
  const topoSnap = await db.collection('topology').doc(pick.antennaId).get()
  if (!topoSnap.exists) return
  const topoData  = topoSnap.data()!
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cells: any[] = topoData.cells ?? []

  // Incident for critical + major only
  const shouldCreateIncident = severity === 'critical' || severity === 'major'
  const linkedIncidentId     = shouldCreateIncident ? nextIncidentId() : null

  const alarmDoc = {
    antennaId:      pick.antennaId,
    siteId:         pick.siteId,
    technology:     pick.technology,
    alarmNumber:    template.alarmNumber,
    severity,
    text:           template.text,
    alarmStatus:    1,
    alarmTime,
    cancelTime:     null,
    resolved:       false,
    durationMs:     null,
    acknowledgedAt: null,
    acknowledgedBy: null,
    incidentId:     linkedIncidentId,
  }

  const updatedCells = cells.map(c =>
    c.technology === pick.technology
      ? { technology: pick.technology, status: severity, currentAlarm: { id: alarmId, ...alarmDoc } }
      : c
  )

  const batch = db.batch()
  batch.set(db.collection('alarms').doc(alarmId), alarmDoc)
  batch.update(db.collection('topology').doc(pick.antennaId), { cells: updatedCells })
  writesThisRun += 2

  if (linkedIncidentId) {
    batch.set(db.collection('incidents').doc(linkedIncidentId), {
      incidentNumber: linkedIncidentId,
      submitDate:     alarmTime,
      alarmId,
      antennaId:      pick.antennaId,
      technology:     pick.technology,
      siteId:         pick.siteId,
      status:         severity === 'critical' ? 'IN PROGRESS' : 'ASSIGNED',
      urgency:        toUrgency(severity),
      impact:         severity === 'critical' ? '2-Significant/Large' : '4-Minor/Localized',
      priority:       toUrgency(severity),
      closedDate:     null,
      assignee:       ASSIGNEES[Math.floor(Math.random() * ASSIGNEES.length)],
      resolvedDate:   null,
    })
    writesThisRun++
  }

  await batch.commit()
  activeAlarmCache.set(alarmId, { id: alarmId, ...alarmDoc })

  console.log(`[simulate] TRIGGER  ${severity.padEnd(8)} — ${pick.siteId} / ${pick.technology} — "${template.text}"`)
}

// ---------------------------------------------------------------------------
// resolveAlarm — clear a random active alarm from the cache
// Reads: 1 (topology doc)
// Writes: 2-3 (alarm update + topology update + optional incident update)
// ---------------------------------------------------------------------------

async function resolveAlarm() {
  if (activeAlarmCache.size === 0) {
    return triggerAlarm()
  }
  if (writesThisRun >= WRITE_BUDGET) {
    console.log('[simulate] Write budget exhausted — skipping resolve')
    return
  }

  const alarmIds = Array.from(activeAlarmCache.keys())
  const alarmId  = alarmIds[Math.floor(Math.random() * alarmIds.length)]
  const alarm    = activeAlarmCache.get(alarmId)!
  const cancelTime = new Date().toISOString()
  const durationMs = new Date(cancelTime).getTime() - new Date(alarm.alarmTime).getTime()

  // Read topology to update cells array (1 read)
  const topoSnap = await db.collection('topology').doc(alarm.antennaId).get()
  if (!topoSnap.exists) {
    activeAlarmCache.delete(alarmId)
    return
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cells: any[] = topoSnap.data()!.cells ?? []
  const updatedCells = cells.map(c =>
    c.technology === alarm.technology
      ? { technology: alarm.technology, status: 'ok' }
      : c
  )

  const batch = db.batch()
  batch.update(db.collection('alarms').doc(alarmId), {
    resolved: true, alarmStatus: 0, cancelTime, durationMs,
  })
  batch.update(db.collection('topology').doc(alarm.antennaId), { cells: updatedCells })
  writesThisRun += 2

  // Update linked incident if present — no extra read needed (incidentId is on alarm)
  if (alarm.incidentId) {
    batch.update(db.collection('incidents').doc(alarm.incidentId), {
      status:       'RESOLVED',
      resolvedDate: cancelTime,
      closedDate:   cancelTime,
    })
    writesThisRun++
  }

  await batch.commit()
  activeAlarmCache.delete(alarmId)

  console.log(`[simulate] RESOLVE  ${alarm.severity.padEnd(8)} — ${alarm.siteId} / ${alarm.technology} — "${alarm.text}"`)
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

async function tick() {
  try {
    // Dynamic trigger probability:
    //   rises when alarm rate < TARGET (push toward it)
    //   falls when alarm rate > TARGET (let resolves dominate)
    const totalCells  = allCells.length
    const alarmRate   = totalCells > 0 ? activeAlarmCache.size / totalCells : 0
    const triggerProb = Math.max(0.1, Math.min(0.9, 0.5 + (TARGET_ALARM_RATE - alarmRate) * 10))

    if (Math.random() < triggerProb) {
      await triggerAlarm()
    } else {
      await resolveAlarm()
    }
  } catch (err) {
    console.error('[simulate] Tick error:', err)
  }

  if (ONCE) return

  const next = MIN_INTERVAL + Math.random() * (MAX_INTERVAL - MIN_INTERVAL)

  if (DURATION_MS !== null && Date.now() - startedAt + next > DURATION_MS) {
    console.log(`[simulate] Duration limit reached — exiting (${writesThisRun} writes this run)`)
    process.exit(0)
  }

  console.log(`[simulate] Next in ${Math.round(next / 1000)}s  (writes: ${writesThisRun}/${WRITE_BUDGET})\n`)
  setTimeout(tick, next)
}

let startedAt = 0

async function run() {
  startedAt = Date.now()

  if (DRAIN) {
    console.log('[simulate] Drain mode — resolving excess alarms to target rate')
  } else if (ONCE) {
    console.log('[simulate] Single tick mode (--once)')
  } else {
    console.log('[simulate] Alarm simulation starting')
    console.log(`[simulate] Interval: ${MIN_INTERVAL / 1000}–${MAX_INTERVAL / 1000}s  Target alarm rate: ${TARGET_ALARM_RATE * 100}%  Write budget: ${WRITE_BUDGET}`)
    if (DURATION_MS) console.log(`[simulate] Will exit after ${DURATION_MS / 1000}s`)
    console.log()
  }

  await initCaches()

  if (DRAIN) {
    const target = Math.floor(allCells.length * TARGET_ALARM_RATE)
    console.log(`[simulate] ${activeAlarmCache.size} active / ${allCells.length} cells — draining to ≤${target}\n`)
    while (activeAlarmCache.size > target) {
      await resolveAlarm()
    }
    console.log(`[simulate] Drain complete — ${activeAlarmCache.size} active alarms remaining`)
  } else if (ONCE) {
    await tick()
  } else {
    setTimeout(tick, 5_000)
  }
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
