/** Supported radio access technologies across the network. */
export type Technology = '2G' | '3G' | '4G' | '5G' | '6G'

/** Ordered severity levels from most to least severe; 'ok' means no alarm. */
export type AlarmSeverity = 'critical' | 'major' | 'minor' | 'warning' | 'ok'

/** A single alarm event fired by a cell, imported from the XLSX feed. */
export interface Alarm {
  id: string
  antennaId: string
  siteId: string
  technology: Technology
  alarmNumber: number
  severity: AlarmSeverity
  /** Alarm description text — maps to xlsx TEXT column */
  text: string
  /** 1 = active, 0 = cancelled — maps to xlsx ALARM_STATUS */
  alarmStatus: number
  alarmTime: string
  cancelTime: string | null
  resolved: boolean
  /** ms from alarmTime to cancelTime — null while alarm is active */
  durationMs: number | null
  /** ISO timestamp when a user acknowledged the alarm */
  acknowledgedAt: string | null
  /** UID of the user who acknowledged */
  acknowledgedBy: string | null
  /** Incident linked to this alarm (critical/major only) */
  incidentId: string | null
}

/** A single radio cell on an antenna, carrying its current severity and active alarm. */
export interface Cell {
  technology: Technology
  status: AlarmSeverity
  /** The alarm currently driving this cell's severity — absent when status is 'ok'. */
  currentAlarm?: Alarm
}

/** A user who has been assigned to an incident (engineer or technician). */
export interface IncidentAssignee {
  uid: string
  email: string
  displayName?: string
}

export interface Incident {
  incidentNumber: string          // INC0000001 format
  submitDate: string
  // Primary/legacy fields — always set; used by existing Firestore queries
  alarmId: string
  antennaId: string
  technology: Technology
  siteId: string
  // Multi-site fields — populated for all new incidents; primary site/antenna first
  siteIds: string[]
  antennaIds: string[]
  alarmIds: string[]
  technologies: Technology[]
  status: 'ASSIGNED' | 'IN PROGRESS' | 'RESOLVED' | 'CLOSED'
  urgency: '1-Critical' | '2-High' | '3-Medium' | '4-Low'
  impact: string
  priority: '1-Critical' | '2-High' | '3-Medium' | '4-Low'
  closedDate: string | null
  assignee: string
  assignees: IncidentAssignee[]
  // Field technicians dispatched by an engineer to resolve the incident on-site.
  // Distinct from `assignees` (the owning engineers). Defaults to empty.
  technicians?: IncidentAssignee[]
  resolvedDate: string | null
  mergedInto?: string | null
}

/** A physical antenna tower at a geographic location, hosting one cell per technology. */
export interface Antenna {
  id: string
  name: string
  siteId: string
  provider: string
  latitude: number
  longitude: number
  cells: Cell[]
}

/** Firestore user document stored under /users/{uid}. */
export interface UserProfile {
  uid: string
  email: string
  displayName?: string
  role: 'user' | 'engineer' | 'technician' | 'admin'
  createdAt: string
}

/** A single audit log entry in an incident's `activity` sub-collection. */
export interface IncidentActivity {
  id: string
  /** Lifecycle verb describing what happened. 'note' is a free-text engineer comment. */
  type: 'created' | 'acknowledged' | 'resolved' | 'closed' | 'assigned' | 'unassigned' | 'merged' | 'note'
  actorUid: string
  actorName: string
  message: string
  timestamp: string
}

/** A single message in an incident's real-time chat channel. */
export interface ChatMessage {
  id: string
  text: string
  senderId: string
  senderName: string
  timestamp: string
}

/** Precomputed summary payload served by the /api/dashboard endpoint. */
export interface DashboardSummary {
  /** Alarms resolved within the last 24 h — useful for the "recent resolutions" widget. */
  resolvedAlarms: Alarm[]
  /** Alarms active for longer than the SLA threshold — highlights lingering problems. */
  longLivedAlarms: Alarm[]
  incidents: Incident[]
  updatedAt: string
}

export interface LiveSnapshotTotals {
  /** Counts by status, summed across all incidents ever created. */
  byStatus: {
    ASSIGNED: number
    'IN PROGRESS': number
    RESOLVED: number
    CLOSED: number
  }
  /** Open-incident counts only (ASSIGNED + IN PROGRESS) bucketed by urgency. */
  openByUrgency: {
    '1-Critical': number
    '2-High': number
    '3-Medium': number
    '4-Low': number
  }
}

/**
 * Compact denormalized state mirror written by every code path that mutates
 * incidents or topology. Clients subscribe to this single doc instead of
 * polling collection endpoints, which is what keeps daily reads bounded.
 *
 * - `antennaSeverity` maps antennaId → worst-severity-among-cells. Drives
 *   map pin colors and severity filter counts without scanning topology.
 *   Absence = ok. Owned exclusively by the simulator.
 * - `openIncidents` is keyed by incidentNumber so multiple writers (the
 *   simulator and the various API write routes) can mutate distinct entries
 *   atomically via field-path updates without read-modify-write conflicts.
 * - `totals` holds writer-maintained counters updated via FieldValue.increment.
 */
export interface LiveSnapshot {
  version: number
  updatedAt: string
  antennaSeverity: Record<string, AlarmSeverity>
  /** Currently-firing alarms, capped by the simulator (~30). */
  activeAlarms: Alarm[]
  openIncidents: Record<string, Incident>
  totals: LiveSnapshotTotals
}
