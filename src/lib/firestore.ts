import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  where,
} from 'firebase/firestore'
import { db } from './firebase'
import type { Antenna, Alarm, AlarmSeverity, Incident, Technology } from '@/types'

export async function getAntennas(): Promise<Antenna[]> {
  const snapshot = await getDocs(collection(db, 'topology'))
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Antenna))
}

export async function getAlarmsForAntenna(antennaId: string): Promise<Alarm[]> {
  const q = query(
    collection(db, 'alarms'),
    where('antennaId', '==', antennaId)
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Alarm))
}

export async function getResolvedAlarms(): Promise<Alarm[]> {
  const q = query(
    collection(db, 'alarms'),
    where('resolved', '==', true)
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Alarm))
}

export function subscribeToResolvedAlarms(
  callback: (alarms: Alarm[]) => void
): () => void {
  const q = query(
    collection(db, 'alarms'),
    where('resolved', '==', true)
  )
  return onSnapshot(q, (snapshot) => {
    const alarms = snapshot.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() } as Alarm)
    )
    callback(alarms)
  })
}

export async function getAlarmsForAntennaCell(antennaId: string, tech: Technology): Promise<Alarm[]> {
  const q = query(
    collection(db, 'alarms'),
    where('antennaId', '==', antennaId),
    where('technology', '==', tech)
  )
  const snapshot = await getDocs(q)
  const alarms = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Alarm))
  return alarms.sort((a, b) => new Date(b.alarmTime).getTime() - new Date(a.alarmTime).getTime())
}

export async function getIncidentsForCell(antennaId: string, tech: Technology): Promise<Incident[]> {
  const q = query(
    collection(db, 'incidents'),
    where('antennaId', '==', antennaId),
    where('technology', '==', tech)
  )
  const snapshot = await getDocs(q)
  const incidents = snapshot.docs.map((doc) => ({ ...doc.data() } as Incident))
  return incidents.sort((a, b) => new Date(b.submitDate).getTime() - new Date(a.submitDate).getTime())
}

function severityToUrgency(severity: AlarmSeverity): Incident['urgency'] {
  switch (severity) {
    case 'critical': return '1-Critical'
    case 'major':    return '2-High'
    case 'minor':    return '3-Medium'
    default:         return '4-Low'
  }
}

export async function createIncidentForAlarm(alarm: Alarm): Promise<string> {
  const incidentNumber = `INC${Date.now()}`
  const urgency = severityToUrgency(alarm.severity)
  const ref = doc(db, 'incidents', incidentNumber)
  await setDoc(ref, {
    incidentNumber,
    submitDate:  new Date().toISOString(),
    alarmId:     alarm.id,
    antennaId:   alarm.antennaId,
    technology:  alarm.technology,
    siteId:      alarm.siteId,
    status:      'ASSIGNED',
    urgency,
    impact:      alarm.severity === 'critical' ? '2-Significant/Large' : '4-Minor/Localized',
    priority:    urgency,
    closedDate:  null,
    assignee:    'USER1',
    resolvedDate: null,
  } satisfies Incident)
  return incidentNumber
}

export function subscribeToAntennas(
  callback: (antennas: Antenna[]) => void
): () => void {
  return onSnapshot(collection(db, 'topology'), (snapshot) => {
    const antennas = snapshot.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() } as Antenna)
    )
    callback(antennas)
  })
}
