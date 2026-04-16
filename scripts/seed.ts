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

const ASSIGNEES = ['USER1', 'USER2', 'USER3', 'USER4', 'USER5', 'USER6', 'USER7', 'USER8']

const PROVIDERS: string[] = ['Vodafone RO', 'Orange RO', 'Digi RO', 'Telekom RO']

// Each entry is the set of cell technologies present at that antenna slot
const CELL_BUNDLES: Technology[][] = [
  ['2G', '3G', '4G', '5G'],   // Full modern stack
  ['2G', '3G', '4G', '5G'],
  ['2G', '3G', '4G', '5G'],
  ['2G', '3G', '4G', '5G'],
  ['3G', '4G', '5G'],          // No legacy 2G
  ['3G', '4G', '5G'],
  ['3G', '4G', '5G'],
  ['3G', '4G', '5G'],
  ['2G', '3G', '4G'],          // No 5G rollout yet
  ['2G', '3G', '4G'],
  ['2G', '3G', '4G'],
  ['2G', '3G', '4G'],
  ['4G', '5G'],                // Compact modern site
  ['4G', '5G'],
  ['4G', '5G'],
  ['B2B'],                     // Dedicated B2B site
  ['B2B'],
  ['2G', '4G', '5G'],          // 3G decommissioned
  ['3G', '4G'],                // Mid-tier site
  ['2G', '3G', '4G', '5G'],
]

// ---------------------------------------------------------------------------
// Neighbourhood anchors — each has a real lat/lon so antennas are placed near
// the actual location the name refers to.
// Scatter sigma: ~0.003° lat (330 m) / ~0.004° lon (310 m at RO latitudes)
// ---------------------------------------------------------------------------

interface Neighborhood {
  name: string
  lat:  number
  lon:  number
}

interface CityConfig {
  name:         string
  code:         string
  antennaCount: number
  neighborhoods: Neighborhood[]
}

