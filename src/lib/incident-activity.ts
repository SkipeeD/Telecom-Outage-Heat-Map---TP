import type { Firestore } from 'firebase-admin/firestore'
import type { IncidentActivity } from '@/types'

/**
 * Appends an activity entry to an incident's `activity` sub-collection.
 * Called from server-side API routes (lifecycle, assignees, merge, etc.) after
 * each state change. Errors are caught and logged so a failed audit write never
 * causes the parent write operation to roll back.
 */
export async function logIncidentActivity(
  db: Firestore,
  incidentNumber: string,
  entry: Omit<IncidentActivity, 'id'>
): Promise<void> {
  try {
    await db
      .collection('incidents')
      .doc(incidentNumber)
      .collection('activity')
      .add(entry)
  } catch (err) {
    console.error('[incident-activity] log failed', err)
  }
}

/**
 * Derives a display name for an actor from their token claims.
 * Prefers `name`, then the local part of `email`, then falls back to `uid`.
 */
export function actorName(caller: { name?: string; email?: string; uid: string }): string {
  return caller.name ?? caller.email?.split('@')[0] ?? caller.uid
}
