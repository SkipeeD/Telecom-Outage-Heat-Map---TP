import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import type { DocumentData, WriteBatch } from 'firebase-admin/firestore'
import type { Technology, AlarmSeverity, Alarm, Cell } from '../src/types'

if (getApps().length === 0) {
  const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS)
    : resolve(process.cwd(), 'service-account.json')
  initializeApp({ credential: cert(serviceAccountPath) })
}

const db = getFirestore()
const SIMULATION_STATE_REF = db.collection('config').doc('simulationState')

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

// Alarms that remain active beyond these thresholds without an incident get
// auto-escalated. Critical/major already receive incidents at trigger time.
const ESCALATION_THRESHOLD_MS: Partial<Record<AlarmSeverity, number>> = {
  minor:   15 * 60_000,  // 15 min real-wall-clock time
  warning: 30 * 60_000,  // 30 min
}

const SITE_MERGE_RADIUS_M = 500
const OPEN_INCIDENT_STATUSES = new Set(['ASSIGNED', 'IN PROGRESS'])

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

function priorityRank(priority: string): number {
  switch (priority) {
    case '1-Critical': return 1
    case '2-High':     return 2
    case '3-Medium':   return 3
    default:           return 4
  }
}


// ---------------------------------------------------------------------------
// In-memory state — loaded once from Firestore at startup
// ---------------------------------------------------------------------------

// Full cell list from config/cells manifest (1 read at startup)
interface CellEntry {
  antennaId: string
  siteId: string
  technology: Technology
  latitude?: number
  longitude?: number
}
let allCells: CellEntry[] = []

// Active alarm cache (loaded with limit at startup, updated in memory)
// alarm doc id → alarm doc
const activeAlarmCache = new Map<string, Alarm>()

let incidentCounter = 1
let stateDirty = false

interface SimulationState {
  version: 1
  activeAlarms: Record<string, Alarm>
  incidentCounter: number
  updatedAt: string
}

function alarmIdForCell(antennaId: string, technology: Technology): string {
  return `${antennaId}-${technology.toLowerCase()}-alarm-active`
}

