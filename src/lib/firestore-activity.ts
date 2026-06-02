'use client'

import { collection, query, orderBy, limit, onSnapshot, addDoc } from 'firebase/firestore'
import { db } from './firebase'
import type { IncidentActivity } from '@/types'

const ACTIVITY_LIMIT = 200

function toIsoTimestamp(value: unknown): string {
  if (typeof value === 'string') {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? new Date(0).toISOString() : value
  }
  if (value instanceof Date) return value.toISOString()
  if (value && typeof value === 'object' && 'toDate' in value) {
    const toDate = (value as { toDate?: unknown }).toDate
    if (typeof toDate === 'function') {
      const d = toDate.call(value) as unknown
      if (d instanceof Date && !Number.isNaN(d.getTime())) return d.toISOString()
    }
  }
  return new Date(0).toISOString()
}

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