const CITIES: CityConfig[] = [
  {
    // 50 real landmarks → 1 antenna each = 50 total
    name: 'București', code: 'B', antennaCount: 50,
    neighborhoods: [
      { name: 'Arcul de Triumf',          lat: 44.4670, lon: 26.0735 }, // verified latitude.to
      { name: 'Gara de Nord',             lat: 44.4469, lon: 26.0744 }, // verified by user
      { name: 'Palatul Parlamentului',    lat: 44.4232, lon: 26.0858 }, // verified latitude.to
      { name: 'Sun Plaza',                lat: 44.3962, lon: 26.1231 }, // verified latitude.to
      { name: 'AFI Palace Cotroceni',     lat: 44.4247, lon: 26.0515 }, // verified latitude.to
      { name: 'Băneasa Shopping City',    lat: 44.5057, lon: 26.0890 }, // verified latitude.to
      { name: 'Herăstrău Park',           lat: 44.4690, lon: 26.0761 }, // verified latitude.to
      { name: 'ParkLake Mall',            lat: 44.4203, lon: 26.1485 }, // verified flatlong.com
      { name: 'Arena Națională',          lat: 44.4357, lon: 26.1515 }, // verified latitude.to
      { name: 'Piața Unirii',             lat: 44.4235, lon: 26.1013 }, // verified latitude.to
      { name: 'Piața Victoriei',          lat: 44.4516, lon: 26.0871 }, // verified latitude.to
      { name: 'Piața Romană',             lat: 44.4415, lon: 26.0913 }, // verified latitude.to
      { name: 'Universitatea București',  lat: 44.4347, lon: 26.1007 }, // verified latitude.to
      { name: 'Politehnica',              lat: 44.4363, lon: 26.0508 }, // verified latitude.to
      { name: 'Piața Obor',              lat: 44.4503, lon: 26.1245 }, // verified latitude.to
      { name: 'Romexpo',                  lat: 44.4763, lon: 26.0651 }, // verified latitude.to
      { name: 'Cișmigiu',                 lat: 44.4356, lon: 26.0877 }, // verified latitude.to
      { name: 'București Mall',           lat: 44.4188, lon: 26.1226 }, // verified latitude.to
      { name: 'Gara Basarab',             lat: 44.4503, lon: 26.0672 }, // verified latitude.to
      { name: 'Piața Gorjului',           lat: 44.4290, lon: 26.0089 },
      { name: 'Parcul Tineretului',       lat: 44.4051, lon: 26.1005 },
      { name: 'Piața Drumul Taberei',     lat: 44.4145, lon: 26.0258 },
      { name: 'Colosseum Mall',           lat: 44.4858, lon: 26.0028 },
      { name: 'Spitalul Fundeni',         lat: 44.4577, lon: 26.1736 },
      { name: 'Ateneul Român',            lat: 44.4397, lon: 26.0978 },
      { name: 'Promenada Mall',           lat: 44.4782, lon: 26.1034 },
      { name: 'Mega Mall',                lat: 44.4418, lon: 26.1530 },
      { name: 'Sala Palatului',           lat: 44.4368, lon: 26.0903 },
      { name: 'Liberty Center',           lat: 44.4153, lon: 26.0799 },
      { name: 'Piața Rosetti',            lat: 44.4363, lon: 26.1066 },
      { name: 'Piața Charles de Gaulle',  lat: 44.4661, lon: 26.0864 },
      { name: 'Parcul Floreasca',         lat: 44.4647, lon: 26.0980 },
      { name: 'Piața Iancului',           lat: 44.4409, lon: 26.1329 },
      { name: 'Piața Amzei',              lat: 44.4444, lon: 26.0950 },
      { name: 'Piața Sudului',            lat: 44.4090, lon: 26.1010 },
      { name: 'Piața Domenii',            lat: 44.4590, lon: 26.0700 },
      { name: 'Piața Lahovari',           lat: 44.4490, lon: 26.0890 },
      { name: 'Stadionul Giulești',       lat: 44.4545, lon: 26.0692 },
      { name: 'Parcul Circului',          lat: 44.4600, lon: 26.1320 },
      { name: 'Piața Operei',             lat: 44.4290, lon: 26.0870 },
      { name: 'Dristor',                  lat: 44.4295, lon: 26.1360 },
      { name: 'Gara Progresul',           lat: 44.4030, lon: 26.0760 },
      { name: 'Gara Titan Sud',           lat: 44.4180, lon: 26.1600 },
      { name: 'Piața Berceni',            lat: 44.3950, lon: 26.1020 },
      { name: 'Vitan Mall',               lat: 44.4170, lon: 26.1210 },
      { name: 'Piața Revoluției',         lat: 44.4406, lon: 26.0965 },
      { name: 'Cotroceni',                lat: 44.4346, lon: 26.0673 },
      { name: 'Piața Timpuri Noi',        lat: 44.4200, lon: 26.1080 },
      { name: 'Piața Floreasca',          lat: 44.4680, lon: 26.0930 },
      { name: 'Piața Alba Iulia',         lat: 44.4160, lon: 26.1150 },
    ],
  },
  {
    // 30 real landmarks → 1 antenna each = 30 total
    name: 'Cluj-Napoca', code: 'C', antennaCount: 30,
    neighborhoods: [
      { name: 'Piața Unirii',        lat: 46.7699, lon: 23.5896 }, // verified latlong.net
      { name: 'Universitatea UBB',    lat: 46.7673, lon: 23.5880 }, // verified latitude.to
      { name: 'Gara Cluj-Napoca',     lat: 46.7844, lon: 23.5864 }, // verified czech-transport
      { name: 'Iulius Mall',          lat: 46.7726, lon: 23.6269 }, // verified Waze/Wikipedia
      { name: 'Aeroport Cluj',        lat: 46.7843, lon: 23.6850 }, // verified latitude.to
      { name: 'Central Park',         lat: 46.7741, lon: 23.5978 },
      { name: 'Cluj Arena',           lat: 46.7698, lon: 23.5998 },
      { name: 'Grădina Botanică',     lat: 46.7558, lon: 23.5873 },
      { name: 'SCJU Cluj',            lat: 46.7762, lon: 23.5726 },
      { name: 'Piața Mărăști',        lat: 46.7846, lon: 23.5955 },
      { name: 'Vivo Mall',            lat: 46.7512, lon: 23.5412 },
      { name: 'Piața Grigorescu',     lat: 46.7549, lon: 23.6234 },
      { name: 'Kaufland Gheorgheni',  lat: 46.7419, lon: 23.6236 },
      { name: 'Kaufland Mănăștur',    lat: 46.7573, lon: 23.5558 },
      { name: 'Piața Someșeni',       lat: 46.7897, lon: 23.6336 },
      { name: 'Technical University Cluj', lat: 46.7667, lon: 23.5833 },
      { name: 'Piața Avram Iancu',    lat: 46.7706, lon: 23.5937 },
      { name: 'Piața Mihai Viteazu',  lat: 46.7742, lon: 23.5986 },
      { name: 'CFR Cluj Stadium',     lat: 46.7790, lon: 23.5720 },
      { name: 'Florești',             lat: 46.7457, lon: 23.4938 },
      { name: 'Spitalul de Urgență Cluj', lat: 46.7640, lon: 23.5750 },
      { name: 'Piața Lucian Blaga',   lat: 46.7630, lon: 23.5780 },
      { name: 'Horia Demian Arena',   lat: 46.7620, lon: 23.5940 },
      { name: 'Mănăștur',             lat: 46.7600, lon: 23.5500 },
      { name: 'Piața Mică Cluj',      lat: 46.7696, lon: 23.5886 },
      { name: 'Parcul Babeș',         lat: 46.7630, lon: 23.5820 },
      { name: 'Carrefour Iris Cluj',  lat: 46.7512, lon: 23.6234 },
      { name: 'Piața 14 Iulie Cluj',  lat: 46.7770, lon: 23.5930 },
      { name: 'Piața Cipariu Cluj',   lat: 46.7720, lon: 23.5955 },
      { name: 'Cartier Zorilor Cluj', lat: 46.7530, lon: 23.5900 },
    ],
  },
  {
    // 15 real landmarks → 2 antennas each = 30 total
    name: 'Timișoara', code: 'T', antennaCount: 30,
    neighborhoods: [
      { name: 'Piața Victoriei',       lat: 45.7538, lon: 21.2257 }, // verified latitude.to
      { name: 'Gara Timișoara Nord',   lat: 45.7509, lon: 21.2078 }, // verified from search
      { name: 'Iulius Town',           lat: 45.7667, lon: 21.2286 }, // verified Waze
      { name: 'Piața Unirii',          lat: 45.7568, lon: 21.2265 },
      { name: 'Catedrala Mitropolitană', lat: 45.7521, lon: 21.2264 },
      { name: 'Universitatea de Vest', lat: 45.7470, lon: 21.2265 },
      { name: 'Stadionul Dan Păltinișanu', lat: 45.7418, lon: 21.2155 },
      { name: 'Piața Traian',          lat: 45.7592, lon: 21.2371 },
      { name: 'Spitalul Județean',     lat: 45.7457, lon: 21.2355 },
      { name: 'Parcul Rozelor',        lat: 45.7589, lon: 21.2209 },
      { name: 'Piața Dorobanților',    lat: 45.7672, lon: 21.2264 },
      { name: 'Calea Aradului',        lat: 45.7721, lon: 21.2447 },
      { name: 'Fabric (Piața Traian)', lat: 45.7607, lon: 21.2419 },
      { name: 'Freidorf',              lat: 45.7194, lon: 21.1923 },
      { name: 'Mehala',                lat: 45.7534, lon: 21.1852 },
      { name: 'Parcul Botanic',        lat: 45.7600, lon: 21.2247 },
      { name: 'Piața Timișoara 700',   lat: 45.7581, lon: 21.2249 },
      { name: 'Piața Nicolae Bălcescu', lat: 45.7413, lon: 21.2264 },
      { name: 'Complexul Studențesc',  lat: 45.7470, lon: 21.2300 },
      { name: 'Spitalul Pius Brînzeu', lat: 45.7530, lon: 21.2500 },
      { name: 'Piața Dacia',           lat: 45.7600, lon: 21.2410 },
      { name: 'Calea Bogdăneștilor',   lat: 45.7430, lon: 21.2570 },
      { name: 'Piața 1 Decembrie',     lat: 45.7390, lon: 21.2280 },
      { name: 'Piața Badea Cârțan',    lat: 45.7550, lon: 21.2380 },
      { name: 'Calea Lipovei',         lat: 45.7360, lon: 21.2250 },
      { name: 'Stadionul CFR',         lat: 45.7600, lon: 21.2340 },
      { name: 'Gara Timișoara Est',    lat: 45.7575, lon: 21.2560 },
      { name: 'Piața Consiliul Europei', lat: 45.7480, lon: 21.2270 },
      { name: 'Parcul Fratelia',       lat: 45.7350, lon: 21.2150 },
      { name: 'Piața Michelangelo',    lat: 45.7490, lon: 21.2430 },
    ],
  },
  {
    // 15 real landmarks → 2 antennas each = 30 total
    name: 'Iași', code: 'I', antennaCount: 30,
    neighborhoods: [
      { name: 'Palas Mall',            lat: 47.1577, lon: 27.5895 }, // verified tripexpress
      { name: 'Gara Iași',             lat: 47.1656, lon: 27.5699 }, // verified from search
      { name: 'Parcul Copou',          lat: 47.1788, lon: 27.5672 }, // verified from search
      { name: 'Palatul Culturii',      lat: 47.1573, lon: 27.5869 }, // verified from search
      { name: 'Universitatea UAIC',    lat: 47.1563, lon: 27.5892 },
      { name: 'Piața Unirii',          lat: 47.1590, lon: 27.5866 },
      { name: 'Spital Sf. Spiridon',   lat: 47.1606, lon: 27.5959 },
      { name: 'Piața Nicolina',        lat: 47.1381, lon: 27.6040 },
      { name: 'Piața Dacia',           lat: 47.1627, lon: 27.6287 },
      { name: 'Grădina Botanică',      lat: 47.1800, lon: 27.5744 },
      { name: 'Campus T. Vladimirescu', lat: 47.1790, lon: 27.6121 },
      { name: 'Piața Tătărași',        lat: 47.1424, lon: 27.6179 },
      { name: 'Carrefour Felicia',     lat: 47.1775, lon: 27.6258 },
      { name: 'Mânăstirea Galata',     lat: 47.1280, lon: 27.5666 },
      { name: 'Piața Alexandru cel Bun', lat: 47.1527, lon: 27.5787 },
      { name: 'Catedrala Mitropolitană Iași', lat: 47.1615, lon: 27.5821 },
      { name: 'Aeroportul Iași',       lat: 47.1740, lon: 27.6187 },
      { name: 'Mall Moldova',          lat: 47.1672, lon: 27.5133 },
      { name: 'Podu Roș',              lat: 47.1514, lon: 27.5883 },
      { name: 'Spitalul de Recuperare', lat: 47.1780, lon: 27.5750 },
      { name: 'Universitatea de Medicină', lat: 47.1580, lon: 27.5840 },
      { name: 'Mânăstirea Cetățuia',   lat: 47.1480, lon: 27.5740 },
      { name: 'Stadionul Emil Alexandrescu', lat: 47.1710, lon: 27.5720 },
      { name: 'Gara Nicolina',         lat: 47.1350, lon: 27.5700 },
      { name: 'Piața Voievozilor',     lat: 47.1480, lon: 27.6050 },
      { name: 'Cartier Bucium',        lat: 47.1300, lon: 27.5600 },
      { name: 'Piața Eminescu',        lat: 47.1600, lon: 27.5900 },
      { name: 'Piața Târgu Cucu',      lat: 47.1570, lon: 27.5896 },
      { name: 'Piața Metalurgie',      lat: 47.1460, lon: 27.6200 },
      { name: 'Cartier CUG',           lat: 47.1400, lon: 27.5900 },
    ],
  },
  {
    // 10 real landmarks → 2 antennas each = 20 total
    name: 'Constanța', code: 'K', antennaCount: 20,
    neighborhoods: [
      { name: 'Cazinoul Constanța',    lat: 44.1762, lon: 28.6534 },
      { name: 'Portul Constanța',      lat: 44.1553, lon: 28.6622 },
      { name: 'Universitatea Ovidius', lat: 44.1944, lon: 28.6504 }, // verified maps.me
      { name: 'Gara Constanța',        lat: 44.1771, lon: 28.6343 },
      { name: 'Aqua Magic Mamaia',     lat: 44.2268, lon: 28.6387 },
      { name: 'Tomis Mall',            lat: 44.1651, lon: 28.6264 },
      { name: 'Plaja Modern',          lat: 44.1694, lon: 28.6678 },
      { name: 'Piața Ovidiu',          lat: 44.1769, lon: 28.6547 },
      { name: 'Spital Județean',       lat: 44.1842, lon: 28.6231 },
      { name: 'Kaufland Constanța',    lat: 44.1625, lon: 28.6069 },
      { name: 'Stadionul Farul',       lat: 44.1973, lon: 28.6393 },
      { name: 'Delfinariu',            lat: 44.2055, lon: 28.6431 },
      { name: 'Mamaia Resort',         lat: 44.2338, lon: 28.6256 },
      { name: 'Lacul Siutghiol',       lat: 44.2529, lon: 28.6008 },
      { name: 'Faleza Nord',           lat: 44.1850, lon: 28.6600 },
      { name: 'Moscheea Mare',         lat: 44.1760, lon: 28.6480 },
      { name: 'Academia Navală',       lat: 44.1680, lon: 28.6280 },
      { name: 'Piața Republicii',      lat: 44.1810, lon: 28.6330 },
      { name: 'Mamaia Nord',           lat: 44.2750, lon: 28.6330 },
      { name: 'Stațiunea Eforie Nord', lat: 44.0860, lon: 28.6330 },
    ],
  },
  {
    // 10 real landmarks → 2 antennas each = 20 total
    name: 'Craiova', code: 'V', antennaCount: 20,
    neighborhoods: [
      { name: 'Centrul Vechi',         lat: 44.3193, lon: 23.7949 },
      { name: 'Gara Craiova',          lat: 44.3298, lon: 23.7994 },
      { name: 'Electroputere Mall',    lat: 44.3100, lon: 23.8089 },
      { name: 'Universitatea Craiova', lat: 44.3233, lon: 23.7975 },
      { name: 'Parcul Romanescu',      lat: 44.3252, lon: 23.7732 },
      { name: 'Piața Centrală',        lat: 44.3179, lon: 23.7966 },
      { name: 'Spital Județean',       lat: 44.3256, lon: 23.8017 },
      { name: 'Kaufland Craiova',      lat: 44.3050, lon: 23.7889 },
      { name: 'Piața Brestei',         lat: 44.3120, lon: 23.7762 },
      { name: 'Piața 1 Mai',           lat: 44.3120, lon: 23.8271 },
      { name: 'Stadionul Ion Oblemenco', lat: 44.3083, lon: 23.7838 },
      { name: 'Piața Mihai Viteazul',  lat: 44.3181, lon: 23.7949 },
      { name: 'Hipodromul Craiova',    lat: 44.2952, lon: 23.8091 },
      { name: 'Parcul Tineretului',    lat: 44.3100, lon: 23.8050 },
      { name: 'Spitalul Filantropia',  lat: 44.3240, lon: 23.8060 },
      { name: 'Piața Craiovița',       lat: 44.3400, lon: 23.7900 },
      { name: 'Universitatea de Medicină Craiova', lat: 44.3170, lon: 23.7960 },
      { name: 'Colegiul Carol I',      lat: 44.3182, lon: 23.7885 },
      { name: 'Bulevardul Oltenia',    lat: 44.3357, lon: 23.7831 },
      { name: 'Piața Gării Craiova',   lat: 44.3240, lon: 23.7990 },
    ],
  },
  {
    // 10 real landmarks → 2 antennas each = 20 total
    name: 'Brașov', code: 'R', antennaCount: 20,
    neighborhoods: [
      { name: 'Piața Sfatului',        lat: 45.6408, lon: 25.5883 }, // verified from search
      { name: 'Gara Brașov',           lat: 45.6501, lon: 25.6108 },
      { name: 'Mall Coresi',           lat: 45.6517, lon: 25.6226 },
      { name: 'Universitatea Transilvania', lat: 45.6478, lon: 25.6094 },
      { name: 'Stadionul Tineretului', lat: 45.6530, lon: 25.6175 },
      { name: 'Bartolomeu',            lat: 45.6652, lon: 25.5540 },
      { name: 'Parcul Sub Tâmpa',      lat: 45.6414, lon: 25.5979 },
      { name: 'Spitalul Județean',     lat: 45.6432, lon: 25.6085 },
      { name: 'Tractorul',             lat: 45.6542, lon: 25.6312 },
      { name: 'Piața Unirii Brașov',   lat: 45.6431, lon: 25.5933 },
      { name: 'Biserica Neagră',       lat: 45.6411, lon: 25.5882 },
      { name: 'Poiana Brașov',         lat: 45.5967, lon: 25.5562 },
      { name: 'Tâmpa',                lat: 45.6400, lon: 25.5950 },
      { name: 'Piața 15 Noiembrie',    lat: 45.6520, lon: 25.6080 },
      { name: 'Bulevardul Gării',      lat: 45.6600, lon: 25.6120 },
      { name: 'Stadionul Municipal',   lat: 45.6545, lon: 25.5692 },
      { name: 'Cartier Noua',          lat: 45.6700, lon: 25.6300 },
      { name: 'Piața Unirii Centru',   lat: 45.6440, lon: 25.5910 },
      { name: 'Astra Brașov',          lat: 45.6600, lon: 25.5750 },
      { name: 'Piața Aurel Vlaicu',    lat: 45.6480, lon: 25.6200 },
    ],
  },
  {
    // 10 real landmarks → 2 antennas each = 20 total
    name: 'Galați', code: 'G', antennaCount: 20,
    neighborhoods: [
      { name: 'Portul Galați',         lat: 45.4353, lon: 28.0493 },
      { name: 'Gara Galați',           lat: 45.4353, lon: 28.0390 },
      { name: 'Dunărea Mall',          lat: 45.4551, lon: 28.0440 },
      { name: 'Universitatea Dunărea de Jos', lat: 45.4501, lon: 28.0290 },
      { name: 'Spital Județean',       lat: 45.4353, lon: 28.0180 },
      { name: 'Piața Centrală',        lat: 45.4453, lon: 28.0380 },
      { name: 'Parcul Rizer',          lat: 45.4353, lon: 27.9980 },
      { name: 'Piața Energiei',        lat: 45.4453, lon: 28.0480 },
      { name: 'Piața Micro 21',        lat: 45.4153, lon: 28.0381 },
      { name: 'Piața Mazepa',          lat: 45.4553, lon: 28.0280 },
      { name: 'Stadionul Oțelul',      lat: 45.4550, lon: 28.0430 },
      { name: 'Faleza Galați',         lat: 45.4600, lon: 28.0600 },
      { name: 'Teatrul Dramatic',      lat: 45.4490, lon: 28.0510 },
      { name: 'Parcul Eminescu Galați', lat: 45.4530, lon: 28.0380 },
      { name: 'Spitalul Sf. Andrei',   lat: 45.4400, lon: 28.0350 },
      { name: 'Piața Pitar Moș',       lat: 45.4520, lon: 28.0520 },
      { name: 'Cartier IC Frimu',      lat: 45.4350, lon: 28.0250 },
      { name: 'Gara Galați Mărfuri',   lat: 45.4600, lon: 28.0750 },
      { name: 'Piața Regimentului',    lat: 45.4480, lon: 28.0470 },
      { name: 'Cartier Micro 40',      lat: 45.4300, lon: 28.0550 },
    ],
  },
  {
    // 10 real landmarks → 2 antennas each = 20 total
    name: 'Ploiești', code: 'P', antennaCount: 20,
    neighborhoods: [
      { name: 'Gara Ploiești Sud',     lat: 44.9369, lon: 26.0225 },
      { name: 'Gara Ploiești Vest',    lat: 44.9450, lon: 26.0107 },
      { name: 'Ploiești Shopping City', lat: 44.9369, lon: 26.0450 },
      { name: 'AFI Ploiești',          lat: 44.9246, lon: 26.0167 },
      { name: 'Universitatea Petrol-Gaze', lat: 44.9369, lon: 26.0282 },
      { name: 'Piața Centrală',        lat: 44.9435, lon: 26.0336 },
      { name: 'Parcul Toma Socolescu', lat: 44.9476, lon: 26.0289 },
      { name: 'Piața Enachita Văcărescu', lat: 44.9384, lon: 26.0367 },
      { name: 'Spital Județean',       lat: 44.9369, lon: 26.0169 },
      { name: 'Kaufland Ploiești',     lat: 44.9169, lon: 26.0224 },
      { name: 'Stadionul Ilie Oană',   lat: 44.9400, lon: 26.0395 },
      { name: 'Piața Victoriei Ploiești', lat: 44.9399, lon: 26.0247 },
      { name: 'Piața Mihai Viteazu',   lat: 44.9440, lon: 26.0250 },
      { name: 'Halele Centrale',       lat: 44.9450, lon: 26.0280 },
      { name: 'Spitalul Municipal',    lat: 44.9480, lon: 26.0300 },
      { name: 'Piața Eroilor',         lat: 44.9380, lon: 26.0180 },
      { name: 'Cartier Buda',          lat: 44.9300, lon: 26.0450 },
      { name: 'Piața Andrei Mureșanu', lat: 44.9520, lon: 26.0350 },
      { name: 'Parcul Mihai Viteazul', lat: 44.9430, lon: 26.0210 },
      { name: 'Piața 1 Decembrie',     lat: 44.9510, lon: 26.0230 },
    ],
  },
  {
    // 10 real landmarks → 2 antennas each = 20 total
    name: 'Oradea', code: 'O', antennaCount: 22,
    neighborhoods: [
      { name: 'Cetatea Oradea',        lat: 47.0621, lon: 21.9378 },
      { name: 'Gara Oradea',           lat: 47.0556, lon: 21.9229 },
      { name: 'ERA Shopping Park',     lat: 47.0889, lon: 21.9399 },
      { name: 'Universitatea Oradea',  lat: 47.0407, lon: 21.9187 }, // verified latitude.to
      { name: 'Parcul Petőfi',         lat: 47.0700, lon: 21.9271 },
      { name: 'Piața Unirii',          lat: 47.0622, lon: 21.9293 },
      { name: 'Spital Municipal',      lat: 47.0666, lon: 21.9164 },
      { name: 'Lotus Center',          lat: 47.0800, lon: 21.9344 },
      { name: 'Piața Emanuil Gojdu',   lat: 47.0617, lon: 21.9362 },
      { name: 'Nufărul',               lat: 47.0508, lon: 21.9258 },
      { name: 'Piața Ferdinand',       lat: 47.0564, lon: 21.9293 },
      { name: 'Spitalul Județean Bihor', lat: 47.0610, lon: 21.9280 },
      { name: 'Piața Republicii Oradea', lat: 47.0630, lon: 21.9310 },
      { name: 'Velodromul Oradea',     lat: 47.0500, lon: 21.9400 },
      { name: 'Cartier Ioșia',         lat: 47.0480, lon: 21.9500 },
      { name: 'Piața 1 Decembrie Oradea', lat: 47.0680, lon: 21.9280 },
      { name: 'Stadionul Municipal Oradea', lat: 47.0550, lon: 21.9350 },
      { name: 'Spitalul Gavril Curteanu', lat: 47.0620, lon: 21.9330 },
      { name: 'Piața Independenței',   lat: 47.0590, lon: 21.9420 },
      { name: 'Cartier Grigorescu Oradea', lat: 47.0450, lon: 21.9300 },
    ],
  },
]

