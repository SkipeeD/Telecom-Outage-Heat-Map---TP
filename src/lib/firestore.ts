import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from './firebase'
import { auth } from './firebase'
import type { Antenna, Alarm, AlarmSeverity, ChatMessage, Incident, IncidentAssignee, Technology, UserProfile } from '@/types'

const CELL_HISTORY_LIMIT = 50
const INCIDENT_LIST_LIMIT = 100
const RESOLVED_ALARM_LIMIT = 100

// Sites within this radius (metres) are automatically merged into the same incident
const SITE_MERGE_RADIUS_M = 500

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

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
    where('resolved', '==', true),
    orderBy('cancelTime', 'desc'),
    limit(RESOLVED_ALARM_LIMIT)
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Alarm))
}

export function subscribeToResolvedAlarms(
  callback: (alarms: Alarm[]) => void
): () => void {
  const q = query(
    collection(db, 'alarms'),
    where('resolved', '==', true),
    orderBy('cancelTime', 'desc'),
    limit(RESOLVED_ALARM_LIMIT)
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
    where('technology', '==', tech),
    limit(CELL_HISTORY_LIMIT)
  )
  const snapshot = await getDocs(q)
  const alarms = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Alarm))
  return alarms.sort((a, b) => new Date(b.alarmTime).getTime() - new Date(a.alarmTime).getTime())
}

