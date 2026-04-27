export type Technology = '2G' | '3G' | '4G' | '5G' | 'B2B'

export type AlarmSeverity = 'critical' | 'major' | 'minor' | 'warning' | 'ok'

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
}

export interface Cell {
  technology: Technology
  status: AlarmSeverity
  currentAlarm?: Alarm
}

export interface Incident {
  incidentNumber: string          // INC0000001 format
  submitDate: string
  alarmId: string
  siteId: string
  status: 'ASSIGNED' | 'IN PROGRESS' | 'RESOLVED' | 'CLOSED'
  urgency: '1-Critical' | '2-High' | '3-Medium' | '4-Low'
  impact: string
  priority: '1-Critical' | '2-High' | '3-Medium' | '4-Low'
  closedDate: string | null
  assignee: string
  resolvedDate: string | null
}

export interface Antenna {
  id: string
  name: string
  siteId: string
  provider: string
  latitude: number
  longitude: number
  cells: Cell[]
}

export interface UserProfile {
  uid: string
  email: string
  displayName?: string
  role: 'engineer' | 'admin'
  createdAt: string
}

