import type { Firestore } from 'firebase-admin/firestore'
import type { IncidentActivity } from '@/types'

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

export function actorName(caller: { name?: string; email?: string; uid: string }): string {
  return caller.name ?? caller.email?.split('@')[0] ?? caller.uid
}
