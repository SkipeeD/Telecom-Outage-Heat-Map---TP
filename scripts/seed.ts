import { config } from 'dotenv'
import { resolve } from 'path'

// Load .env.local from project root before anything else
config({ path: resolve(process.cwd(), '.env.local') })

import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import type { DocumentReference } from 'firebase-admin/firestore'
import type { Technology, AlarmSeverity, Alarm } from '../src/types'

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

// Realistic alarm probability per cell — real NOC networks run at ~5% alarm rate.
// More alarms than this looks like a network-wide outage.
//   critical: 0.5%   major: 1.0%   minor: 1.5%   warning: 2.0%   ok: 95%


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
  ['6G'],                      // Dedicated 6G site
  ['6G'],
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
      { name: 'Arcul de Triumf',          lat: 44.4670, lon: 26.0735 },
      { name: 'Gara de Nord',             lat: 44.4469, lon: 26.0744 },
      { name: 'Palatul Parlamentului',    lat: 44.4232, lon: 26.0858 },
      { name: 'Sun Plaza',                lat: 44.3962, lon: 26.1231 },
      { name: 'AFI Palace Cotroceni',     lat: 44.4247, lon: 26.0515 },
      { name: 'Băneasa Shopping City',    lat: 44.5057, lon: 26.0890 },
      { name: 'Herăstrău Park',           lat: 44.4690, lon: 26.0761 },
      { name: 'ParkLake Mall',            lat: 44.4203, lon: 26.1485 },
      { name: 'Arena Națională',          lat: 44.4357, lon: 26.1515 },
      { name: 'Piața Unirii',             lat: 44.4235, lon: 26.1013 },
      { name: 'Piața Victoriei',          lat: 44.4516, lon: 26.0871 },
      { name: 'Piața Romană',             lat: 44.4415, lon: 26.0913 },
      { name: 'Universitatea București',  lat: 44.4347, lon: 26.1007 },
      { name: 'Politehnica',              lat: 44.4363, lon: 26.0508 },
      { name: 'Piața Obor',              lat: 44.4503, lon: 26.1245 },
      { name: 'Romexpo',                  lat: 44.4763, lon: 26.0651 },
      { name: 'Cișmigiu',                 lat: 44.4356, lon: 26.0877 },
      { name: 'București Mall',           lat: 44.4188, lon: 26.1226 },
      { name: 'Gara Basarab',             lat: 44.4503, lon: 26.0672 },
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

    name: 'Cluj-Napoca', code: 'C', antennaCount: 30,
    neighborhoods: [
      { name: 'Piața Unirii',        lat: 46.7699, lon: 23.5896 },
      { name: 'Universitatea UBB',    lat: 46.7673, lon: 23.5880 },
      { name: 'Gara Cluj-Napoca',     lat: 46.7844, lon: 23.5864 },
      { name: 'Iulius Mall',          lat: 46.7726, lon: 23.6269 },
      { name: 'Aeroport Cluj',        lat: 46.7843, lon: 23.6850 },
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

    name: 'Timișoara', code: 'T', antennaCount: 30,
    neighborhoods: [
      { name: 'Piața Victoriei',       lat: 45.7538, lon: 21.2257 },
      { name: 'Gara Timișoara Nord',   lat: 45.7509, lon: 21.2078 },
      { name: 'Iulius Town',           lat: 45.7667, lon: 21.2286 },
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
    name: 'Iași', code: 'I', antennaCount: 30,
    neighborhoods: [
      { name: 'Palas Mall',            lat: 47.1577, lon: 27.5895 },
      { name: 'Gara Iași',             lat: 47.1656, lon: 27.5699 },
      { name: 'Parcul Copou',          lat: 47.1788, lon: 27.5672 },
      { name: 'Palatul Culturii',      lat: 47.1573, lon: 27.5869 },
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
    name: 'Constanța', code: 'K', antennaCount: 20,
    neighborhoods: [
      { name: 'Cazinoul Constanța',    lat: 44.1762, lon: 28.6534 },
      { name: 'Portul Constanța',      lat: 44.1553, lon: 28.6622 },
      { name: 'Universitatea Ovidius', lat: 44.1944, lon: 28.6504 },
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
    name: 'Brașov', code: 'R', antennaCount: 20,
    neighborhoods: [
      { name: 'Piața Sfatului',        lat: 45.6408, lon: 25.5883 },
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
    name: 'Oradea', code: 'O', antennaCount: 22,
    neighborhoods: [
      { name: 'Cetatea Oradea',        lat: 47.0621, lon: 21.9378 },
      { name: 'Gara Oradea',           lat: 47.0556, lon: 21.9229 },
      { name: 'ERA Shopping Park',     lat: 47.0889, lon: 21.9399 },
      { name: 'Universitatea Oradea',  lat: 47.0407, lon: 21.9187 },
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
  {
    name: 'Alba Iulia', code: 'AB', antennaCount: 8,
    neighborhoods: [
      { name: 'Cetatea Alba Carolina',      lat: 46.0636, lon: 23.5729 },
      { name: 'Piața Iuliu Maniu',           lat: 46.0648, lon: 23.5793 },
      { name: 'Gara Alba Iulia',             lat: 46.0769, lon: 23.5713 },
      { name: 'Universitatea 1 Decembrie',   lat: 46.0591, lon: 23.5809 },
      { name: 'Spital Județean Alba',        lat: 46.0650, lon: 23.5870 },
      { name: 'Piața Cetății',               lat: 46.0645, lon: 23.5736 },
      { name: 'Piața Consiliului',           lat: 46.0685, lon: 23.5790 },
      { name: 'Mall Alba',                   lat: 46.0590, lon: 23.5750 },
    ],
  },
  {
    name: 'Arad', code: 'AR', antennaCount: 15,
    neighborhoods: [
      { name: 'Piața Avram Iancu',           lat: 46.1830, lon: 21.3126 },
      { name: 'Gara Arad',                   lat: 46.1716, lon: 21.3108 },
      { name: 'Complexul Mureșul',           lat: 46.1960, lon: 21.3190 },
      { name: 'Universitatea Aurel Vlaicu',  lat: 46.1780, lon: 21.3380 },
      { name: 'Spital Județean Arad',        lat: 46.1840, lon: 21.3260 },
      { name: 'Teatrul Ioan Slavici',        lat: 46.1836, lon: 21.3130 },
      { name: 'Parcul Reconcilierii',        lat: 46.1874, lon: 21.3163 },
      { name: 'Piața Podgoria',              lat: 46.1760, lon: 21.3060 },
      { name: 'Piața Mihai Viteazul',        lat: 46.1812, lon: 21.3100 },
      { name: 'Cetatea Aradului',            lat: 46.1738, lon: 21.2947 },
      { name: 'Piața 6 Vânători',            lat: 46.1700, lon: 21.3150 },
      { name: 'Stadionul Francisc Neuman',   lat: 46.1930, lon: 21.3250 },
      { name: 'Mall Atrium Arad',            lat: 46.1930, lon: 21.3300 },
      { name: 'Piața Catedralei',            lat: 46.1826, lon: 21.3131 },
      { name: 'Gara Arad Vest',              lat: 46.1750, lon: 21.3000 },
    ],
  },
  {
    name: 'Pitești', code: 'AG', antennaCount: 15,
    neighborhoods: [
      { name: 'Piața Vasile Milea',          lat: 44.8567, lon: 24.8722 },
      { name: 'Gara Pitești',                lat: 44.8628, lon: 24.8707 },
      { name: 'Piața Prundu',                lat: 44.8527, lon: 24.8730 },
      { name: 'Universitatea Pitești',       lat: 44.8588, lon: 24.8646 },
      { name: 'Spital Județean Argeș',       lat: 44.8650, lon: 24.8780 },
      { name: 'Stadionul Nicolae Dobrin',    lat: 44.8510, lon: 24.8830 },
      { name: 'Piața Găvana',               lat: 44.8695, lon: 24.8836 },
      { name: 'Parcul Lunca Argeșului',      lat: 44.8556, lon: 24.8590 },
      { name: 'Mall Pitești',                lat: 44.8510, lon: 24.8840 },
      { name: 'Complexul Trivale',           lat: 44.8728, lon: 24.8562 },
      { name: 'Piața Tudor Vladimirescu',    lat: 44.8622, lon: 24.8752 },
      { name: 'Piața Eroilor',               lat: 44.8539, lon: 24.8693 },
      { name: 'Kaufland Pitești',            lat: 44.8480, lon: 24.8760 },
      { name: 'Piața Traian Pitești',        lat: 44.8580, lon: 24.8660 },
      { name: 'Piața 1 Decembrie Pitești',   lat: 44.8510, lon: 24.8670 },
    ],
  },
  {
    name: 'Bacău', code: 'BC', antennaCount: 12,
    neighborhoods: [
      { name: 'Piața Centrală Bacău',        lat: 46.5672, lon: 26.9130 },
      { name: 'Gara Bacău',                  lat: 46.5578, lon: 26.9070 },
      { name: 'Universitatea Bacău',         lat: 46.5692, lon: 26.9068 },
      { name: 'Spital Județean Bacău',       lat: 46.5730, lon: 26.9230 },
      { name: 'Mall Arena Bacău',            lat: 46.5570, lon: 26.9170 },
      { name: 'Piața Revoluției Bacău',      lat: 46.5680, lon: 26.9140 },
      { name: 'Parcul Cancicov',             lat: 46.5680, lon: 26.9100 },
      { name: 'Piața Mărgineni',             lat: 46.5800, lon: 26.9150 },
      { name: 'Stadionul Municipal Bacău',   lat: 46.5730, lon: 26.9100 },
      { name: 'Piața Traian Bacău',          lat: 46.5650, lon: 26.9160 },
      { name: 'Gara Bacău Sud',              lat: 46.5540, lon: 26.9120 },
      { name: 'Piața CFR Bacău',             lat: 46.5580, lon: 26.9080 },
    ],
  },
  {
    name: 'Bistrița', code: 'BN', antennaCount: 8,
    neighborhoods: [
      { name: 'Piața Centrală Bistrița',     lat: 47.1313, lon: 24.4997 },
      { name: 'Gara Bistrița',               lat: 47.1425, lon: 24.5080 },
      { name: 'Mall Bistrița',               lat: 47.1260, lon: 24.5120 },
      { name: 'Spital Județean Bistrița',    lat: 47.1343, lon: 24.5055 },
      { name: 'Piața Unirii Bistrița',       lat: 47.1315, lon: 24.4995 },
      { name: 'Parcul Central Bistrița',     lat: 47.1335, lon: 24.4960 },
      { name: 'Piața Petru Rareș',           lat: 47.1332, lon: 24.4990 },
      { name: 'Universitatea Bistrița',      lat: 47.1310, lon: 24.4950 },
    ],
  },
  {
    name: 'Botoșani', code: 'BT', antennaCount: 10,
    neighborhoods: [
      { name: 'Piața Revoluției Botoșani',   lat: 47.7466, lon: 26.6625 },
      { name: 'Gara Botoșani',               lat: 47.7350, lon: 26.6480 },
      { name: 'Spital Județean Botoșani',    lat: 47.7490, lon: 26.6700 },
      { name: 'Mall Uvertura Botoșani',      lat: 47.7450, lon: 26.6760 },
      { name: 'Parcul Mihai Eminescu',       lat: 47.7480, lon: 26.6640 },
      { name: 'Piața Mihai Eminescu',        lat: 47.7432, lon: 26.6598 },
      { name: 'Stadionul Municipal Botoșani', lat: 47.7380, lon: 26.6520 },
      { name: 'Piața 1 Decembrie',           lat: 47.7500, lon: 26.6670 },
      { name: 'Universitatea Botoșani',      lat: 47.7490, lon: 26.6650 },
      { name: 'Piața Centrală Botoșani',     lat: 47.7467, lon: 26.6625 },
    ],
  },
  {
    name: 'Brăila', code: 'BR', antennaCount: 15,
    neighborhoods: [
      { name: 'Piața Traian Brăila',         lat: 45.2694, lon: 27.9570 },
      { name: 'Gara Brăila',                 lat: 45.2773, lon: 27.9750 },
      { name: 'Portul Brăila',               lat: 45.2640, lon: 27.9740 },
      { name: 'Universitatea Brăila',        lat: 45.2660, lon: 27.9580 },
      { name: 'Spital Județean Brăila',      lat: 45.2680, lon: 27.9680 },
      { name: 'Piața Independenței Brăila',  lat: 45.2700, lon: 27.9580 },
      { name: 'Parcul Monument',             lat: 45.2730, lon: 27.9590 },
      { name: 'Mall Brăila',                 lat: 45.2580, lon: 27.9560 },
      { name: 'Piața Picardie',              lat: 45.2820, lon: 27.9560 },
      { name: 'Stadionul Municipal Brăila',  lat: 45.2740, lon: 27.9530 },
      { name: 'Piața Dorobanți Brăila',      lat: 45.2650, lon: 27.9500 },
      { name: 'Piața M. Kogălniceanu',       lat: 45.2710, lon: 27.9540 },
      { name: 'Faleza Brăila',               lat: 45.2660, lon: 27.9780 },
      { name: 'Piața Sfântu Arhangheli',     lat: 45.2790, lon: 27.9550 },
      { name: 'Cartier Hipodrom Brăila',     lat: 45.2600, lon: 27.9480 },
    ],
  },
  {
    name: 'Buzău', code: 'BZ', antennaCount: 10,
    neighborhoods: [
      { name: 'Piața Daciei Buzău',          lat: 45.1503, lon: 26.8224 },
      { name: 'Gara Buzău',                  lat: 45.1430, lon: 26.8220 },
      { name: 'Spital Județean Buzău',       lat: 45.1562, lon: 26.8228 },
      { name: 'Parcul Crâng',               lat: 45.1620, lon: 26.8170 },
      { name: 'Piața Marghiloman',           lat: 45.1560, lon: 26.8190 },
      { name: 'Stadionul Municipal Buzău',   lat: 45.1500, lon: 26.8150 },
      { name: 'Mall Buzău',                  lat: 45.1450, lon: 26.8300 },
      { name: 'Piața 1 Decembrie Buzău',     lat: 45.1480, lon: 26.8240 },
      { name: 'Universitatea Buzău',         lat: 45.1540, lon: 26.8200 },
      { name: 'Piața Centrală Buzău',        lat: 45.1500, lon: 26.8210 },
    ],
  },
  {
    name: 'Călărași', code: 'CL', antennaCount: 8,
    neighborhoods: [
      { name: 'Piața Republicii Călărași',   lat: 44.2018, lon: 27.3306 },
      { name: 'Gara Călărași',               lat: 44.2060, lon: 27.3250 },
      { name: 'Spital Județean Călărași',    lat: 44.2050, lon: 27.3280 },
      { name: 'Piața Bărăganului',           lat: 44.2000, lon: 27.3320 },
      { name: 'Parcul Lunca Dunării',        lat: 44.1960, lon: 27.3400 },
      { name: 'Piața Mihai Viteazul Călărași', lat: 44.1990, lon: 27.3310 },
      { name: 'Gara Călărași Sud',           lat: 44.1950, lon: 27.3350 },
      { name: 'Piața Dâmbovița Călărași',    lat: 44.2030, lon: 27.3260 },
    ],
  },
  {
    name: 'Sfântu Gheorghe', code: 'CV', antennaCount: 8,
    neighborhoods: [
      { name: 'Piața Libertății Sfântu Gheorghe', lat: 45.8652, lon: 25.7880 },
      { name: 'Gara Sfântu Gheorghe',        lat: 45.8600, lon: 25.7780 },
      { name: 'Spital Județean Covasna',     lat: 45.8720, lon: 25.7900 },
      { name: 'Piața 1 Decembrie Sf. Gheorghe', lat: 45.8630, lon: 25.7850 },
      { name: 'Parcul Central Sf. Gheorghe', lat: 45.8660, lon: 25.7870 },
      { name: 'Stadionul Municipal Sf. Gheorghe', lat: 45.8590, lon: 25.7920 },
      { name: 'Piața Mihai Viteazul Sf. Gheorghe', lat: 45.8680, lon: 25.7890 },
      { name: 'Universitatea Covasna',       lat: 45.8640, lon: 25.7830 },
    ],
  },
  {
    name: 'Târgoviște', code: 'DB', antennaCount: 10,
    neighborhoods: [
      { name: 'Turnul Chindiei',             lat: 44.9265, lon: 25.4568 },
      { name: 'Gara Târgoviște',             lat: 44.9370, lon: 25.4680 },
      { name: 'Piața Tricolorului',          lat: 44.9256, lon: 25.4580 },
      { name: 'Universitatea Valahia',       lat: 44.9275, lon: 25.4547 },
      { name: 'Spital Județean Dâmbovița',   lat: 44.9300, lon: 25.4620 },
      { name: 'Parcul Chindia',              lat: 44.9260, lon: 25.4560 },
      { name: 'Piața Mihai Viteazul Târgoviște', lat: 44.9240, lon: 25.4540 },
      { name: 'Stadionul Municipal Târgoviște', lat: 44.9280, lon: 25.4700 },
      { name: 'Piața Libertății Târgoviște', lat: 44.9240, lon: 25.4600 },
      { name: 'Mall Târgoviște',             lat: 44.9220, lon: 25.4510 },
    ],
  },
  {
    name: 'Giurgiu', code: 'GR', antennaCount: 8,
    neighborhoods: [
      { name: 'Piața Centrală Giurgiu',      lat: 43.9024, lon: 25.9663 },
      { name: 'Gara Giurgiu',                lat: 43.8980, lon: 25.9710 },
      { name: 'Portul Giurgiu',              lat: 43.8900, lon: 25.9750 },
      { name: 'Spital Județean Giurgiu',     lat: 43.9040, lon: 25.9640 },
      { name: 'Piața Democrației Giurgiu',   lat: 43.9020, lon: 25.9640 },
      { name: 'Piața Mihai Viteazul Giurgiu', lat: 43.9060, lon: 25.9680 },
      { name: 'Parcul Central Giurgiu',      lat: 43.9050, lon: 25.9600 },
      { name: 'Piața 1 Decembrie Giurgiu',   lat: 43.9080, lon: 25.9650 },
    ],
  },
  {
    name: 'Târgu Jiu', code: 'GJ', antennaCount: 8,
    neighborhoods: [
      { name: 'Coloana Infinitului',         lat: 45.0403, lon: 23.2869 },
      { name: 'Poarta Sărutului',            lat: 45.0300, lon: 23.2730 },
      { name: 'Gara Târgu Jiu',              lat: 45.0430, lon: 23.2720 },
      { name: 'Spital Județean Gorj',        lat: 45.0380, lon: 23.2810 },
      { name: 'Universitatea C. Brâncuși',   lat: 45.0340, lon: 23.2780 },
      { name: 'Piața Victoriei Târgu Jiu',   lat: 45.0350, lon: 23.2780 },
      { name: 'Parcul Central Târgu Jiu',    lat: 45.0360, lon: 23.2760 },
      { name: 'Piața Prefecturii',           lat: 45.0360, lon: 23.2740 },
    ],
  },
  {
    name: 'Miercurea Ciuc', code: 'HR', antennaCount: 6,
    neighborhoods: [
      { name: 'Piața Cetății Miercurea Ciuc', lat: 46.3600, lon: 25.8010 },
      { name: 'Gara Miercurea Ciuc',         lat: 46.3540, lon: 25.8050 },
      { name: 'Spital Județean Harghita',    lat: 46.3650, lon: 25.8020 },
      { name: 'Parcul Central Miercurea Ciuc', lat: 46.3600, lon: 25.8000 },
      { name: 'Stadionul Municipal Miercurea Ciuc', lat: 46.3560, lon: 25.7980 },
      { name: 'Piața Majláth',               lat: 46.3590, lon: 25.8030 },
    ],
  },
  {
    name: 'Deva', code: 'HD', antennaCount: 8,
    neighborhoods: [
      { name: 'Cetatea Devei',               lat: 45.8840, lon: 22.8961 },
      { name: 'Piața Unirii Deva',           lat: 45.8837, lon: 22.9042 },
      { name: 'Gara Deva',                   lat: 45.8900, lon: 22.9050 },
      { name: 'Spital Județean Hunedoara',   lat: 45.8860, lon: 22.9100 },
      { name: 'Piața Victoriei Deva',        lat: 45.8820, lon: 22.9000 },
      { name: 'Parcul Central Deva',         lat: 45.8840, lon: 22.9020 },
      { name: 'Mall Deva',                   lat: 45.8800, lon: 22.8980 },
      { name: 'Piața 1 Decembrie Deva',      lat: 45.8870, lon: 22.9060 },
    ],
  },
  {
    name: 'Slobozia', code: 'IL', antennaCount: 6,
    neighborhoods: [
      { name: 'Piața Republicii Slobozia',   lat: 44.5639, lon: 27.3708 },
      { name: 'Gara Slobozia',               lat: 44.5560, lon: 27.3580 },
      { name: 'Spital Județean Ialomița',    lat: 44.5680, lon: 27.3730 },
      { name: 'Piața Revoluției Slobozia',   lat: 44.5650, lon: 27.3700 },
      { name: 'Parcul Tineretului Slobozia', lat: 44.5700, lon: 27.3720 },
      { name: 'Piața Mihai Viteazul Slobozia', lat: 44.5620, lon: 27.3670 },
    ],
  },
  {
    name: 'Baia Mare', code: 'MM', antennaCount: 10,
    neighborhoods: [
      { name: 'Piața Libertății Baia Mare',  lat: 47.6567, lon: 23.5698 },
      { name: 'Gara Baia Mare',              lat: 47.6500, lon: 23.5600 },
      { name: 'Spital Județean Maramureș',   lat: 47.6550, lon: 23.5750 },
      { name: 'Universitatea de Nord',       lat: 47.6600, lon: 23.5680 },
      { name: 'Mall Baia Mare',              lat: 47.6620, lon: 23.5800 },
      { name: 'Parcul Municipal Baia Mare',  lat: 47.6550, lon: 23.5700 },
      { name: 'Piața Revoluției Baia Mare',  lat: 47.6570, lon: 23.5720 },
      { name: 'Stadionul Municipal Baia Mare', lat: 47.6490, lon: 23.5720 },
      { name: 'Piața Izvoarele',             lat: 47.6530, lon: 23.5660 },
      { name: 'Cartier Craica',              lat: 47.6500, lon: 23.5640 },
    ],
  },
  {
    name: 'Drobeta-Turnu Severin', code: 'MH', antennaCount: 10,
    neighborhoods: [
      { name: 'Piața Centrală Dr. Tr. Severin', lat: 44.6352, lon: 22.6616 },
      { name: 'Gara Drobeta-Turnu Severin',  lat: 44.6430, lon: 22.6690 },
      { name: 'Portul Turnu Severin',        lat: 44.6310, lon: 22.6720 },
      { name: 'Spital Județean Mehedinți',   lat: 44.6380, lon: 22.6680 },
      { name: 'Universitatea Mehedinți',     lat: 44.6350, lon: 22.6640 },
      { name: 'Parcul Rozelor Severin',      lat: 44.6360, lon: 22.6600 },
      { name: 'Ruinele Podului lui Traian',  lat: 44.6310, lon: 22.6590 },
      { name: 'Piața 1 Mai Severin',         lat: 44.6400, lon: 22.6660 },
      { name: 'Piața Victoriei Severin',     lat: 44.6370, lon: 22.6630 },
      { name: 'Piața Decebal Severin',       lat: 44.6340, lon: 22.6610 },
    ],
  },
  {
    name: 'Târgu Mureș', code: 'MS', antennaCount: 12,
    neighborhoods: [
      { name: 'Piața Trandafirilor',         lat: 46.5388, lon: 24.5578 },
      { name: 'Gara Târgu Mureș',            lat: 46.5270, lon: 24.5630 },
      { name: 'Spital Județean Mureș',       lat: 46.5450, lon: 24.5680 },
      { name: 'Universitatea de Medicină Târgu Mureș', lat: 46.5410, lon: 24.5600 },
      { name: 'Piața Victoriei Târgu Mureș', lat: 46.5380, lon: 24.5560 },
      { name: 'Parcul Municipal Târgu Mureș', lat: 46.5400, lon: 24.5540 },
      { name: 'Mall Plaza Mureș',            lat: 46.5270, lon: 24.5770 },
      { name: 'Stadionul Municipal Târgu Mureș', lat: 46.5330, lon: 24.5540 },
      { name: 'Aeroportul Târgu Mureș',      lat: 46.4683, lon: 24.4122 },
      { name: 'Piața Bernady György',        lat: 46.5392, lon: 24.5592 },
      { name: 'Piața Consiliului Târgu Mureș', lat: 46.5370, lon: 24.5570 },
      { name: 'Cartier Tudor',               lat: 46.5480, lon: 24.5550 },
    ],
  },
  {
    name: 'Piatra Neamț', code: 'NT', antennaCount: 10,
    neighborhoods: [
      { name: 'Piața Libertății Piatra Neamț', lat: 46.9260, lon: 26.3698 },
      { name: 'Gara Piatra Neamț',           lat: 46.9300, lon: 26.3570 },
      { name: 'Spital Județean Neamț',       lat: 46.9300, lon: 26.3750 },
      { name: 'Parcul Cozla',                lat: 46.9350, lon: 26.3690 },
      { name: 'Piața Ștefan cel Mare Piatra Neamț', lat: 46.9270, lon: 26.3685 },
      { name: 'Stadionul Ceahlăul',          lat: 46.9200, lon: 26.3640 },
      { name: 'Piața 22 Decembrie Piatra Neamț', lat: 46.9250, lon: 26.3660 },
      { name: 'Complexul Comercial Piatra Neamț', lat: 46.9230, lon: 26.3700 },
      { name: 'Universitatea Neamț',         lat: 46.9280, lon: 26.3710 },
      { name: 'Cartier Dărmănești',          lat: 46.9100, lon: 26.3780 },
    ],
  },
  {
    name: 'Slatina', code: 'OT', antennaCount: 8,
    neighborhoods: [
      { name: 'Piața Victoriei Slatina',     lat: 44.4307, lon: 24.3650 },
      { name: 'Gara Slatina',                lat: 44.4260, lon: 24.3560 },
      { name: 'Spital Județean Olt',         lat: 44.4340, lon: 24.3680 },
      { name: 'Parcul Tineretului Slatina',  lat: 44.4290, lon: 24.3640 },
      { name: 'Piața Mihai Viteazul Slatina', lat: 44.4310, lon: 24.3660 },
      { name: 'Stadionul Municipal Slatina', lat: 44.4280, lon: 24.3720 },
      { name: 'Alutus Mall',                 lat: 44.4350, lon: 24.3600 },
      { name: 'Universitatea Slatina',       lat: 44.4320, lon: 24.3630 },
    ],
  },
  {
    name: 'Zalău', code: 'SJ', antennaCount: 6,
    neighborhoods: [
      { name: 'Piața Iuliu Maniu Zalău',     lat: 47.1860, lon: 23.0576 },
      { name: 'Gara Zalău',                  lat: 47.1750, lon: 23.0490 },
      { name: 'Spital Județean Sălaj',       lat: 47.1900, lon: 23.0600 },
      { name: 'Piața Libertății Zalău',      lat: 47.1870, lon: 23.0570 },
      { name: 'Parcul Central Zalău',        lat: 47.1880, lon: 23.0550 },
      { name: 'Universitatea Zalău',         lat: 47.1840, lon: 23.0550 },
    ],
  },
  {
    name: 'Satu Mare', code: 'SM', antennaCount: 10,
    neighborhoods: [
      { name: 'Piața Libertății Satu Mare',  lat: 47.7920, lon: 22.8810 },
      { name: 'Gara Satu Mare',              lat: 47.7875, lon: 22.8847 },
      { name: 'Spital Județean Satu Mare',   lat: 47.7960, lon: 22.8830 },
      { name: 'Universitatea de Nord Satu Mare', lat: 47.7890, lon: 22.8870 },
      { name: 'Piața 25 Octombrie',          lat: 47.7930, lon: 22.8790 },
      { name: 'Parcul Someș',               lat: 47.7940, lon: 22.8830 },
      { name: 'Stadionul Municipal Satu Mare', lat: 47.7870, lon: 22.8780 },
      { name: 'Mall Satu Mare',              lat: 47.7840, lon: 22.8920 },
      { name: 'Piața Vasile Lucaciu',        lat: 47.7910, lon: 22.8800 },
      { name: 'Piața 1 Decembrie Satu Mare', lat: 47.7900, lon: 22.8840 },
    ],
  },
  {
    name: 'Sibiu', code: 'SB', antennaCount: 12,
    neighborhoods: [
      { name: 'Piața Mare Sibiu',            lat: 45.7978, lon: 24.1526 },
      { name: 'Gara Sibiu',                  lat: 45.7990, lon: 24.1420 },
      { name: 'Mall Promenada Sibiu',        lat: 45.8060, lon: 24.1580 },
      { name: 'Universitatea Lucian Blaga',  lat: 45.7950, lon: 24.1480 },
      { name: 'Spital Județean Sibiu',       lat: 45.7920, lon: 24.1540 },
      { name: 'Piața Mică Sibiu',            lat: 45.7971, lon: 24.1535 },
      { name: 'Piața Unirii Sibiu',          lat: 45.7990, lon: 24.1510 },
      { name: 'Parcul Sub Arini',            lat: 45.7910, lon: 24.1510 },
      { name: 'Piața Cibin',                 lat: 45.8000, lon: 24.1450 },
      { name: 'Aeroportul Sibiu',            lat: 45.7856, lon: 24.0919 },
      { name: 'Stadionul Municipal Sibiu',   lat: 45.7930, lon: 24.1450 },
      { name: 'Cartier Hipodrom Sibiu',      lat: 45.8040, lon: 24.1590 },
    ],
  },
  {
    name: 'Suceava', code: 'SV', antennaCount: 10,
    neighborhoods: [
      { name: 'Piața 22 Decembrie Suceava',  lat: 47.6390, lon: 26.2503 },
      { name: 'Gara Suceava',                lat: 47.6480, lon: 26.2720 },
      { name: 'Cetatea de Scaun Suceava',    lat: 47.6430, lon: 26.2560 },
      { name: 'Universitatea Ștefan cel Mare', lat: 47.6350, lon: 26.2450 },
      { name: 'Spital Județean Suceava',     lat: 47.6380, lon: 26.2520 },
      { name: 'Parcul Municipal Suceava',    lat: 47.6400, lon: 26.2480 },
      { name: 'Mall Iulius Suceava',         lat: 47.6310, lon: 26.2440 },
      { name: 'Piața 1 Decembrie Suceava',   lat: 47.6420, lon: 26.2540 },
      { name: 'Stadionul Municipal Suceava', lat: 47.6350, lon: 26.2580 },
      { name: 'Piața Centrală Suceava',      lat: 47.6390, lon: 26.2510 },
    ],
  },
  {
    name: 'Alexandria', code: 'TR', antennaCount: 6,
    neighborhoods: [
      { name: 'Piața Libertății Alexandria', lat: 43.9752, lon: 25.3366 },
      { name: 'Gara Alexandria',             lat: 43.9700, lon: 25.3310 },
      { name: 'Spital Județean Teleorman',   lat: 43.9790, lon: 25.3400 },
      { name: 'Parcul Tineretului Alexandria', lat: 43.9770, lon: 25.3380 },
      { name: 'Piața Dunării Alexandria',    lat: 43.9740, lon: 25.3350 },
      { name: 'Piața 1 Decembrie Alexandria', lat: 43.9760, lon: 25.3340 },
    ],
  },
  {
    name: 'Tulcea', code: 'TL', antennaCount: 8,
    neighborhoods: [
      { name: 'Piața Civică Tulcea',         lat: 45.1787, lon: 28.8028 },
      { name: 'Portul Tulcea',               lat: 45.1720, lon: 28.8040 },
      { name: 'Gara Tulcea',                 lat: 45.1760, lon: 28.7920 },
      { name: 'Spital Județean Tulcea',      lat: 45.1820, lon: 28.8060 },
      { name: 'Universitatea Tulcea',        lat: 45.1800, lon: 28.8040 },
      { name: 'Parcul Vivariumului',         lat: 45.1770, lon: 28.8010 },
      { name: 'Piața 1 Decembrie Tulcea',    lat: 45.1810, lon: 28.8000 },
      { name: 'Piața Civică Nouă Tulcea',    lat: 45.1790, lon: 28.8050 },
    ],
  },
  {
    name: 'Râmnicu Vâlcea', code: 'VL', antennaCount: 10,
    neighborhoods: [
      { name: 'Piața Mircea cel Bătrân',     lat: 45.0992, lon: 24.3693 },
      { name: 'Gara Râmnicu Vâlcea',         lat: 45.1060, lon: 24.3670 },
      { name: 'Spital Județean Vâlcea',      lat: 45.1020, lon: 24.3720 },
      { name: 'Universitatea Vâlcea',        lat: 45.0970, lon: 24.3650 },
      { name: 'Parcul Zăvoi',               lat: 45.0980, lon: 24.3680 },
      { name: 'Piața Centrală Rm. Vâlcea',   lat: 45.1000, lon: 24.3700 },
      { name: 'Mall Râmnicu Vâlcea',         lat: 45.0940, lon: 24.3750 },
      { name: 'Piața 1 Decembrie Rm. Vâlcea', lat: 45.0960, lon: 24.3660 },
      { name: 'Stadionul Municipal Rm. Vâlcea', lat: 45.0930, lon: 24.3720 },
      { name: 'Piața Eroilor Rm. Vâlcea',    lat: 45.1010, lon: 24.3680 },
    ],
  },
  {
    name: 'Vaslui', code: 'VS', antennaCount: 6,
    neighborhoods: [
      { name: 'Piața Civică Vaslui',         lat: 46.6384, lon: 27.7291 },
      { name: 'Gara Vaslui',                 lat: 46.6350, lon: 27.7200 },
      { name: 'Spital Județean Vaslui',      lat: 46.6410, lon: 27.7320 },
      { name: 'Parcul Municipal Vaslui',     lat: 46.6390, lon: 27.7280 },
      { name: 'Piața Ștefan cel Mare Vaslui', lat: 46.6370, lon: 27.7270 },
      { name: 'Piața 1 Decembrie Vaslui',    lat: 46.6400, lon: 27.7300 },
    ],
  },
  {
    name: 'Focșani', code: 'VN', antennaCount: 8,
    neighborhoods: [
      { name: 'Piața Unirii Focșani',        lat: 45.6959, lon: 27.1858 },
      { name: 'Gara Focșani',                lat: 45.6900, lon: 27.1940 },
      { name: 'Spital Județean Vrancea',     lat: 45.6990, lon: 27.1870 },
      { name: 'Universitatea Focșani',       lat: 45.6970, lon: 27.1830 },
      { name: 'Parcul Unirea Focșani',       lat: 45.6940, lon: 27.1860 },
      { name: 'Piața Revoluției Focșani',    lat: 45.6950, lon: 27.1840 },
      { name: 'Stadionul Municipal Focșani', lat: 45.6920, lon: 27.1910 },
      { name: 'Mall Vrancea',                lat: 45.6930, lon: 27.1920 },
    ],
  },
  {
    name: 'Vatra Dornei', code: 'VD', antennaCount: 5,
    neighborhoods: [
      { name: 'Parcul Central Vatra Dornei',  lat: 47.3531, lon: 25.3600 },
      { name: 'Gara Vatra Dornei',            lat: 47.3490, lon: 25.3630 },
      { name: 'Casino Vatra Dornei',          lat: 47.3530, lon: 25.3570 },
      { name: 'Spital Orășenesc Vatra Dornei', lat: 47.3560, lon: 25.3610 },
      { name: 'Stațiunea Balneară Dornei',    lat: 47.3510, lon: 25.3580 },
    ],
  },
  {
    name: 'Brad', code: 'BD', antennaCount: 5,
    neighborhoods: [
      { name: 'Piața Libertății Brad',        lat: 46.1319, lon: 22.4378 },
      { name: 'Gara Brad',                    lat: 46.1350, lon: 22.4410 },
      { name: 'Spital Orășenesc Brad',        lat: 46.1300, lon: 22.4350 },
      { name: 'Parcul Central Brad',          lat: 46.1310, lon: 22.4370 },
      { name: 'Piața Mihai Viteazul Brad',    lat: 46.1325, lon: 22.4390 },
    ],
  },
  {
    name: 'Beiuș', code: 'BU', antennaCount: 5,
    neighborhoods: [
      { name: 'Piața Centrală Beiuș',         lat: 46.6706, lon: 22.3533 },
      { name: 'Gara Beiuș',                   lat: 46.6680, lon: 22.3500 },
      { name: 'Liceul Samuil Vulcan',         lat: 46.6720, lon: 22.3550 },
      { name: 'Spital Orășenesc Beiuș',       lat: 46.6730, lon: 22.3560 },
      { name: 'Piața Unirii Beiuș',           lat: 46.6710, lon: 22.3540 },
    ],
  },
  {
    name: 'Reșița', code: 'CS', antennaCount: 8,
    neighborhoods: [
      { name: 'Piața Republicii Reșița',      lat: 45.2956, lon: 21.8883 },
      { name: 'Gara Reșița Nord',             lat: 45.3050, lon: 21.8850 },
      { name: 'Gara Reșița Sud',              lat: 45.2860, lon: 21.8940 },
      { name: 'Spital Județean Caraș-Severin', lat: 45.2980, lon: 21.8900 },
      { name: 'Universitatea Eftimie Murgu',  lat: 45.2940, lon: 21.8870 },
      { name: 'Parcul Tricolorului Reșița',   lat: 45.2960, lon: 21.8860 },
      { name: 'Piața Muncii Reșița',          lat: 45.2970, lon: 21.8890 },
      { name: 'Piața Eroilor Reșița',         lat: 45.2950, lon: 21.8840 },
    ],
  },
  {
    name: 'Vișeu de Sus', code: 'VI', antennaCount: 5,
    neighborhoods: [
      { name: 'Gara Vișeu de Sus (Mocănița)', lat: 47.7091, lon: 24.4364 },
      { name: 'Piața Centrală Vișeu de Sus',  lat: 47.7100, lon: 24.4380 },
      { name: 'Spital Orășenesc Vișeu',       lat: 47.7120, lon: 24.4400 },
      { name: 'Piața Unirii Vișeu de Sus',    lat: 47.7080, lon: 24.4350 },
      { name: 'Parcul Central Vișeu de Sus',  lat: 47.7110, lon: 24.4370 },
    ],
  },
  {
    name: 'Gheorgheni', code: 'GH', antennaCount: 5,
    neighborhoods: [
      { name: 'Piața Libertății Gheorgheni',  lat: 46.7177, lon: 25.5956 },
      { name: 'Gara Gheorgheni',              lat: 46.7150, lon: 25.6000 },
      { name: 'Spital Orășenesc Gheorgheni',  lat: 46.7200, lon: 25.5970 },
      { name: 'Parcul Central Gheorgheni',    lat: 46.7185, lon: 25.5945 },
      { name: 'Piața Petőfi Gheorgheni',      lat: 46.7165, lon: 25.5960 },
    ],
  },
  {
    name: 'Bârlad', code: 'BL', antennaCount: 7,
    neighborhoods: [
      { name: 'Piața Republicii Bârlad',      lat: 46.2282, lon: 27.6686 },
      { name: 'Gara Bârlad',                  lat: 46.2240, lon: 27.6640 },
      { name: 'Spital Municipal Bârlad',      lat: 46.2310, lon: 27.6720 },
      { name: 'Parcul Rizer Bârlad',          lat: 46.2300, lon: 27.6680 },
      { name: 'Piața Mihai Viteazul Bârlad',  lat: 46.2270, lon: 27.6670 },
      { name: 'Teatrul Victor Ion Popa',       lat: 46.2290, lon: 27.6700 },
      { name: 'Piața 1 Decembrie Bârlad',     lat: 46.2260, lon: 27.6660 },
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

function drawStatus(rng: () => number): AlarmSeverity {
  const r = rng()
  if (r < 0.005) return 'critical'
  if (r < 0.015) return 'major'
  if (r < 0.030) return 'minor'
  if (r < 0.050) return 'warning'
  return 'ok'
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

// Historical alarm severity pool — weighted toward minor/warning (most past alarms are low severity)
const HIST_SEVERITY_POOL: AlarmSeverity[] = [
  'warning', 'warning', 'warning', 'warning',
  'minor',   'minor',   'minor',
  'major',   'major',
  'critical',
]

// Number of resolved historical alarms to generate per cell
const HIST_PER_CELL = 3

let incidentCounter = 1

function nextIncidentId(): string {
  return `INC${String(incidentCounter++).padStart(7, '0')}`
}

const SITE_MERGE_RADIUS_M = 500

interface SeedSite {
  antennaId: string
  siteId: string
  lat: number
  lon: number
}

interface SeedIncidentGroup {
  incidentNumber: string
  submitDate: string
  alarmId: string
  antennaId: string
  technology: Technology
  siteId: string
  siteIds: Set<string>
  antennaIds: Set<string>
  alarmIds: Set<string>
  technologies: Set<Technology>
  status: 'ASSIGNED' | 'IN PROGRESS'
  urgency: string
  impact: string
  priority: string
  closedDate: null
  assignee: string
  assignees: []
  resolvedDate: null
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

function nearbySeedSites(primary: SeedSite, sites: SeedSite[]): SeedSite[] {
  return sites.filter(site =>
    haversineM(primary.lat, primary.lon, site.lat, site.lon) <= SITE_MERGE_RADIUS_M
  )
}

function severityRank(severity: AlarmSeverity): number {
  switch (severity) {
    case 'critical': return 1
    case 'major':    return 2
    case 'minor':    return 3
    default:         return 4
  }
}

// Firestore batch limit is 500 ops — this helper fans out across multiple batches automatically
class BatchWriter {
  private batches: ReturnType<typeof db.batch>[] = []
  private current: ReturnType<typeof db.batch>
  private count = 0
  private readonly LIMIT = 499

  constructor() {
    this.current = db.batch()
    this.batches.push(this.current)
  }

  set(ref: DocumentReference, data: object) {
    if (this.count >= this.LIMIT) {
      this.current = db.batch()
      this.batches.push(this.current)
      this.count = 0
    }
    this.current.set(ref, data)
    this.count++
  }

  async commitAll(label: string) {
    for (const batch of this.batches) {
      await batch.commit()
    }
    console.log(`${label} written (${this.batches.length} batch(es)).`)
  }
}

async function seed() {
  console.log('Seeding Firestore...')

  const topologyWriter = new BatchWriter()
  const alarmWriter    = new BatchWriter()
  const incidentWriter = new BatchWriter()

  let totalAlarms    = 0
  let totalIncidents = 0

  // Manifest for simulator — avoids reading full topology collection on every run
  const manifestEntries: Array<{ antennaId: string; siteId: string; technology: Technology; latitude: number; longitude: number }> = []
  const activeAlarms: Record<string, Alarm> = {}
  const incidentGroups = new Map<string, SeedIncidentGroup>()

  function findIncidentGroup(site: SeedSite): SeedIncidentGroup | null {
    for (const group of incidentGroups.values()) {
      if (group.siteIds.has(site.siteId)) return group
    }
    return null
  }

  function registerIncidentAlarm(
    site: SeedSite,
    nearbySites: SeedSite[],
    alarmId: string,
    tech: Technology,
    status: AlarmSeverity,
    alarmTime: string
  ): string {
    let group = findIncidentGroup(site)
    if (!group) {
      const incidentNumber = nextIncidentId()
      group = {
        incidentNumber,
        submitDate: alarmTime,
        alarmId,
        antennaId: site.antennaId,
        technology: tech,
        siteId: site.siteId,
        siteIds: new Set<string>(),
        antennaIds: new Set<string>(),
        alarmIds: new Set<string>(),
        technologies: new Set<Technology>(),
        status: status === 'critical' ? 'IN PROGRESS' : 'ASSIGNED',
        urgency: toUrgency(status),
        impact: status === 'critical' ? '2-Significant/Large' : '4-Minor/Localized',
        priority: toPriority(status),
        closedDate: null,
        assignee: '',
        assignees: [],
        resolvedDate: null,
      }
      incidentGroups.set(incidentNumber, group)
      totalIncidents++
    }

    if (new Date(alarmTime).getTime() < new Date(group.submitDate).getTime()) {
      group.submitDate = alarmTime
    }
    if (severityRank(status) < severityRank(group.priority === '1-Critical' ? 'critical' : group.priority === '2-High' ? 'major' : group.priority === '3-Medium' ? 'minor' : 'warning')) {
      group.urgency = toUrgency(status)
      group.priority = toPriority(status)
      group.impact = status === 'critical' ? '2-Significant/Large' : '4-Minor/Localized'
      if (status === 'critical') group.status = 'IN PROGRESS'
    }

    for (const nearby of nearbySites) {
      group.siteIds.add(nearby.siteId)
      group.antennaIds.add(nearby.antennaId)
    }
    group.alarmIds.add(alarmId)
    group.technologies.add(tech)

    return group.incidentNumber
  }

  for (let ci = 0; ci < CITIES.length; ci++) {
    const city = CITIES[ci]
    const rng  = seededRandom(ci * 9999 + 42)
    const positions = generatePositions(city, rng)
    const citySites: SeedSite[] = positions.map((pos, i) => {
      const siteId = `${city.code}${siteNumber(ci, i)}`
      return {
        antennaId: siteId.toLowerCase(),
        siteId,
        lat: pos.lat,
        lon: pos.lon,
      }
    })

    for (let i = 0; i < city.antennaCount; i++) {
      const num      = siteNumber(ci, i)
      const siteId   = `${city.code}${num}`
      const id       = siteId.toLowerCase()
      const provider = PROVIDERS[i % PROVIDERS.length]
      const bundle   = CELL_BUNDLES[i % CELL_BUNDLES.length]

      const { name: area, lat, lon } = positions[i]

      const antennaRef = db.collection('topology').doc(id)
      const cells: object[] = []

      for (let ci2 = 0; ci2 < bundle.length; ci2++) {
        const tech   = bundle[ci2]
        const status = drawStatus(rng)

        manifestEntries.push({ antennaId: id, siteId, technology: tech, latitude: lat, longitude: lon })

        // ── Active alarm ──────────────────────────────────────────
        let currentAlarm: object | undefined = undefined

        if (status !== 'ok') {
          const template = pickAlarm(status, i + ci2)
          const alarmId  = `${id}-${tech.toLowerCase()}-alarm-active`
          const alarmRef = db.collection('alarms').doc(alarmId)

          const alarmAgeMinutes = 30 + i * 17 + ci2 * 11
          const alarmTime       = new Date(Date.now() - 1000 * 60 * alarmAgeMinutes).toISOString()

          // Incident auto-creation rules:
          //   critical → always
          //   major    → only if alarm has been open > 4 h (240 min)
          //   minor / warning → no automatic incident
          const shouldCreateIncident =
              status === 'critical' ||
              (status === 'major' && alarmAgeMinutes > 240)

          const siteInfo = citySites[i]
          const linkedIncidentId = shouldCreateIncident
            ? registerIncidentAlarm(
              siteInfo,
              nearbySeedSites(siteInfo, citySites),
              alarmId,
              tech,
              status,
              alarmTime
            )
            : null

          const alarmData = {
            antennaId:      id,
            siteId,
            technology:     tech,
            alarmNumber:    template.alarmNumber,
            severity:       status,
            text:           template.text,
            alarmStatus:    1,
            alarmTime,
            cancelTime:     null,
            resolved:       false,
            durationMs:     null,
            acknowledgedAt: null,
            acknowledgedBy: null,
            incidentId:     linkedIncidentId,
          } satisfies Omit<Alarm, 'id'>

          alarmWriter.set(alarmRef, alarmData)
          currentAlarm = { id: alarmId, ...alarmData }
          activeAlarms[alarmId] = { id: alarmId, ...alarmData }
          totalAlarms++

        }

        cells.push({
          technology: tech,
          status,
          ...(currentAlarm ? { currentAlarm } : {}),
        })

        // ── Historical resolved alarms ────────────────────────────
        for (let h = 0; h < HIST_PER_CELL; h++) {
          const histSev      = HIST_SEVERITY_POOL[Math.floor(rng() * HIST_SEVERITY_POOL.length)]
          const histTemplate = pickAlarm(histSev, i + ci2 + h * 7)
          const histAlarmId  = `${id}-${tech.toLowerCase()}-alarm-h${h}`
          const histAlarmRef = db.collection('alarms').doc(histAlarmId)

          // Spread historical alarms over past 1-30 days
          const daysAgo         = 1 + h * 4 + Math.floor(rng() * 8)
          const histAgeMs       = daysAgo * 24 * 60 * 60 * 1000
          const histDurationMs  = Math.floor(rng() * 8 * 60 * 60 * 1000) + 30 * 60 * 1000
          const histAlarmTime   = new Date(Date.now() - histAgeMs).toISOString()
          const histCancelTime  = new Date(Date.now() - histAgeMs + histDurationMs).toISOString()

          alarmWriter.set(histAlarmRef, {
            antennaId:       id,
            siteId,
            technology:      tech,
            alarmNumber:     histTemplate.alarmNumber,
            severity:        histSev,
            text:            histTemplate.text,
            alarmStatus:     0,
            alarmTime:       histAlarmTime,
            cancelTime:      histCancelTime,
            resolved:        true,
            durationMs:      histDurationMs,
            acknowledgedAt:  null,
            acknowledgedBy:  null,
          })
          totalAlarms++
        }
      }

      topologyWriter.set(antennaRef, {
        name:      `${city.name} ${area}`,
        siteId,
        provider,
        latitude:  lat,
        longitude: lon,
        cells,
      })
    }
  }

  for (const group of incidentGroups.values()) {
    incidentWriter.set(db.collection('incidents').doc(group.incidentNumber), {
      incidentNumber: group.incidentNumber,
      submitDate:     group.submitDate,
      alarmId:        group.alarmId,
      antennaId:      group.antennaId,
      technology:     group.technology,
      siteId:         group.siteId,
      siteIds:        [...group.siteIds],
      antennaIds:     [...group.antennaIds],
      alarmIds:       [...group.alarmIds],
      technologies:   [...group.technologies],
      status:         group.status,
      urgency:        group.urgency,
      impact:         group.impact,
      priority:       group.priority,
      closedDate:     group.closedDate,
      assignee:       group.assignee,
      assignees:      group.assignees,
      resolvedDate:   group.resolvedDate,
    })
  }

  await topologyWriter.commitAll('Topology')
  await alarmWriter.commitAll('Alarms')
  await incidentWriter.commitAll('Incidents')

  // Write simulator manifest — 1 doc read per run vs 282 topology reads
  await db.collection('config').doc('cells').set({ entries: manifestEntries })
  console.log(`Config/cells manifest written — ${manifestEntries.length} cell entries.`)

  await db.collection('config').doc('simulationState').set({
    version: 1,
    activeAlarms,
    incidentCounter,
    updatedAt: new Date().toISOString(),
  })
  console.log(`Config/simulationState written — ${Object.keys(activeAlarms).length} active alarms.`)

  const total = CITIES.reduce((sum, c) => sum + c.antennaCount, 0)
  console.log(`Done — ${total} sites · ${totalAlarms} alarms · ${totalIncidents} incidents across ${CITIES.length} cities.`)
}

seed().catch((err) => {
  console.error(err)
  process.exit(1)
})
