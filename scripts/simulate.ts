import { config } from 'dotenv'
import { resolve } from 'path'

// Load .env.local from project root before anything else
config({ path: resolve(process.cwd(), '.env.local') })

import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import type { Technology, AlarmSeverity } from '../src/types'

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
// Normal mode — realistic NOC simulation
// One event every 60–120 seconds. 60% trigger, 40% resolve.
// New alarm severity: mostly warning/minor, occasional major, rare critical.
// ---------------------------------------------------------------------------

const MIN_INTERVAL_MS = 60_000
const MAX_INTERVAL_MS = 120_000
const TRIGGER_PROBABILITY = 0.6

const ASSIGNEES = ['USER1', 'USER2', 'USER3', 'USER4', 'USER5', 'USER6', 'USER7', 'USER8']

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

// Weighted severity distribution for new alarms in normal conditions
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

let incidentCounter = 1

async function initIncidentCounter() {
  const snap = await db.collection('incidents')
    .orderBy('incidentNumber', 'desc')
    .limit(1)
    .get()

  if (!snap.empty) {
    const lastId = snap.docs[0].data().incidentNumber as string // e.g. INC0000042
    incidentCounter = parseInt(lastId.replace('INC', ''), 10) + 1
  }
}

function nextIncidentId(): string {
  return `INC${String(incidentCounter++).padStart(7, '0')}`
}

// ---------------------------------------------------------------------------
// Trigger: pick a random ok cell, raise an alarm on it
// ---------------------------------------------------------------------------
async function triggerAlarm() {
  const topSnap = await db.collection('topology').get()

  // Collect all cells that are currently ok
  const eligible: {
    antennaId: string
    siteId: string
    cells: any[]
    cellIndex: number
    tech: Technology
  }[] = []

  for (const doc of topSnap.docs) {
    const site = doc.data()
    for (let i = 0; i < site.cells.length; i++) {
      if (site.cells[i].status === 'ok') {
        eligible.push({
          antennaId: doc.id,
          siteId:    site.siteId,
          cells:     site.cells,
          cellIndex: i,
          tech:      site.cells[i].technology,
        })
      }
    }
  }

  if (eligible.length === 0) {
    console.log('[simulate] No ok cells available — skipping trigger')
    return
  }

  const pick     = eligible[Math.floor(Math.random() * eligible.length)]
  const severity = pickSeverity()
  const template = pickAlarm(severity)
  const alarmId  = `${pick.antennaId}-${pick.tech.toLowerCase()}-alarm-active`
  const alarmTime = new Date().toISOString()

  const alarm = {
    antennaId:   pick.antennaId,
    siteId:      pick.siteId,
    technology:  pick.tech,
    alarmNumber: template.alarmNumber,
    severity,
    text:        template.text,
    alarmStatus: 1,
    alarmTime,
    cancelTime:  null,
    resolved:    false,
  }

  const updatedCells = [...pick.cells]
  updatedCells[pick.cellIndex] = {
    technology:   pick.tech,
    status:       severity,
    currentAlarm: { id: alarmId, ...alarm },
  }

  const incidentId = nextIncidentId()
  const assignee   = ASSIGNEES[Math.floor(Math.random() * ASSIGNEES.length)]

  const batch = db.batch()
  batch.set(db.collection('alarms').doc(alarmId), alarm)
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

  console.log(`[simulate] TRIGGER  ${severity.padEnd(8)} — ${pick.siteId} / ${pick.tech} — "${template.text}"`)
}

// ---------------------------------------------------------------------------
// Resolve: pick a random active alarm, clear it
// ---------------------------------------------------------------------------
async function resolveAlarm() {
  const snap = await db.collection('alarms').where('resolved', '==', false).get()

  if (snap.empty) {
    console.log('[simulate] No active alarms to resolve — triggering instead')
    return triggerAlarm()
  }

  const alarmDoc  = snap.docs[Math.floor(Math.random() * snap.docs.length)]
  const alarm     = alarmDoc.data()
  const cancelTime = new Date().toISOString()

  // Clear the cell in topology
  const topDoc = await db.collection('topology').doc(alarm.antennaId).get()
  if (!topDoc.exists) return

  const site = topDoc.data()!
  const updatedCells = (site.cells as any[]).map((cell: any) =>
    cell.technology === alarm.technology
      ? { technology: cell.technology, status: 'ok' }
      : cell
  )

  // Find and close the linked incident (client-side filter to avoid compound index requirement)
  const incSnap = await db.collection('incidents').where('alarmId', '==', alarmDoc.id).get()
  const openInc = incSnap.docs.find(d => !['RESOLVED', 'CLOSED'].includes(d.data().status))

  const batch = db.batch()
  batch.update(alarmDoc.ref, { resolved: true, alarmStatus: 0, cancelTime })
  batch.update(db.collection('topology').doc(alarm.antennaId), { cells: updatedCells })
  if (openInc) {
    batch.update(openInc.ref, {
      status:       'RESOLVED',
      resolvedDate: cancelTime,
      closedDate:   cancelTime,
    })
  }
  await batch.commit()

  console.log(`[simulate] RESOLVE  ${alarm.severity.padEnd(8)} — ${alarm.siteId} / ${alarm.technology} — "${alarm.text}"`)
}

const ONCE = process.argv.includes('--once')
const DURATION_ARG = process.argv.find(a => a.startsWith('--duration='))
const DURATION_MS = DURATION_ARG ? parseInt(DURATION_ARG.split('=')[1], 10) : null

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
async function tick() {
  try {
    if (Math.random() < TRIGGER_PROBABILITY) {
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

async function run() {
  if (ONCE) {
    console.log('[simulate] Running single tick (--once mode)')
  } else {
    console.log('[simulate] Alarm simulation starting — normal mode')
    console.log(`[simulate] Interval: ${MIN_INTERVAL_MS / 1000}–${MAX_INTERVAL_MS / 1000}s | Trigger: ${TRIGGER_PROBABILITY * 100}% / Resolve: ${(1 - TRIGGER_PROBABILITY) * 100}%\n`)
  }

  await initIncidentCounter()
  console.log(`[simulate] Incident counter starts at INC${String(incidentCounter).padStart(7, '0')}\n`)

  if (ONCE) {
    await tick()
  } else {
    // First event after 5 s so you can see it start
    setTimeout(tick, 5_000)
  }
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
