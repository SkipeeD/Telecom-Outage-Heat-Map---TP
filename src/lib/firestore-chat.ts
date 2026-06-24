'use client'

import { collection, query, limit, onSnapshot } from 'firebase/firestore'
import { db } from './firebase'
import type { ChatMessage } from '@/types'

const MESSAGE_LIMIT = 200

/**
 * Normalises any timestamp shape Firestore might return into an ISO string.
 * Handles raw ISO strings, JS Date objects, and Firestore Timestamp objects.
 * Falls back to epoch on invalid input so callers never receive undefined/NaN.
 */
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

/**
 * Opens a real-time Firestore listener on an incident's chat messages and
 * calls `callback` with all messages sorted chronologically on every change.
 * Returns an unsubscribe function — call it on component unmount.
 * Note: Firestore does not guarantee delivery order, so messages are re-sorted
 * in the snapshot handler rather than relying on orderBy.
 */
export function subscribeToMessages(
  incidentNumber: string,
  callback: (messages: ChatMessage[]) => void,
  onError?: (err: Error) => void
): () => void {
  const q = query(collection(db, 'chats', incidentNumber, 'messages'), limit(MESSAGE_LIMIT))
  return onSnapshot(
    q,
    snapshot => {
      const msgs = snapshot.docs
        .map(d => {
          const data = d.data()
          if (typeof data.text !== 'string' || !data.text.trim()) return null
          if (typeof data.senderId !== 'string' || !data.senderId.trim()) return null
          return {
            id: d.id,
            text: data.text,
            senderId: data.senderId,
            senderName: typeof data.senderName === 'string' && data.senderName.trim()
              ? data.senderName
              : 'Engineer',
            timestamp: toIsoTimestamp(data.timestamp),
          } satisfies ChatMessage
        })
        .filter((m): m is ChatMessage => m !== null)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      callback(msgs)
    },
    err => {
      console.error('subscribeToMessages error:', err)
      onError?.(err)
    }
  )
}
