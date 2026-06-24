import type { Firestore, DocumentData, DocumentReference } from 'firebase-admin/firestore'
import type { Incident } from '@/types'

/** Pairs a Firestore document reference with the decoded incident data it contains. */
export interface IncidentDoc {
  ref: DocumentReference
  incident: Incident
}

/**
 * Converts a raw Firestore document into a typed Incident.
 * Falls back to the document ID as the incidentNumber for older docs that were
 * created before the field was explicitly stored.
 */
export function incidentFromDoc(id: string, data: DocumentData): Incident {
  return {
    ...(data as Incident),
    incidentNumber: (data.incidentNumber as string | undefined) ?? id,
  }
}

/**
 * Looks up an incident by its human-readable number (e.g. "INC0000001").
 * First tries a direct doc read using the number as the document ID (the common
 * case for incidents created by this app). Falls back to a collection query for
 * any legacy documents whose Firestore ID differs from the incidentNumber field.
 * Returns null if the incident does not exist.
 */
export async function getIncidentDocByNumber(db: Firestore, incidentNumber: string): Promise<IncidentDoc | null> {
  const directRef = db.collection('incidents').doc(incidentNumber)
  const directSnap = await directRef.get()
  if (directSnap.exists) {
    return {
      ref:      directRef,
      incident: incidentFromDoc(directSnap.id, directSnap.data() ?? {}),
    }
  }

  // Fallback query for legacy documents where docId !== incidentNumber.
  const querySnap = await db.collection('incidents')
    .where('incidentNumber', '==', incidentNumber)
    .limit(1)
    .get()

  const match = querySnap.docs[0]
  if (!match) return null

  return {
    ref:      match.ref,
    incident: incidentFromDoc(match.id, match.data()),
  }
}