function buildCells(antennaId: string): Cell[] {
  return allCells
    .filter(c => c.antennaId === antennaId)
    .map(({ technology }) => {
      const alarm = activeAlarmCache.get(alarmIdForCell(antennaId, technology))
      return alarm
        ? { technology, status: alarm.severity, currentAlarm: alarm }
        : { technology, status: 'ok' }
    })
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function siteScopeFor(antennaId: string, siteId: string): { siteIds: string[]; antennaIds: string[] } {
  const primary = allCells.find(c => c.antennaId === antennaId)
  const siteIds = new Set<string>([siteId])
  const antennaIds = new Set<string>([antennaId])

  if (primary?.latitude === undefined || primary.longitude === undefined) {
    return { siteIds: [...siteIds], antennaIds: [...antennaIds] }
  }

  for (const entry of allCells) {
    if (entry.latitude === undefined || entry.longitude === undefined) continue
    const dist = haversineM(primary.latitude, primary.longitude, entry.latitude, entry.longitude)
    if (dist <= SITE_MERGE_RADIUS_M) {
      siteIds.add(entry.siteId)
      antennaIds.add(entry.antennaId)
    }
  }

  return { siteIds: [...siteIds], antennaIds: [...antennaIds] }
}

async function findOpenIncidentForSites(siteIds: string[]) {
  const seen = new Set<string>()
  const incidents: Array<{ id: string; data: DocumentData }> = []

  for (const siteId of siteIds) {
    const [bySiteIds, byLegacySite] = await Promise.all([
      db.collection('incidents').where('siteIds', 'array-contains', siteId).limit(20).get(),
      db.collection('incidents').where('siteId', '==', siteId).limit(20).get(),
    ])

    for (const doc of [...bySiteIds.docs, ...byLegacySite.docs]) {
      if (seen.has(doc.id)) continue
      seen.add(doc.id)
      const data = doc.data()
      if (OPEN_INCIDENT_STATUSES.has(data.status)) {
        incidents.push({ id: doc.id, data })
      }
    }
  }

  return incidents.sort((a, b) =>
    new Date(a.data.submitDate).getTime() - new Date(b.data.submitDate).getTime()
  )[0] ?? null
}

async function prepareIncidentForAlarm(
  batch: WriteBatch,
  alarmId: string,
  alarm: Omit<Alarm, 'id'>,
  submitDate: string,
  status: 'ASSIGNED' | 'IN PROGRESS'
): Promise<string> {
  const scope = siteScopeFor(alarm.antennaId, alarm.siteId)
  const existing = await findOpenIncidentForSites(scope.siteIds)

  if (existing) {
    const urgency = toUrgency(alarm.severity)
    const existingPriority = typeof existing.data.priority === 'string'
      ? existing.data.priority
      : typeof existing.data.urgency === 'string'
        ? existing.data.urgency
        : '4-Low'
    const shouldEscalate = priorityRank(urgency) < priorityRank(existingPriority)
    batch.update(db.collection('incidents').doc(existing.id), {
      siteIds:      FieldValue.arrayUnion(...scope.siteIds),
      antennaIds:   FieldValue.arrayUnion(...scope.antennaIds),
      alarmIds:     FieldValue.arrayUnion(alarmId),
      technologies: FieldValue.arrayUnion(alarm.technology),
      ...(shouldEscalate ? {
        urgency,
        priority: urgency,
        impact: alarm.severity === 'critical' ? '2-Significant/Large' : alarm.severity === 'minor' ? '3-Moderate/Limited' : '4-Minor/Localized',
      } : {}),
    })
    writesThisRun++
    return existing.id
  }

  const incidentId = nextIncidentId()
  batch.set(db.collection('incidents').doc(incidentId), {
    incidentNumber: incidentId,
    submitDate,
    alarmId,
    antennaId:    alarm.antennaId,
    technology:   alarm.technology,
    siteId:       alarm.siteId,
    siteIds:      scope.siteIds,
    antennaIds:   scope.antennaIds,
    alarmIds:     [alarmId],
    technologies: [alarm.technology],
    status,
    urgency:      toUrgency(alarm.severity),
    impact:       alarm.severity === 'critical' ? '2-Significant/Large' : alarm.severity === 'minor' ? '3-Moderate/Limited' : '4-Minor/Localized',
    priority:     toUrgency(alarm.severity),
    closedDate:   null,
    assignee:     '',
    assignees:    [],
    resolvedDate: null,
  })
  writesThisRun++
  return incidentId
}

async function loadSimulationState(): Promise<boolean> {
  const stateSnap = await SIMULATION_STATE_REF.get()
  if (!stateSnap.exists) return false

  const state = stateSnap.data() as Partial<SimulationState>
  if (!state.activeAlarms || typeof state.incidentCounter !== 'number') return false

  activeAlarmCache.clear()
  for (const [alarmId, alarm] of Object.entries(state.activeAlarms)) {
    activeAlarmCache.set(alarmId, alarm)
  }
  incidentCounter = state.incidentCounter
  return true
}

async function saveSimulationState() {
  const activeAlarms = Object.fromEntries(activeAlarmCache) as Record<string, Alarm>
  await SIMULATION_STATE_REF.set({
    version: 1,
    activeAlarms,
    incidentCounter,
    updatedAt: new Date().toISOString(),
  } satisfies SimulationState)
  stateDirty = false
}

// ---------------------------------------------------------------------------
// initCaches — efficient startup: 2 Firestore document reads after bootstrap
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

  // ── Read 2: compact simulator state (1 doc) ──────────────────────────────
  // Recurring GitHub Actions runs should use this path. It avoids paying the
  // active alarm query and incident counter query on every scheduled run.
  if (await loadSimulationState()) {
    console.log(`[simulate] Simulation state loaded — ${activeAlarmCache.size} active alarms`)
    console.log(`[simulate] Incident counter: INC${String(incidentCounter).padStart(7, '0')}\n`)
    return
  }

  console.log('[simulate] Simulation state missing — bootstrapping from Firestore queries')

  // Bootstrap only: active alarms (limit 30). The state doc written below is
  // used by later runs, so this query should not recur unless config is reset.
  const alarmSnap = await db.collection('alarms')
    .where('resolved', '==', false)
    .limit(30)
    .get()
  for (const doc of alarmSnap.docs) {
    const alarm = { id: doc.id, ...doc.data() } as Alarm
    activeAlarmCache.set(doc.id, alarm)
  }
  console.log(`[simulate] Active alarm sample loaded — ${activeAlarmCache.size} alarms (sample of 30 max)`)

  // Bootstrap only: incident counter (1 doc)
  const incSnap = await db.collection('incidents')
    .orderBy('incidentNumber', 'desc')
    .limit(1)
    .get()
  if (!incSnap.empty) {
    const lastId = incSnap.docs[0].data().incidentNumber as string
    incidentCounter = parseInt(lastId.replace('INC', ''), 10) + 1
  }
  await saveSimulationState()
  console.log(`[simulate] Incident counter: INC${String(incidentCounter).padStart(7, '0')}\n`)
}