// ---------------------------------------------------------------------------
// Deterministic PRNG — LCG, seeded per city so positions are stable across runs
// ---------------------------------------------------------------------------
function seededRandom(seed: number): () => number {
  let s = seed >>> 0
  return function () {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0
    return s / 4294967296
  }
}

// Place `count` antennas by cycling through neighbourhood anchors and
// scattering each one within ~300-400 m of its anchor using Box-Muller.
function generatePositions(
  city: CityConfig,
  rng: () => number,
): Array<{ name: string; lat: number; lon: number }> {
  const SIGMA_LAT = 0.0003  // ~33 m — places antenna ~30-60 m from landmark
  const SIGMA_LON = 0.00036 // ~28 m at Romanian latitudes
  const positions: Array<{ name: string; lat: number; lon: number }> = []
  for (let i = 0; i < city.antennaCount; i++) {
    const anchor = city.neighborhoods[i % city.neighborhoods.length]
    const u1  = Math.max(rng(), 1e-10)
    const u2  = rng()
    const mag = Math.sqrt(-2 * Math.log(u1))
    const z0  = mag * Math.cos(2 * Math.PI * u2)
    const z1  = mag * Math.sin(2 * Math.PI * u2)
    positions.push({
      name: anchor.name,
      lat:  Math.round((anchor.lat + z0 * SIGMA_LAT) * 1e6) / 1e6,
      lon:  Math.round((anchor.lon + z1 * SIGMA_LON) * 1e6) / 1e6,
    })
  }
  return positions
}

