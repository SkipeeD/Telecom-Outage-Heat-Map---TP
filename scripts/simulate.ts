import { config } from 'dotenv'
import { resolve } from 'path'

// Load .env.local from project root before anything else
config({ path: resolve(process.cwd(), '.env.local') })

import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import type { Technology, AlarmSeverity, Cell, Alarm } from '../src/types'

if (getApps().length === 0) {
  const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS)
    : resolve(process.cwd(), 'service-account.json')
  initializeApp({
    credential: cert(serviceAccountPath),
  })
}

const db = getFirestore()

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const ONCE        = process.argv.includes('--once')
const DRAIN       = process.argv.includes('--drain')
const DURATION_ARG = process.argv.find(a => a.startsWith('--duration='))
const DURATION_MS  = DURATION_ARG ? parseInt(DURATION_ARG.split('=')[1], 10) : null
const MIN_ARG      = process.argv.find(a => a.startsWith('--min='))
const MAX_ARG      = process.argv.find(a => a.startsWith('--max='))

const MIN_INTERVAL_MS  = MIN_ARG ? parseInt(MIN_ARG.split('=')[1], 10) : 60_000
const MAX_INTERVAL_MS  = MAX_ARG ? parseInt(MAX_ARG.split('=')[1], 10) : 120_000

// Target fraction of cells that should be in alarm at steady state.
// When the rate is below this, trigger probability rises; above it, resolve probability rises.
const TARGET_ALARM_RATE = 0.10

const ASSIGNEES = ['USER1', 'USER2', 'USER3', 'USER4', 'USER5', 'USER6', 'USER7', 'USER8']

// ---------------------------------------------------------------------------
// Alarm catalogue
// ---------------------------------------------------------------------------

interface AlarmTemplate {
  alarmNumber: number
  text: string
  severity: AlarmSeverity
}

const ALARM_CATALOGUE: AlarmTemplate[] = [
  // Critical
  { alarmNumber: 7767,  text: 'Cluster degraded',                            severity: 'critical' },
  { alarmNumber: 7116,  text: 'Unit power reset',                            severity: 'critical' },
  { alarmNumber: 7107,  text: '04 Battery Fault_TT',                         severity: 'critical' },
  { alarmNumber: 9001,  text: 'Site unreachable — all services dropped',     severity: 'critical' },
  { alarmNumber: 9002,  text: 'Hardware failure — remote unit offline',       severity: 'critical' },
  // Major
  { alarmNumber: 69034, text: 'FAN ALARM',                                   severity: 'major'    },
  { alarmNumber: 69034, text: 'BASE STATION CONFIGURATION PROBLEM',          severity: 'major'    },
  { alarmNumber: 7657,  text: '22 Door open_TT',                             severity: 'major'    },
  { alarmNumber: 7115,  text: 'CELL SERVICE PROBLEM',                        severity: 'major'    },
  { alarmNumber: 8801,  text: 'High packet loss detected — voice degraded',  severity: 'major'    },
  { alarmNumber: 8802,  text: 'Backhaul link down',                          severity: 'major'    },
  { alarmNumber: 8803,  text: 'VSWR Alarm — antenna cable fault',            severity: 'major'    },
  // Minor
  { alarmNumber: 9047,  text: 'Diagnostic Check Error',                      severity: 'minor'    },
  { alarmNumber: 7767,  text: 'OVERALL SECURITY STATE AT RISK',              severity: 'minor'    },
  { alarmNumber: 8101,  text: '08 Fault in Cooling Unit No.1_TT',            severity: 'minor'    },
  { alarmNumber: 8102,  text: 'Elevated latency on backhaul link',           severity: 'minor'    },
  { alarmNumber: 8103,  text: 'RRU clock synchronisation lost',              severity: 'minor'    },
  // Warning
  { alarmNumber: 6001,  text: 'CPU load above 80% — monitor for escalation', severity: 'warning' },
  { alarmNumber: 6002,  text: 'Disk usage above 85%',                        severity: 'warning' },
  { alarmNumber: 6003,  text: 'License capacity threshold reached',          severity: 'warning' },
  { alarmNumber: 6004,  text: 'Temperature threshold exceeded',              severity: 'warning' },
]

const SEVERITY_WEIGHTS: { severity: AlarmSeverity; weight: number }[] = [
  { severity: 'warning',  weight: 50 },
  { severity: 'minor',    weight: 30 },
  { severity: 'major',    weight: 15 },
  { severity: 'critical', weight: 5  },
]

