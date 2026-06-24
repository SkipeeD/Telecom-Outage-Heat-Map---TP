import { auth } from './firebase'
import { apiFetch } from './api-client'
import type { Antenna, Alarm, ChatMessage, Incident, IncidentAssignee, Technology, UserProfile } from '@/types'

// ─── Pure utility (no Firestore) ────────────────────────────────────────────

/**
 * Returns true when an alarm is linked to an incident via any of the three
 * possible association paths: the legacy single-alarm field, the multi-alarm
 * array, or the back-reference stored on the alarm itself.
 */
export function incidentMatchesAlarm(incident: Incident, alarm: Alarm): boolean {
  // Normalise: older incidents may only have alarmId, not the alarmIds array.
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

/**
 * Fetch a single antenna's full cell breakdown — used by the popup/details
 * panel after a pin click. Server-cached (30s) so repeated clicks share a
 * single Firestore doc read.
 */
export async function getAntenna(id: string): Promise<Antenna> {
  const data = await apiFetch<{ antenna: Antenna }>(`/api/antennas/${encodeURIComponent(id)}`)
  return data.antenna
}

// ─── Incidents ───────────────────────────────────────────────────────────────

/** Fetch every open incident (ASSIGNED + IN PROGRESS) from the server cache. */
export async function getAllIncidents(): Promise<Incident[]> {
  const data = await apiFetch<{ incidents: Incident[] }>('/api/incidents')
  return data.incidents
}

export interface IncidentHistoryParams {
  cursor?: string
  limit?: number
  assigneeUid?: string
  sinceIso?: string
}

export interface IncidentHistoryPage {
  incidents: Incident[]
  nextCursor: string | null
}

/**
 * Cursor-paginated resolved/closed incident history. Server-cached for 15 min
 * since resolved incidents are immutable.
 */
export async function getIncidentHistory(params: IncidentHistoryParams = {}): Promise<IncidentHistoryPage> {
  const qs = new URLSearchParams()
  if (params.cursor)      qs.set('cursor', params.cursor)
  if (params.limit)       qs.set('limit', String(params.limit))
  if (params.assigneeUid) qs.set('assigneeUid', params.assigneeUid)
  if (params.sinceIso)    qs.set('sinceIso', params.sinceIso)
  const suffix = qs.toString() ? `?${qs.toString()}` : ''
  return apiFetch<IncidentHistoryPage>(`/api/incidents/history${suffix}`)
}

/**
 * Returns the subset of open incidents where the given user is one of the
 * assigned engineers. Filtering is done client-side to avoid an extra API round-trip.
 */
export async function getMyIncidents(uid: string): Promise<Incident[]> {
  const all = await getAllIncidents()
  return all.filter(i => (i.assignees ?? []).some(a => a.uid === uid))
}

/** Fetch all open incidents associated with a specific site. */
export async function getIncidentsForSite(siteId: string): Promise<Incident[]> {
  const data = await apiFetch<{ incidents: Incident[] }>(`/api/incidents/site?siteId=${encodeURIComponent(siteId)}`)
  return data.incidents
}

/** Replace the full list of engineer assignees on an incident. */
export async function updateIncidentAssignees(
  incidentNumber: string,
  assignees: IncidentAssignee[]
): Promise<void> {
  await apiFetch('/api/incidents/assignees', {
    method: 'POST',
    body: JSON.stringify({ incidentNumber, assignees }),
  })
}

/** Replace the full list of field technicians dispatched to an incident. */
export async function updateIncidentTechnicians(
  incidentNumber: string,
  technicians: IncidentAssignee[]
): Promise<void> {
  await apiFetch('/api/incidents/technicians', {
    method: 'POST',
    body: JSON.stringify({ incidentNumber, technicians }),
  })
}

/**
 * Creates a new incident for the given alarm. Pass `allAntennas` to associate
 * every co-located antenna on the same site with the incident (multi-site incidents).
 * Returns the generated INC0000001-style incident number.
 */
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

/**
 * Merges `source` into `target` — all alarms and assignees from the source
 * incident are folded into the target, and the source is marked as merged.
 */
export async function mergeIncidentInto(target: Incident, source: Incident): Promise<void> {
  await apiFetch('/api/incidents/merge', {
    method: 'POST',
    body: JSON.stringify({ target, source }),
  })
}

// ─── Lifecycle (already API-backed) ──────────────────────────────────────────

/**
 * Shared helper for resolve/close lifecycle transitions. Uses raw fetch with
 * an explicit Authorization header because these calls need to carry the full
 * Firebase ID token for server-side actor attribution in the activity log.
 */
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

/** Transitions an incident to RESOLVED status and stamps the resolvedDate. */
export async function resolveIncident(incidentNumber: string): Promise<void> {
  await lifecycleRequest(incidentNumber, 'resolve')
}

/** Transitions an incident to CLOSED status and stamps the closedDate. */
export async function closeIncident(incidentNumber: string): Promise<void> {
  await lifecycleRequest(incidentNumber, 'close')
}

/**
 * Bulk-acknowledges a set of ASSIGNED incidents for the current user,
 * transitioning them to IN PROGRESS. Returns the subset that were actually
 * updated (already-acknowledged incidents are silently skipped).
 */
export async function acknowledgeAssignedIncidents(incidentNumbers: string[]): Promise<string[]> {
  const data = await apiFetch<{ updated?: string[] }>('/api/incidents/acknowledge', {
    method: 'POST',
    body: JSON.stringify({ incidentNumbers }),
  })
  return data.updated ?? []
}

// ─── Users ───────────────────────────────────────────────────────────────────

/** Fetch all registered user profiles (admin use only). */
export async function getAllUsers(): Promise<UserProfile[]> {
  const data = await apiFetch<{ users?: UserProfile[] }>('/api/users')
  return data.users ?? []
}

/** Fetch all users with the 'engineer' role — used by the assignee picker. */
export async function getEngineers(): Promise<UserProfile[]> {
  const data = await apiFetch<{ engineers: UserProfile[] }>('/api/engineers')
  return data.engineers
}

/** Fetch all users with the 'technician' role — used by the dispatch picker. */
export async function getTechnicians(): Promise<UserProfile[]> {
  const data = await apiFetch<{ technicians: UserProfile[] }>('/api/technicians')
  return data.technicians
}

/** Change the role of a user. Admin-only — the API route enforces this. */
export async function updateUserRole(uid: string, role: 'user' | 'engineer' | 'technician'): Promise<void> {
  await apiFetch('/api/set-role', {
    method: 'POST',
    body: JSON.stringify({ uid, role }),
  })
}

// ─── Alarms ──────────────────────────────────────────────────────────────────

/** Fetch all alarms (active and historical) for a specific cell on an antenna. */
export async function getAlarmsForAntennaCell(antennaId: string, tech: Technology): Promise<Alarm[]> {
  const data = await apiFetch<{ alarms: Alarm[] }>(
    `/api/alarms/cell?antennaId=${encodeURIComponent(antennaId)}&tech=${encodeURIComponent(tech)}`
  )
  return data.alarms
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

/** One-time fetch of chat messages for an incident (used for initial page load). */
export async function getChatMessages(incidentNumber: string): Promise<ChatMessage[]> {
  const data = await apiFetch<{ messages: ChatMessage[] }>(`/api/chat/${encodeURIComponent(incidentNumber)}`)
  return data.messages
}

/** Post a new chat message to an incident's chat channel. */
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
