import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import type { Technology, AlarmSeverity } from '../src/types'

if (getApps().length === 0) {
  initializeApp({
    credential: cert({
      projectId:   process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  })
}

const db = getFirestore()

// ---------------------------------------------------------------------------
// Static seed data — deterministic IDs so running twice never duplicates rows
// ---------------------------------------------------------------------------

const TECHNOLOGIES: Technology[] = ['2G', '3G', '4G', '5G', 'B2B']
const PROVIDERS = ['Vodafone RO', 'Orange RO', 'Digi RO', 'Telekom RO']
const STATUSES: AlarmSeverity[] = ['ok', 'ok', 'ok', 'warning', 'minor', 'major', 'critical']

interface CityDef {
  name: string
  antennas: AntennaDef[]
}

interface AntennaDef {
  id: string
  name: string
  siteId: string
  provider: string
  technology: Technology
  latitude: number
  longitude: number
  status: AlarmSeverity
}

const cities: CityDef[] = [
  {
    name: 'Timișoara',
    antennas: [
      { id: 'tm-001', siteId: 'TM-001', name: 'Timișoara Nord',   provider: 'Vodafone RO', technology: '5G',  latitude: 45.7489, longitude: 21.2087, status: 'ok'       },
      { id: 'tm-002', siteId: 'TM-002', name: 'Timișoara Centru', provider: 'Orange RO',   technology: '4G',  latitude: 45.7494, longitude: 21.2272, status: 'warning'  },
      { id: 'tm-003', siteId: 'TM-003', name: 'Timișoara Sud',    provider: 'Digi RO',     technology: '3G',  latitude: 45.7340, longitude: 21.2200, status: 'critical' },
    ],
  },
  {
    name: 'Cluj-Napoca',
    antennas: [
      { id: 'cj-001', siteId: 'CJ-001', name: 'Cluj Centru',      provider: 'Orange RO',   technology: '5G',  latitude: 46.7712, longitude: 23.6236, status: 'ok'    },
      { id: 'cj-002', siteId: 'CJ-002', name: 'Cluj Mărăști',     provider: 'Telekom RO',  technology: '4G',  latitude: 46.7833, longitude: 23.6367, status: 'minor' },
      { id: 'cj-003', siteId: 'CJ-003', name: 'Cluj Florești',    provider: 'Vodafone RO', technology: 'B2B', latitude: 46.7450, longitude: 23.5950, status: 'ok'    },
    ],
  },
  {
    name: 'București',
    antennas: [
      { id: 'b-001',  siteId: 'B-001',  name: 'București Centru', provider: 'Digi RO',     technology: '5G',  latitude: 44.4268, longitude: 26.1025, status: 'ok'       },
      { id: 'b-002',  siteId: 'B-002',  name: 'București Nord',   provider: 'Orange RO',   technology: '4G',  latitude: 44.4650, longitude: 26.0800, status: 'major'    },
      { id: 'b-003',  siteId: 'B-003',  name: 'București Vest',   provider: 'Vodafone RO', technology: '2G',  latitude: 44.4200, longitude: 25.9900, status: 'warning'  },
    ],
  },
  {
    name: 'Iași',
    antennas: [
      { id: 'is-001', siteId: 'IS-001', name: 'Iași Centru',      provider: 'Telekom RO',  technology: '4G',  latitude: 47.1585, longitude: 27.6014, status: 'ok'       },
      { id: 'is-002', siteId: 'IS-002', name: 'Iași Nord',        provider: 'Digi RO',     technology: '5G',  latitude: 47.1750, longitude: 27.5900, status: 'critical' },
      { id: 'is-003', siteId: 'IS-003', name: 'Iași Păcurari',    provider: 'Orange RO',   technology: '3G',  latitude: 47.1650, longitude: 27.5750, status: 'minor'    },
    ],
  },
  {
    name: 'Brașov',
    antennas: [
      { id: 'bv-001', siteId: 'BV-001', name: 'Brașov Centru',    provider: 'Vodafone RO', technology: '4G',  latitude: 45.6427, longitude: 25.5887, status: 'ok'      },
      { id: 'bv-002', siteId: 'BV-002', name: 'Brașov Bartolomeu',provider: 'Orange RO',   technology: '5G',  latitude: 45.6600, longitude: 25.5700, status: 'warning' },
    ],
  },
  {
    name: 'Constanța',
    antennas: [
      { id: 'ct-001', siteId: 'CT-001', name: 'Constanța Port',   provider: 'Digi RO',     technology: 'B2B', latitude: 44.1598, longitude: 28.6348, status: 'ok'    },
      { id: 'ct-002', siteId: 'CT-002', name: 'Constanța Nord',   provider: 'Telekom RO',  technology: '4G',  latitude: 44.1800, longitude: 28.6200, status: 'minor' },
      { id: 'ct-003', siteId: 'CT-003', name: 'Constanța Sud',    provider: 'Vodafone RO', technology: '3G',  latitude: 44.1400, longitude: 28.6100, status: 'major' },
    ],
  },
]

// Alarm descriptions keyed by severity
const ALARM_DESCRIPTIONS: Record<AlarmSeverity, string> = {
  critical: 'Site unreachable — all calls dropped, no data service.',
  major:    'High packet loss detected — degraded voice quality.',
  minor:    'Elevated latency on backhaul link.',
  warning:  'CPU load above 80% — monitor for escalation.',
  ok:       'All systems nominal.',
}

async function seed() {
  console.log('Seeding Firestore...')

  const antennaBatch = db.batch()
  const alarmBatch   = db.batch()

  for (const city of cities) {
    for (const antenna of city.antennas) {
      const antennaRef = db.collection('antennas').doc(antenna.id)

      // Build current alarm if status is not ok
      let currentAlarm: object | undefined = undefined
      if (antenna.status !== 'ok') {
        const alarmId  = `${antenna.id}-alarm-active`
        const alarmRef = db.collection('alarms').doc(alarmId)
        const alarm = {
          antennaId:   antenna.id,
          severity:    antenna.status,
          description: ALARM_DESCRIPTIONS[antenna.status],
          alarmTime:   new Date(Date.now() - 1000 * 60 * 30).toISOString(), // 30 min ago
          cancelTime:  null,
          resolved:    false,
        }
        alarmBatch.set(alarmRef, alarm)
        currentAlarm = { id: alarmId, ...alarm }
      }

      antennaBatch.set(antennaRef, {
        name:         antenna.name,
        siteId:       antenna.siteId,
        provider:     antenna.provider,
        technology:   antenna.technology,
        latitude:     antenna.latitude,
        longitude:    antenna.longitude,
        status:       antenna.status,
        ...(currentAlarm ? { currentAlarm } : {}),
      })
    }
  }

  await antennaBatch.commit()
  await alarmBatch.commit()

  const total = cities.reduce((sum, c) => sum + c.antennas.length, 0)
  console.log(`Done — seeded ${total} antennas across ${cities.length} cities.`)
}

seed().catch((err) => {
  console.error(err)
  process.exit(1)
})