function pickSeverity(): AlarmSeverity {
  const total = SEVERITY_WEIGHTS.reduce((sum, w) => sum + w.weight, 0)
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

function toPriority(severity: AlarmSeverity): string {
  switch (severity) {
    case 'critical': return '1-Critical'
    case 'major':    return '2-High'
    case 'minor':    return '3-Medium'
    default:         return '4-Low'
  }
}

// ---------------------------------------------------------------------------
// In-memory caches — loaded once at startup, kept in sync with writes
// ---------------------------------------------------------------------------

interface CachedSite {
  siteId: string
  cells:  Cell[]
}

// antennaId → site data
const topologyCache = new Map<string, CachedSite>()

// alarmId → alarm data
const activeAlarms = new Map<string, Alarm>()

// alarmId → incidentId (so we never need to query incidents during resolve)
const alarmToIncident = new Map<string, string>()

let incidentCounter = 1

async function initCaches() {
  // Load topology
  const topSnap = await db.collection('topology').get()
  for (const doc of topSnap.docs) {
    const d = doc.data()
    topologyCache.set(doc.id, { siteId: d.siteId, cells: d.cells as Cell[] })
  }
  console.log(`[simulate] Topology cache loaded — ${topologyCache.size} sites`)

  // Load active alarms
  const alarmSnap = await db.collection('alarms').where('resolved', '==', false).get()
  for (const doc of alarmSnap.docs) {
    activeAlarms.set(doc.id, { id: doc.id, ...doc.data() } as Alarm)
  }
  console.log(`[simulate] Active alarms loaded — ${activeAlarms.size} alarms`)

  // Load incident counter
  const incSnap = await db.collection('incidents')
    .orderBy('incidentNumber', 'desc')
    .limit(1)
    .get()
  if (!incSnap.empty) {
    const lastId = incSnap.docs[0].data().incidentNumber as string
    incidentCounter = parseInt(lastId.replace('INC', ''), 10) + 1
  }
  console.log(`[simulate] Incident counter starts at INC${String(incidentCounter).padStart(7, '0')}\n`)
}

function nextIncidentId(): string {
  return `INC${String(incidentCounter++).padStart(7, '0')}`
}

// ---------------------------------------------------------------------------
// Trigger: pick a random ok cell from cache, raise an alarm on it
// ---------------------------------------------------------------------------
async function triggerAlarm() {
  const eligible: {
    antennaId: string
    siteId:    string
    cells:     Cell[]
    cellIndex: number
    tech:      Technology
  }[] = []

  for (const [antennaId, site] of topologyCache) {
    for (let i = 0; i < site.cells.length; i++) {
      if (site.cells[i].status === 'ok') {
        eligible.push({ antennaId, siteId: site.siteId, cells: site.cells, cellIndex: i, tech: site.cells[i].technology })
      }
    }
  }

  if (eligible.length === 0) {
    console.log('[simulate] No ok cells available — skipping trigger')
    return
  }

  const pick      = eligible[Math.floor(Math.random() * eligible.length)]
  const severity  = pickSeverity()
  const template  = pickAlarm(severity)
  const alarmId   = `${pick.antennaId}-${pick.tech.toLowerCase()}-alarm-active`
  const alarmTime = new Date().toISOString()

  const alarm: Alarm = {
    id:              alarmId,
    antennaId:       pick.antennaId,
    siteId:          pick.siteId,
    technology:      pick.tech,
    alarmNumber:     template.alarmNumber,
    severity,
    text:            template.text,
    alarmStatus:     1,
    alarmTime,
    cancelTime:      null,
    resolved:        false,
    durationMs:      null,
    acknowledgedAt:  null,
    acknowledgedBy:  null,
  }

  const updatedCells = [...pick.cells]
  updatedCells[pick.cellIndex] = {
    technology:   pick.tech,
    status:       severity,
    currentAlarm: alarm,
  }

  const incidentId = nextIncidentId()
  const assignee   = ASSIGNEES[Math.floor(Math.random() * ASSIGNEES.length)]

  const { id: _id, ...alarmDoc } = alarm

  const batch = db.batch()
  batch.set(db.collection('alarms').doc(alarmId), alarmDoc)
  batch.update(db.collection('topology').doc(pick.antennaId), { cells: updatedCells })
  batch.set(db.collection('incidents').doc(incidentId), {
    incidentNumber: incidentId,
    submitDate:     alarmTime,
    alarmId,
    siteId:         pick.siteId,
    status:         severity === 'critical' ? 'IN PROGRESS' : 'ASSIGNED',
    urgency:        toUrgency(severity),
    impact:         severity === 'critical' ? '2-Significant/Large' : '4-Minor/Localized',
    priority:       toPriority(severity),
    closedDate:     null,
    assignee,
    resolvedDate:   null,
  })
  await batch.commit()

  // Update caches
  topologyCache.set(pick.antennaId, { siteId: pick.siteId, cells: updatedCells })
  activeAlarms.set(alarmId, alarm)
  alarmToIncident.set(alarmId, incidentId)

  console.log(`[simulate] TRIGGER  ${severity.padEnd(8)} — ${pick.siteId} / ${pick.tech} — "${template.text}"`)
}

// ---------------------------------------------------------------------------
// Resolve: pick a random active alarm from cache, clear it
// ---------------------------------------------------------------------------
async function resolveAlarm() {
  if (activeAlarms.size === 0) {
    console.log('[simulate] No active alarms to resolve — triggering instead')
    return triggerAlarm()
  }

  const alarmIds  = Array.from(activeAlarms.keys())
  const alarmId   = alarmIds[Math.floor(Math.random() * alarmIds.length)]
  const alarm     = activeAlarms.get(alarmId)!
  const cancelTime = new Date().toISOString()

  const site = topologyCache.get(alarm.antennaId)
  if (!site) return

  const updatedCells = site.cells.map((cell: Cell) =>
    cell.technology === alarm.technology
      ? { technology: cell.technology, status: 'ok' as const }
      : cell
  )

  const incidentId = alarmToIncident.get(alarmId)

  const durationMs = new Date(cancelTime).getTime() - new Date(alarm.alarmTime).getTime()

  const batch = db.batch()
  batch.update(db.collection('alarms').doc(alarmId), { resolved: true, alarmStatus: 0, cancelTime, durationMs })
  batch.update(db.collection('topology').doc(alarm.antennaId), { cells: updatedCells })
  if (incidentId) {
    batch.update(db.collection('incidents').doc(incidentId), {
      status:       'RESOLVED',
      resolvedDate: cancelTime,
      closedDate:   cancelTime,
    })
  }
  await batch.commit()

  // Update caches
  topologyCache.set(alarm.antennaId, { siteId: site.siteId, cells: updatedCells })
  activeAlarms.delete(alarmId)
  alarmToIncident.delete(alarmId)

  console.log(`[simulate] RESOLVE  ${alarm.severity.padEnd(8)} — ${alarm.siteId} / ${alarm.technology} — "${alarm.text}"`)
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

async function tick() {
  try {
    // Dynamic trigger probability: rises when few alarms exist, falls when many do.
    // Produces a realistic steady state around TARGET_ALARM_RATE of cells in alarm.
    const totalCells = [...topologyCache.values()].reduce((sum, s) => sum + s.cells.length, 0)
    const alarmRate  = totalCells > 0 ? activeAlarms.size / totalCells : 0
    // Linear interpolation: 0.9 when alarm-free, 0.5 at target, 0.1 when 2× target
    const triggerProb = Math.max(0.1, Math.min(0.9, 0.5 + (TARGET_ALARM_RATE - alarmRate) * 5))

    if (Math.random() < triggerProb) {
      await triggerAlarm()
    } else {
      await resolveAlarm()
    }
  } catch (err) {
    console.error('[simulate] Error during tick:', err)
  }

  if (ONCE) return

  const next = MIN_INTERVAL_MS + Math.random() * (MAX_INTERVAL_MS - MIN_INTERVAL_MS)

  if (DURATION_MS !== null && Date.now() - startedAt + next > DURATION_MS) {
    console.log('[simulate] Duration limit reached — exiting cleanly')
    process.exit(0)
  }

  console.log(`[simulate] Next event in ${Math.round(next / 1000)}s\n`)
  setTimeout(tick, next)
}

let startedAt = 0

async function run() {
  startedAt = Date.now()

  if (DRAIN) {
    console.log('[simulate] Drain mode — resolving excess alarms down to target rate')
  } else if (ONCE) {
    console.log('[simulate] Running single tick (--once mode)')
  } else {
    console.log('[simulate] Alarm simulation starting — normal mode')
    console.log(`[simulate] Interval: ${MIN_INTERVAL_MS / 1000}–${MAX_INTERVAL_MS / 1000}s | Target alarm rate: ${TARGET_ALARM_RATE * 100}%\n`)
    if (DURATION_MS) console.log(`[simulate] Will exit after ${DURATION_MS / 1000}s\n`)
  }

  await initCaches()

  if (DRAIN) {
    const totalCells = [...topologyCache.values()].reduce((sum, s) => sum + s.cells.length, 0)
    const target = Math.floor(totalCells * TARGET_ALARM_RATE)
    console.log(`[simulate] ${activeAlarms.size} active alarms / ${totalCells} cells — draining to ${target}\n`)
    while (activeAlarms.size > target) {
      await resolveAlarm()
    }
    console.log(`[simulate] Drain complete — ${activeAlarms.size} alarms remaining`)
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
