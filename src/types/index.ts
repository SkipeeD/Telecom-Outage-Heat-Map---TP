export type Technology = '2G' | '3G' | '4G' | '5G' | 'B2B'

export type AlarmSeverity = 'critical' | 'major' | 'minor' | 'warning' | 'ok'

export interface Alarm {
  id: string
  antennaId: string
  severity: AlarmSeverity
  description: string
  alarmTime: string
  cancelTime?: string
  resolved: boolean
}

export interface Antenna {
  id: string
  name: string
  siteId: string
  provider: string
  technology: Technology
  latitude: number
  longitude: number
  status: AlarmSeverity
  currentAlarm?: Alarm
}

export interface UserProfile {
  uid: string
  email: string
  role: 'engineer' | 'admin'
  createdAt: string
}

