import type { Firestore, DocumentData, DocumentReference } from 'firebase-admin/firestore'
import type { Incident } from '@/types'

export interface IncidentDoc {
  ref: DocumentReference
  incident: Incident
}

export function incidentFromDoc(id: string, data: DocumentData): Incident {
  return {
    ...(data as Incident),
    incidentNumber: (data.incidentNumber as string | undefined) ?? id,
  }
}

export async function getIncidentDocByNumber(db: Firestore, incidentNumber: string): Promise<IncidentDoc | null> {
  const directRef = db.collection('incidents').doc(incidentNumber)
  const directSnap = await directRef.get()
  if (directSnap.exists) {
    return {
      ref:      directRef,
      incident: incidentFromDoc(directSnap.id, directSnap.data() ?? {}),
    }
  }

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
