import { config } from 'dotenv'
import { resolve } from 'path'

// Load .env.local from project root before anything else
config({ path: resolve(process.cwd(), '.env.local') })

import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import type { Technology, AlarmSeverity } from '../src/types'

if (getApps().length === 0) {
  initializeApp({
    credential: cert({
      projectId:    process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail:  process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      // .env.local stores the private key with literal \n — replace them
      privateKey:   process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  })
}

const db = getFirestore()

// ---------------------------------------------------------------------------
// Alarm catalogue — sourced from real NOC alarm feeds
// ---------------------------------------------------------------------------

interface AlarmTemplate {
  alarmNumber: number
  text: string
  severity: AlarmSeverity
}

const ALARM_CATALOGUE: AlarmTemplate[] = [
  // Critical
  { alarmNumber: 7767, text: 'Cluster degraded',                          severity: 'critical' },
  { alarmNumber: 7116, text: 'Unit power reset',                          severity: 'critical' },
  { alarmNumber: 7107, text: '04 Battery Fault_TT',                       severity: 'critical' },
  { alarmNumber: 9001, text: 'Site unreachable — all services dropped',   severity: 'critical' },
  { alarmNumber: 9002, text: 'Hardware failure — remote unit offline',     severity: 'critical' },
  // Major
  { alarmNumber: 69034, text: 'FAN ALARM',                                severity: 'major' },
  { alarmNumber: 69034, text: 'BASE STATION CONFIGURATION PROBLEM',       severity: 'major' },
  { alarmNumber: 7657,  text: '22 Door open_TT',                          severity: 'major' },
  { alarmNumber: 7115,  text: 'CELL SERVICE PROBLEM',                     severity: 'major' },
  { alarmNumber: 8801,  text: 'High packet loss detected — voice degraded', severity: 'major' },
  { alarmNumber: 8802,  text: 'Backhaul link down',                       severity: 'major' },
  { alarmNumber: 8803,  text: 'VSWR Alarm — antenna cable fault',         severity: 'major' },
  // Minor
  { alarmNumber: 9047,  text: 'Diagnostic Check Error',                   severity: 'minor' },
  { alarmNumber: 7767,  text: 'OVERALL SECURITY STATE AT RISK',           severity: 'minor' },
  { alarmNumber: 8101,  text: '08 Fault in Cooling Unit No.1_TT',         severity: 'minor' },
  { alarmNumber: 8102,  text: 'Elevated latency on backhaul link',        severity: 'minor' },
  { alarmNumber: 8103,  text: 'RRU clock synchronisation lost',           severity: 'minor' },
  // Warning
  { alarmNumber: 6001,  text: 'CPU load above 80% — monitor for escalation', severity: 'warning' },
  { alarmNumber: 6002,  text: 'Disk usage above 85%',                     severity: 'warning' },
  { alarmNumber: 6003,  text: 'License capacity threshold reached',       severity: 'warning' },
  { alarmNumber: 6004,  text: 'Temperature threshold exceeded',           severity: 'warning' },
]

// Realistic status distribution per slot (20 per city)
// Matches real NOC data: mostly ok, some warnings, few critical
const STATUS_SLOTS: AlarmSeverity[] = [
  'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok',
  'warning', 'warning', 'warning',
  'minor', 'minor',
  'major',
  'critical',
  'ok',
]

// Incident status values matching xlsx
const INCIDENT_STATUSES = ['ASSIGNED', 'IN PROGRESS', 'RESOLVED', 'CLOSED'] as const
const INCIDENT_URGENCIES = ['1-Critical', '2-High', '3-Medium', '4-Low'] as const
const INCIDENT_IMPACTS   = ['1-Extensive/Widespread', '2-Significant/Large', '3-Moderate/Limited', '4-Minor/Localized'] as const
const INCIDENT_PRIORITIES = ['1-Critical', '2-High', '3-Medium', '4-Low'] as const
const ASSIGNEES = ['USER1', 'USER2', 'USER3', 'USER4', 'USER5', 'USER6', 'USER7', 'USER8']

const PROVIDERS: string[] = ['Vodafone RO', 'Orange RO', 'Digi RO', 'Telekom RO']

const TECH_SLOTS: Technology[] = [
  '5G', '5G', '5G', '5G',
  '4G', '4G', '4G', '4G', '4G', '4G',
  '3G', '3G', '3G',
  '2G', '2G',
  'B2B', 'B2B',
  '4G', '5G', '3G',
]

// 20 neighbourhood area names for all cities
const AREAS = [
  'Centru',        'Nord',            'Sud',             'Est',
  'Vest',          'Nord-Est',        'Nord-Vest',       'Sud-Est',
  'Sud-Vest',      'Centru-Nord',     'Centru-Sud',      'Centru-Est',
  'Centru-Vest',   'Periferie Nord',  'Periferie Sud',   'Periferie Est',
  'Periferie Vest','Industrial',      'Rezidențial Nord','Rezidențial Sud',
]

// Coordinate offsets for a 4×5 grid spread across the city (~1.5km spacing)
const LAT_OFFSETS = [-0.030, -0.015, 0.000, 0.015, 0.030]
const LON_OFFSETS = [-0.020, -0.007, 0.007, 0.020]

interface CityConfig {
  name: string
  /** Single uppercase letter used as site-ID prefix, matching xlsx style */
  code: string
  lat: number
  lon: number
}

const CITIES: CityConfig[] = [
  { name: 'București',    code: 'B',  lat: 44.4268, lon: 26.1025 },
  { name: 'Cluj-Napoca',  code: 'C',  lat: 46.7712, lon: 23.6236 },
  { name: 'Timișoara',    code: 'T',  lat: 45.7489, lon: 21.2087 },
  { name: 'Iași',         code: 'I',  lat: 47.1585, lon: 27.6014 },
  { name: 'Constanța',    code: 'K',  lat: 44.1598, lon: 28.6348 },
  { name: 'Craiova',      code: 'V',  lat: 44.3302, lon: 23.7949 },
  { name: 'Brașov',       code: 'R',  lat: 45.6427, lon: 25.5887 },
  { name: 'Galați',       code: 'G',  lat: 45.4353, lon: 28.0080 },
  { name: 'Ploiești',     code: 'P',  lat: 44.9369, lon: 26.0225 },
  { name: 'Oradea',       code: 'O',  lat: 47.0722, lon: 21.9217 },
]

// Deterministic 4-digit suffix for each antenna slot (same every run)
function siteNumber(cityIndex: number, slotIndex: number): string {
  const base = 1000 + cityIndex * 100 + slotIndex * 5
  return String(base).padStart(4, '0')
}

// Pick an alarm template by severity — deterministic via slot index
function pickAlarm(severity: AlarmSeverity, slotIndex: number): AlarmTemplate {
  const pool = ALARM_CATALOGUE.filter(a => a.severity === severity)
  return pool[slotIndex % pool.length]
}

// Map severity to urgency (matching xlsx convention)
function toUrgency(severity: AlarmSeverity): string {
  switch (severity) {
    case 'critical': return '1-Critical'
    case 'major':    return '2-High'
    case 'minor':    return '3-Medium'
    case 'warning':  return '4-Low'
    default:         return '4-Low'
  }
}

// Map severity to incident priority
function toPriority(severity: AlarmSeverity): string {
  switch (severity) {
    case 'critical': return '1-Critical'
    case 'major':    return '2-High'
    case 'minor':    return '3-Medium'
    case 'warning':  return '4-Low'
    default:         return '4-Low'
  }
}

let incidentCounter = 1

function nextIncidentId(): string {
  return `INC${String(incidentCounter++).padStart(7, '0')}`
}

async function seed() {
  console.log('Seeding Firestore...')

  const antennaBatch  = db.batch()
  const alarmBatch    = db.batch()
  const incidentBatch = db.batch()

  for (let ci = 0; ci < CITIES.length; ci++) {
    const city = CITIES[ci]

    for (let i = 0; i < 20; i++) {
      const num      = siteNumber(ci, i)
      const siteId   = `${city.code}${num}`           // e.g. T1000, B1000 — matches xlsx style
      const id       = siteId.toLowerCase()            // Firestore doc ID — e.g. t1000
      const provider = PROVIDERS[i % PROVIDERS.length]
      const tech     = TECH_SLOTS[i]
      const status   = STATUS_SLOTS[i]
      const area     = AREAS[i]

      const latOffset = LAT_OFFSETS[Math.floor(i / 5)]
      const lonOffset = LON_OFFSETS[i % 4]

      const antennaRef = db.collection('antennas').doc(id)

      let currentAlarm: object | undefined = undefined

      if (status !== 'ok') {
        const template  = pickAlarm(status, i)
        const alarmId   = `${id}-alarm-active`
        const alarmRef  = db.collection('alarms').doc(alarmId)

        // ALARM_TIME: within the last 48 hours, deterministic offset per slot
        const alarmTime   = new Date(Date.now() - 1000 * 60 * (30 + i * 17)).toISOString()
        // CANCEL_TIME: only for resolved alarms (none are resolved in active seed — all active)
        const cancelTime  = null
        const alarmStatus = 1  // 1 = active, matches xlsx ALARM_STATUS

        const alarm = {
          antennaId:   id,
          siteId,
          alarmNumber: template.alarmNumber,
          severity:    status,
          text:        template.text,            // matches xlsx TEXT column
          alarmStatus,                           // matches xlsx ALARM_STATUS (0=cancelled, 1=active)
          alarmTime,
          cancelTime,
          resolved: false,
        }

        alarmBatch.set(alarmRef, alarm)
        currentAlarm = { id: alarmId, ...alarm }

        // Seed a linked incident — matches xlsx Incidents sheet structure
        const incidentId    = nextIncidentId()
        const incidentRef   = db.collection('incidents').doc(incidentId)
        const incidentStatus = status === 'critical' ? 'IN PROGRESS' : 'ASSIGNED'
        const assignee      = ASSIGNEES[(ci + i) % ASSIGNEES.length]

        incidentBatch.set(incidentRef, {
          incidentNumber: incidentId,              // INC0000001 format
          submitDate:     alarmTime,
          alarmId:        alarmId,
          siteId,
          status:         incidentStatus,
          urgency:        toUrgency(status),
          impact:         status === 'critical' ? '2-Significant/Large' : '4-Minor/Localized',
          priority:       toPriority(status),
          closedDate:     null,
          assignee,
          resolvedDate:   null,
        })
      }

      antennaBatch.set(antennaRef, {
        name:      `${city.name} ${area}`,
        siteId,                                  // e.g. T1000 — letter + 4 digits
        provider,
        technology: tech,
        latitude:   Math.round((city.lat + latOffset) * 1e6) / 1e6,
        longitude:  Math.round((city.lon + lonOffset) * 1e6) / 1e6,
        status,
        ...(currentAlarm ? { currentAlarm } : {}),
      })
    }
  }

  await antennaBatch.commit()
  console.log('Antennas written.')

  await alarmBatch.commit()
  console.log('Alarms written.')

  await incidentBatch.commit()
  console.log('Incidents written.')

  const total = CITIES.length * 20
  console.log(`Done — seeded ${total} antennas, ${incidentCounter - 1} incidents across ${CITIES.length} cities.`)
}

seed().catch((err) => {
  console.error(err)
  process.exit(1)
})
