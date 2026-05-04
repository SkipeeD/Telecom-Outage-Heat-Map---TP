import type { UserProfile } from '@/types'

type Role = UserProfile['role']

export function canAcknowledgeAlarm(role: Role | undefined): boolean {
  return role === 'engineer' || role === 'admin'
}

export function canCreateIncident(role: Role | undefined): boolean {
  return role === 'engineer' || role === 'admin'
}

export function canManageUsers(role: Role | undefined): boolean {
  return role === 'admin'
}

export function canAssignEngineers(role: Role | undefined): boolean {
  return role === 'admin'
}

export function roleLabel(role: Role | undefined): string {
  switch (role) {
    case 'admin':    return 'NOC Admin'
    case 'engineer': return 'NOC Engineer'
    default:         return 'NOC User'
  }
}
