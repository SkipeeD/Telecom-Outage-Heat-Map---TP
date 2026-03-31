import { config } from 'dotenv'
import { resolve } from 'path'

// Load .env.local from project root before anything else
config({ path: resolve(process.cwd(), '.env.local') })

import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import type { Technology, AlarmSeverity } from '../src/types'

if (getApps().length === 0) {
  initializeApp({ credential: applicationDefault() })
}

const db = getFirestore()

// ---------------------------------------------------------------------------
// Deterministic data — same output every run, no duplicates
// ---------------------------------------------------------------------------

const PROVIDERS: string[] = ['Vodafone RO', 'Orange RO', 'Digi RO', 'Telekom RO']

// Realistic technology distribution per slot (20 per city)
const TECH_SLOTS: Technology[] = [
  '5G', '5G', '5G', '5G',
  '4G', '4G', '4G', '4G', '4G', '4G',
  '3G', '3G', '3G',
  '2G', '2G',
  'B2B', 'B2B',
  '4G', '5G', '3G',
]

// Realistic status distribution per slot (mostly ok, some issues)
const STATUS_SLOTS: AlarmSeverity[] = [
  'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok',
  'warning', 'warning', 'warning',
  'minor', 'minor',
  'major',
  'critical',
  'ok',
]

const ALARM_DESCRIPTIONS: Record<AlarmSeverity, string> = {
  critical: 'Site unreachable — all calls dropped, no data service.',
  major:    'High packet loss detected — degraded voice quality.',
  minor:    'Elevated latency on backhaul link.',
  warning:  'CPU load above 80% — monitor for escalation.',
  ok:       'All systems nominal.',
}

// 20 neighborhood area names used for all cities
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
  code: string
  lat: number
  lon: number
}

const CITIES: CityConfig[] = [
  { name: 'București',    code: 'b',  lat: 44.4268, lon: 26.1025 },
  { name: 'Cluj-Napoca',  code: 'cj', lat: 46.7712, lon: 23.6236 },
  { name: 'Timișoara',    code: 'tm', lat: 45.7489, lon: 21.2087 },
  { name: 'Iași',         code: 'is', lat: 47.1585, lon: 27.6014 },
  { name: 'Constanța',    code: 'ct', lat: 44.1598, lon: 28.6348 },
  { name: 'Craiova',      code: 'cv', lat: 44.3302, lon: 23.7949 },
  { name: 'Brașov',       code: 'bv', lat: 45.6427, lon: 25.5887 },
  { name: 'Galați',       code: 'gl', lat: 45.4353, lon: 28.0080 },
  { name: 'Ploiești',     code: 'ph', lat: 44.9369, lon: 26.0225 },
  { name: 'Oradea',       code: 'bh', lat: 47.0722, lon: 21.9217 },
]

async function seed() {
  console.log('Seeding Firestore...')

  const antennaBatch = db.batch()
  const alarmBatch   = db.batch()

  for (const city of CITIES) {
    for (let i = 0; i < 20; i++) {
      const num      = String(i + 1).padStart(3, '0')
      const id       = `${city.code}-${num}`
      const siteId   = `${city.code.toUpperCase()}-${num}`
      const provider = PROVIDERS[i % PROVIDERS.length]
      const tech     = TECH_SLOTS[i]
      const status   = STATUS_SLOTS[i]
      const area     = AREAS[i]

      // Spread antennas in a 5-col × 4-row grid around city center
      const latOffset = LAT_OFFSETS[Math.floor(i / 5)]
      const lonOffset = LON_OFFSETS[i % 4]

      const antennaRef = db.collection('antennas').doc(id)

      let currentAlarm: object | undefined = undefined
      if (status !== 'ok') {
        const alarmId  = `${id}-alarm-active`
        const alarmRef = db.collection('alarms').doc(alarmId)
        const alarm = {
          antennaId:   id,
          severity:    status,
          description: ALARM_DESCRIPTIONS[status],
          alarmTime:   new Date(Date.now() - 1000 * 60 * 30).toISOString(),
          cancelTime:  null,
          resolved:    false,
        }
        alarmBatch.set(alarmRef, alarm)
        currentAlarm = { id: alarmId, ...alarm }
      }

      antennaBatch.set(antennaRef, {
        name:      `${city.name} ${area}`,
        siteId,
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
  await alarmBatch.commit()

  const total = CITIES.length * 20
  console.log(`Done — seeded ${total} antennas across ${CITIES.length} cities.`)
}

seed().catch((err) => {
  console.error(err)
  process.exit(1)
})