export async function getIncidentsForCell(antennaId: string, tech: Technology): Promise<Incident[]> {
  const q = query(
    collection(db, 'incidents'),
    where('antennaId', '==', antennaId),
    where('technology', '==', tech),
    limit(CELL_HISTORY_LIMIT)
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

export async function createIncidentForAlarm(
  alarm: Alarm,
  primaryAntenna: Antenna,
  allAntennas?: Antenna[]
): Promise<string> {
  const incidentNumber = `INC${Date.now()}`
  const urgency = severityToUrgency(alarm.severity)
  const ref = doc(db, 'incidents', incidentNumber)

  // Find nearby sites to merge into this incident
  const nearbySiteIds   = new Set<string>([alarm.siteId])
  const nearbyAntennaIds = new Set<string>([alarm.antennaId])

  if (allAntennas) {
    for (const a of allAntennas) {
      if (a.id === primaryAntenna.id) continue
      const dist = haversineM(primaryAntenna.latitude, primaryAntenna.longitude, a.latitude, a.longitude)
      if (dist <= SITE_MERGE_RADIUS_M) {
        nearbySiteIds.add(a.siteId)
        nearbyAntennaIds.add(a.id)
      }
    }
  }

  await setDoc(ref, {
    incidentNumber,
    submitDate:   new Date().toISOString(),
    alarmId:      alarm.id,
    antennaId:    alarm.antennaId,
    technology:   alarm.technology,
    siteId:       alarm.siteId,
    siteIds:      [...nearbySiteIds],
    antennaIds:   [...nearbyAntennaIds],
    alarmIds:     [alarm.id],
    technologies: [alarm.technology],
    status:      'ASSIGNED',
    urgency,
    impact:      alarm.severity === 'critical' ? '2-Significant/Large' : '4-Minor/Localized',
    priority:    urgency,
    closedDate:  null,
    assignee:    '',
    assignees:   [],
    resolvedDate: null,
  } satisfies Incident)
  return incidentNumber
}

export async function getIncidentsForSite(siteId: string): Promise<Incident[]> {
  const [snapNew, snapLegacy] = await Promise.all([
    getDocs(query(
      collection(db, 'incidents'),
      where('siteIds', 'array-contains', siteId),
      limit(CELL_HISTORY_LIMIT)
    )),
    getDocs(query(
      collection(db, 'incidents'),
      where('siteId', '==', siteId),
      limit(CELL_HISTORY_LIMIT)
    )),
  ])
  const seen = new Set<string>()
  const result: Incident[] = []
  for (const d of [...snapNew.docs, ...snapLegacy.docs]) {
    if (!seen.has(d.id)) {
      seen.add(d.id)
      result.push(d.data() as Incident)
    }
  }
  return result.sort((a, b) => new Date(b.submitDate).getTime() - new Date(a.submitDate).getTime())
}

export async function getAllUsers(): Promise<UserProfile[]> {
  const idToken = await auth.currentUser?.getIdToken()
  if (!idToken) throw new Error('Not authenticated')

  const res = await fetch('/api/users', {
    headers: {
      'Authorization': `Bearer ${idToken}`,
    },
  })

  if (!res.ok) throw new Error('Failed to load users')

  const data = await res.json() as { users?: UserProfile[] }
  return data.users ?? []
}

export async function getEngineers(): Promise<UserProfile[]> {
  const q = query(collection(db, 'users'), where('role', '==', 'engineer'))
  const snapshot = await getDocs(q)
  return snapshot.docs.map(d => d.data() as UserProfile)
}

export async function updateUserRole(uid: string, role: 'user' | 'engineer'): Promise<void> {
  const idToken = await auth.currentUser?.getIdToken()
  if (!idToken) throw new Error('Not authenticated')

  const res = await fetch('/api/set-role', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`,
    },
    body: JSON.stringify({ uid, role }),
  })

  if (!res.ok) throw new Error('Failed to set custom claim')
}

export async function getAllIncidents(): Promise<Incident[]> {
  const q = query(
    collection(db, 'incidents'),
    orderBy('submitDate', 'desc'),
    limit(INCIDENT_LIST_LIMIT)
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map(d => d.data() as Incident)
}

export async function getMyIncidents(uid: string): Promise<Incident[]> {
  const all = await getAllIncidents()
  return all.filter(i => (i.assignees ?? []).some(a => a.uid === uid))
}

export async function updateIncidentStatus(
  incidentNumber: string,
  status: Incident['status']
): Promise<void> {
  await updateDoc(doc(db, 'incidents', incidentNumber), { status })
}

async function lifecycleRequest(incidentNumber: string, action: 'resolve' | 'close'): Promise<void> {
  const idToken = await auth.currentUser?.getIdToken()
  if (!idToken) throw new Error('Not authenticated')

  const res = await fetch('/api/incidents/lifecycle', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`,
    },
    body: JSON.stringify({ incidentNumber, action }),
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(data.error ?? 'Failed to update incident')
  }
}

export async function resolveIncident(incidentNumber: string): Promise<void> {
  await lifecycleRequest(incidentNumber, 'resolve')
}

export async function closeIncident(incidentNumber: string): Promise<void> {
  await lifecycleRequest(incidentNumber, 'close')
}

export async function acknowledgeAssignedIncidents(
  incidentNumbers: string[]
): Promise<string[]> {
  const idToken = await auth.currentUser?.getIdToken()
  if (!idToken) throw new Error('Not authenticated')

  const res = await fetch('/api/incidents/acknowledge', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`,
    },
    body: JSON.stringify({ incidentNumbers }),
  })

  if (!res.ok) throw new Error('Failed to acknowledge incidents')

  const data = await res.json() as { updated?: string[] }
  return data.updated ?? []
}

export async function updateIncidentAssignees(
  incidentNumber: string,
  assignees: IncidentAssignee[]
): Promise<void> {
  await updateDoc(doc(db, 'incidents', incidentNumber), { assignees })
}

const LONG_LIVED_THRESHOLD_MS = 24 * 60 * 60_000

export function subscribeToLongLivedAlarms(
  callback: (alarms: Alarm[]) => void
): () => void {
  const q = query(
    collection(db, 'alarms'),
    where('resolved', '==', true),
    where('durationMs', '>=', LONG_LIVED_THRESHOLD_MS),
    orderBy('durationMs', 'desc'),
    limit(20)
  )
  return onSnapshot(q, (snapshot) => {
    const alarms = snapshot.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() } as Alarm)
    )
    callback(alarms)
  })
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

export function subscribeToMessages(
  incidentNumber: string,
  callback: (messages: ChatMessage[]) => void,
  onError?: (err: Error) => void
): () => void {
  const q = query(
    collection(db, 'chats', incidentNumber, 'messages'),
    limit(200)
  )
  return onSnapshot(
    q,
    snapshot => {
      const msgs = snapshot.docs
        .map(d => toChatMessage(d.id, d.data()))
        .filter((msg): msg is ChatMessage => msg !== null)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      callback(msgs)
    },
    err => {
      console.error('subscribeToMessages error:', err)
      onError?.(err)
    }
  )
}

function toIsoTimestamp(value: unknown): string {
  if (typeof value === 'string') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : value
  }

  if (value instanceof Date) return value.toISOString()

  if (value && typeof value === 'object' && 'toDate' in value) {
    const toDate = (value as { toDate?: unknown }).toDate
    if (typeof toDate === 'function') {
      const date = toDate.call(value)
      if (date instanceof Date && !Number.isNaN(date.getTime())) return date.toISOString()
    }
  }

  return new Date(0).toISOString()
}

function toChatMessage(id: string, data: Record<string, unknown>): ChatMessage | null {
  if (typeof data.text !== 'string' || data.text.trim() === '') return null
  if (typeof data.senderId !== 'string' || data.senderId.trim() === '') return null

  return {
    id,
    text: data.text,
    senderId: data.senderId,
    senderName: typeof data.senderName === 'string' && data.senderName.trim() !== ''
      ? data.senderName
      : 'Engineer',
    timestamp: toIsoTimestamp(data.timestamp),
  }
}

export async function sendChatMessage(
  incidentNumber: string,
  text: string,
  senderId: string,
  senderName: string
): Promise<void> {
  const trimmedText = text.trim()
  if (!trimmedText) return

  const ref = doc(collection(db, 'chats', incidentNumber, 'messages'))
  await setDoc(ref, {
    text: trimmedText,
    senderId,
    senderName: senderName.trim() || 'Engineer',
    timestamp: new Date().toISOString(),
  })
}

export function subscribeToIncidents(
  callback: (incidents: Incident[]) => void
): () => void {
  const q = query(
    collection(db, 'incidents'),
    orderBy('submitDate', 'desc'),
    limit(INCIDENT_LIST_LIMIT)
  )
  return onSnapshot(q, (snapshot) => {
    const incidents = snapshot.docs.map(
      (doc) => ({ ...doc.data() } as Incident)
    )
    callback(incidents)
  })
}
