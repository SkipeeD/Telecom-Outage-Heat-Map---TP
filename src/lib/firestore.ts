import { auth } from './firebase'
import { apiFetch } from './api-client'
import type { Antenna, Alarm, ChatMessage, Incident, IncidentAssignee, Technology, UserProfile } from '@/types'

// ─── Pure utility (no Firestore) ────────────────────────────────────────────

export function incidentMatchesAlarm(incident: Incident, alarm: Alarm): boolean {
  const alarmIds = incident.alarmIds?.length ? incident.alarmIds : [incident.alarmId]
  return incident.alarmId === alarm.id ||
    alarmIds.includes(alarm.id) ||
    (alarm.incidentId !== null && incident.incidentNumber === alarm.incidentId)
}

// ─── Antennas ────────────────────────────────────────────────────────────────

export interface AntennaData {
  /** Antennas matching the requested severity filter (or all if no filter). */
  antennas: Antenna[]
  /**
   * Severity counts computed from the FULL topology — never affected by the
   * severity filter so the filter bar always shows accurate totals.
   */
  counts: Record<string, number>
}

/**
 * Fetch antennas from the server-side cached API.
 * Pass `severity` to receive only antennas with at least one cell at that
 * severity level; counts always reflect the full topology regardless.
 */
export async function getAntennas(severity?: string): Promise<AntennaData> {
  const qs = severity && severity !== 'all'
    ? `?severity=${encodeURIComponent(severity)}`
    : ''
  return apiFetch<AntennaData>(`/api/antennas${qs}`)
}

// ─── Incidents ───────────────────────────────────────────────────────────────

export async function getAllIncidents(): Promise<Incident[]> {
  const data = await apiFetch<{ incidents: Incident[] }>('/api/incidents')
  return data.incidents
}

export async function getMyIncidents(uid: string): Promise<Incident[]> {
  const all = await getAllIncidents()
  return all.filter(i => (i.assignees ?? []).some(a => a.uid === uid))
}

export async function getIncidentsForSite(siteId: string): Promise<Incident[]> {
  const data = await apiFetch<{ incidents: Incident[] }>(`/api/incidents/site?siteId=${encodeURIComponent(siteId)}`)
  return data.incidents
}

export async function updateIncidentAssignees(
  incidentNumber: string,
  assignees: IncidentAssignee[]
): Promise<void> {
  await apiFetch('/api/incidents/assignees', {
    method: 'POST',
    body: JSON.stringify({ incidentNumber, assignees }),
  })
}

export async function createIncidentForAlarm(
  alarm: Alarm,
  primaryAntenna: Antenna,
  allAntennas?: Antenna[]
): Promise<string> {
  const data = await apiFetch<{ incidentNumber: string }>('/api/incidents/create', {
    method: 'POST',
    body: JSON.stringify({ alarm, primaryAntenna, allAntennas }),
  })
  return data.incidentNumber
}

export async function mergeIncidentInto(target: Incident, source: Incident): Promise<void> {
  await apiFetch('/api/incidents/merge', {
    method: 'POST',
    body: JSON.stringify({ target, source }),
  })
}

// ─── Lifecycle (already API-backed) ──────────────────────────────────────────

async function lifecycleRequest(incidentNumber: string, action: 'resolve' | 'close'): Promise<void> {
  const idToken = await auth.currentUser?.getIdToken()
  if (!idToken) throw new Error('Not authenticated')

  const res = await fetch('/api/incidents/lifecycle', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
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

export async function acknowledgeAssignedIncidents(incidentNumbers: string[]): Promise<string[]> {
  const data = await apiFetch<{ updated?: string[] }>('/api/incidents/acknowledge', {
    method: 'POST',
    body: JSON.stringify({ incidentNumbers }),
  })
  return data.updated ?? []
}

// ─── Users ───────────────────────────────────────────────────────────────────

export async function getAllUsers(): Promise<UserProfile[]> {
  const data = await apiFetch<{ users?: UserProfile[] }>('/api/users')
  return data.users ?? []
}

export async function getEngineers(): Promise<UserProfile[]> {
  const data = await apiFetch<{ engineers: UserProfile[] }>('/api/engineers')
  return data.engineers
}

export async function updateUserRole(uid: string, role: 'user' | 'engineer'): Promise<void> {
  await apiFetch('/api/set-role', {
    method: 'POST',
    body: JSON.stringify({ uid, role }),
  })
}

// ─── Alarms ──────────────────────────────────────────────────────────────────

export async function getAlarmsForAntennaCell(antennaId: string, tech: Technology): Promise<Alarm[]> {
  const data = await apiFetch<{ alarms: Alarm[] }>(
    `/api/alarms/cell?antennaId=${encodeURIComponent(antennaId)}&tech=${encodeURIComponent(tech)}`
  )
  return data.alarms
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

export async function getChatMessages(incidentNumber: string): Promise<ChatMessage[]> {
  const data = await apiFetch<{ messages: ChatMessage[] }>(`/api/chat/${encodeURIComponent(incidentNumber)}`)
  return data.messages
}

export async function sendChatMessage(
  incidentNumber: string,
  text: string,
  senderId: string,
  senderName: string
): Promise<void> {
  await apiFetch(`/api/chat/${encodeURIComponent(incidentNumber)}`, {
    method: 'POST',
    body: JSON.stringify({ text, senderId, senderName }),
  })
}
