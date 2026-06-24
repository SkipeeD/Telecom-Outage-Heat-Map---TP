import type { UserProfile } from '@/types'

type Role = UserProfile['role']

/** Returns true if the role can acknowledge (mark as seen) an active alarm. */
export function canAcknowledgeAlarm(role: Role | undefined): boolean {
  return role === 'engineer' || role === 'admin'
}

/** Returns true if the role can open a new incident for an alarm. */
export function canCreateIncident(role: Role | undefined): boolean {
  return role === 'engineer' || role === 'admin'
}

/** Returns true if the role can promote/demote other users. */
export function canManageUsers(role: Role | undefined): boolean {
  return role === 'admin'
}

/** Returns true if the role can assign owning engineers to incidents. */
export function canAssignEngineers(role: Role | undefined): boolean {
  return role === 'admin'
}

/** Engineers dispatch field technicians onto incidents they own. */
export function canAssignTechnicians(role: Role | undefined): boolean {
  return role === 'engineer' || role === 'admin'
}

/** Technicians resolve/close incidents on-site; engineers/admins too. */
export function canResolveIncident(role: Role | undefined): boolean {
  return role === 'technician' || role === 'engineer' || role === 'admin'
}

/** The Dashboard is an ops view for engineers/admins, not field/normal users. */
export function canViewDashboard(role: Role | undefined): boolean {
  return role === 'engineer' || role === 'admin'
}

/** Role-appropriate landing route used after login and by route guards. */
export function homeRouteForRole(role: Role | undefined): string {
  switch (role) {
    case 'admin':
    case 'engineer':   return '/dashboard'
    case 'technician': return '/technician'
    default:           return '/map'
  }
}

/** Returns a human-readable display label for a role — used in the admin UI. */
export function roleLabel(role: Role | undefined): string {
  switch (role) {
    case 'admin':      return 'NOC Admin'
    case 'engineer':   return 'NOC Engineer'
    case 'technician': return 'Field Technician'
    default:           return 'NOC User'
  }
}