function nextIncidentId(): string {
  return `INC${String(incidentCounter++).padStart(7, '0')}`
}

// ---------------------------------------------------------------------------
// escalateStaleAlarms — run before every tick.
// Scans the active alarm cache for alarms that have no incident yet and have
// exceeded their severity threshold. Creates an incident and links it back to
// the alarm doc in a single batch (2 writes per escalation).
// ---------------------------------------------------------------------------

async function escalateStaleAlarms() {
  const now = Date.now()

  for (const [alarmId, alarm] of activeAlarmCache) {
    if (alarm.incidentId !== null) continue

    const threshold = ESCALATION_THRESHOLD_MS[alarm.severity]
    if (threshold === undefined) continue

    const ageMs = now - new Date(alarm.alarmTime).getTime()
    if (ageMs < threshold) continue

    if (writesThisRun + 2 > WRITE_BUDGET) {
      console.log('[simulate] Write budget full — skipping escalation')
      break
    }

    const submitDate = new Date().toISOString()
    const ageMin     = Math.round(ageMs / 60_000)

    const batch = db.batch()
    const incidentId = await prepareIncidentForAlarm(batch, alarmId, alarm, submitDate, 'ASSIGNED')
    batch.update(db.collection('alarms').doc(alarmId), { incidentId })
    writesThisRun++

    await batch.commit()

    // Keep cache consistent — alarm now has a linked incident
    activeAlarmCache.set(alarmId, { ...alarm, incidentId })
    stateDirty = true

    console.log(`[simulate] ESCALATE ${alarm.severity.padEnd(8)} — ${alarm.siteId} / ${alarm.technology} — unresolved ${ageMin}m → ${incidentId}`)
  }
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
  const alarmId  = alarmIdForCell(pick.antennaId, pick.technology)
  const alarmTime = new Date().toISOString()

  // Rebuild the cells array from the simulator state, avoiding topology reads.
  const cells = buildCells(pick.antennaId)
  if (cells.length === 0) return

  // Incident for critical + major only
  const shouldCreateIncident = severity === 'critical' || severity === 'major'
  const alarmDocBase = {
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
    incidentId:     null,
  }

  const batch = db.batch()
  const linkedIncidentId = shouldCreateIncident
    ? await prepareIncidentForAlarm(
      batch,
      alarmId,
      alarmDocBase,
      alarmTime,
      severity === 'critical' ? 'IN PROGRESS' : 'ASSIGNED'
    )
    : null
  const alarmDoc = { ...alarmDocBase, incidentId: linkedIncidentId }

  const updatedCells = cells.map(c =>
    c.technology === pick.technology
      ? { technology: pick.technology, status: severity, currentAlarm: { id: alarmId, ...alarmDoc } }
      : c
  )

  batch.set(db.collection('alarms').doc(alarmId), alarmDoc)
  batch.update(db.collection('topology').doc(pick.antennaId), { cells: updatedCells })
  writesThisRun += 2

  await batch.commit()
  activeAlarmCache.set(alarmId, { id: alarmId, ...alarmDoc })
  stateDirty = true

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

  // Rebuild the cells array from the simulator state, avoiding topology reads.
  const cells = buildCells(alarm.antennaId)
  if (cells.length === 0) {
    activeAlarmCache.delete(alarmId)
    stateDirty = true
    return
  }
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

  const incidentStillHasActiveAlarms = alarm.incidentId
    ? Array.from(activeAlarmCache.values()).some(a => a.id !== alarmId && a.incidentId === alarm.incidentId)
    : false

  // Resolve the grouped incident only after its last active linked alarm clears.
  if (alarm.incidentId && !incidentStillHasActiveAlarms) {
    batch.update(db.collection('incidents').doc(alarm.incidentId), {
      status:       'RESOLVED',
      resolvedDate: cancelTime,
      closedDate:   cancelTime,
    })
    writesThisRun++
  }

  await batch.commit()
  activeAlarmCache.delete(alarmId)
  stateDirty = true

  const resolvedInMin = Math.round(durationMs / 60_000)
  console.log(`[simulate] RESOLVE  ${alarm.severity.padEnd(8)} — ${alarm.siteId} / ${alarm.technology} — "${alarm.text}" (${resolvedInMin}m)`)
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

async function tick() {
  try {
    // Escalate any stale alarms before the trigger/resolve decision.
    await escalateStaleAlarms()

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

    if (stateDirty) {
      await saveSimulationState()
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
    if (stateDirty) {
      await saveSimulationState()
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