// Deterministic site number — city band starts at (cityIndex+1)*1000,
// slot offset is 1-based. Produces unique 4-digit IDs for up to 99 slots/city.
function siteNumber(cityIndex: number, slotIndex: number): string {
  return String((cityIndex + 1) * 1000 + slotIndex + 1).padStart(4, '0')
}

// Draw a random status from STATUS_SLOTS distribution
function drawStatus(rng: () => number): AlarmSeverity {
  return STATUS_SLOTS[Math.floor(rng() * STATUS_SLOTS.length)]
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

  const topologyBatch = db.batch()
  const alarmBatch    = db.batch()
  const incidentBatch = db.batch()

  for (let ci = 0; ci < CITIES.length; ci++) {
    const city = CITIES[ci]
    const rng  = seededRandom(ci * 9999 + 42)
    const positions = generatePositions(city, rng)

    for (let i = 0; i < city.antennaCount; i++) {
      const num      = siteNumber(ci, i)
      const siteId   = `${city.code}${num}`
      const id       = siteId.toLowerCase()
      const provider = PROVIDERS[i % PROVIDERS.length]
      const bundle   = CELL_BUNDLES[i % CELL_BUNDLES.length]

      const { name: area, lat, lon } = positions[i]

      const antennaRef = db.collection('topology').doc(id)

      // Build cells — each cell gets its own deterministic status
      const cells: object[] = []

      for (let ci2 = 0; ci2 < bundle.length; ci2++) {
        const tech   = bundle[ci2]
        const status = drawStatus(rng)

        let currentAlarm: object | undefined = undefined

        if (status !== 'ok') {
          const template  = pickAlarm(status, i + ci2)
          const alarmId   = `${id}-${tech.toLowerCase()}-alarm-active`
          const alarmRef  = db.collection('alarms').doc(alarmId)

          const alarmTime  = new Date(Date.now() - 1000 * 60 * (30 + i * 17 + ci2 * 11)).toISOString()
          const alarmStatus = 1

          const alarm = {
            antennaId:   id,
            siteId,
            technology:  tech,
            alarmNumber: template.alarmNumber,
            severity:    status,
            text:        template.text,
            alarmStatus,
            alarmTime,
            cancelTime:  null,
            resolved:    false,
          }

          alarmBatch.set(alarmRef, alarm)
          currentAlarm = { id: alarmId, ...alarm }

          // Linked incident
          const incidentId     = nextIncidentId()
          const incidentRef    = db.collection('incidents').doc(incidentId)
          const incidentStatus = status === 'critical' ? 'IN PROGRESS' : 'ASSIGNED'
          const assignee       = ASSIGNEES[(ci + i + ci2) % ASSIGNEES.length]

          incidentBatch.set(incidentRef, {
            incidentNumber: incidentId,
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

        cells.push({
          technology: tech,
          status,
          ...(currentAlarm ? { currentAlarm } : {}),
        })
      }

      topologyBatch.set(antennaRef, {
        name:      `${city.name} ${area}`,
        siteId,
        provider,
        latitude:  lat,
        longitude: lon,
        cells,
      })
    }
  }

  await topologyBatch.commit()
  console.log('Topology written.')

  await alarmBatch.commit()
  console.log('Alarms written.')

  await incidentBatch.commit()
  console.log('Incidents written.')

  const total = CITIES.reduce((sum, c) => sum + c.antennaCount, 0)
  console.log(`Done — seeded ${total} topology sites, ${incidentCounter - 1} incidents across ${CITIES.length} cities.`)
}

seed().catch((err) => {
  console.error(err)
  process.exit(1)
})
