'use client'

import { collection, query, orderBy, limit, onSnapshot, addDoc } from 'firebase/firestore'
import { db } from './firebase'
import type { IncidentActivity } from '@/types'

const ACTIVITY_LIMIT = 200

/**
 * Normalises any timestamp shape Firestore might return into an ISO string.
 * Handles raw ISO strings, JS Date objects, and Firestore Timestamp objects
 * (which have a `.toDate()` method). Falls back to epoch on invalid input so
 * the rest of the code never receives undefined/NaN.
 */
function toIsoTimestamp(value: unknown): string {
  if (typeof value === 'string') {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? new Date(0).toISOString() : value
  }
  if (value instanceof Date) return value.toISOString()
  // Firestore Timestamp duck-typing — avoid importing the Timestamp class client-side.
  if (value && typeof value === 'object' && 'toDate' in value) {
    const toDate = (value as { toDate?: unknown }).toDate
    if (typeof toDate === 'function') {
      const d = toDate.call(value) as unknown
      if (d instanceof Date && !Number.isNaN(d.getTime())) return d.toISOString()
    }
  }
  return new Date(0).toISOString()
}

/**
 * Opens a real-time Firestore listener on an incident's activity sub-collection
 * and calls `callback` with the full sorted list whenever a new entry is added.
 * Returns an unsubscribe function — call it on component unmount to avoid leaks.
 */
export function subscribeToActivity(
  incidentNumber: string,
  callback: (entries: IncidentActivity[]) => void,
  onError?: (err: Error) => void
): () => void {
  const q = query(
    collection(db, 'incidents', incidentNumber, 'activity'),
    orderBy('timestamp', 'asc'),
    limit(ACTIVITY_LIMIT)
  )
  return onSnapshot(
    q,
    snapshot => {
      const entries = snapshot.docs
        .map(d => {
          const data = d.data()
          if (typeof data.type !== 'string') return null
          if (typeof data.actorUid !== 'string') return null
          return {
            id:        d.id,
            type:      data.type as IncidentActivity['type'],
            actorUid:  data.actorUid,
            actorName: typeof data.actorName === 'string' ? data.actorName : 'Unknown',
            message:   typeof data.message === 'string' ? data.message : '',
            timestamp: toIsoTimestamp(data.timestamp),
          } satisfies IncidentActivity
        })
        .filter((e): e is IncidentActivity => e !== null)
      callback(entries)
    },
    err => {
      console.error('subscribeToActivity error:', err)
      onError?.(err)
    }
  )
}

/**
 * Appends a free-text note to an incident's activity log.
 * Used by engineers to record observations without changing incident status.
 */
export async function addIncidentNote(
  incidentNumber: string,
  text: string,
  actorUid: string,
  actorName: string
): Promise<void> {
  await addDoc(
    collection(db, 'incidents', incidentNumber, 'activity'),
    {
      type:      'note',
      actorUid,
      actorName,
      message:   text.trim(),
      timestamp: new Date().toISOString(),
    }
  )
}
