import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { requireAuth, isAuthError } from '@/lib/route-auth'
import type { ChatMessage } from '@/types'

export const runtime = 'nodejs'

const MESSAGE_LIMIT = 200

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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ incidentNumber: string }> }
) {
  const auth = await requireAuth(req)
  if (isAuthError(auth)) return auth

  const { incidentNumber } = await params

  try {
    const db = getAdminDb()
    const snapshot = await db
      .collection('chats')
      .doc(incidentNumber)
      .collection('messages')
      .limit(MESSAGE_LIMIT)
      .get()

    const messages: ChatMessage[] = snapshot.docs
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

    return NextResponse.json({ messages })
  } catch (error) {
    console.error('[/api/chat GET]', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ incidentNumber: string }> }
) {
  const auth = await requireAuth(req)
  if (isAuthError(auth)) return auth

  const { incidentNumber } = await params

  try {
    const { text, senderId, senderName } = await req.json() as {
      text: string
      senderId: string
      senderName: string
    }

    const trimmedText = text?.trim()
    if (!trimmedText || !senderId?.trim()) {
      return NextResponse.json({ error: 'Missing text or senderId' }, { status: 400 })
    }

    const db = getAdminDb()
    const ref = db.collection('chats').doc(incidentNumber).collection('messages').doc()
    await ref.set({
      text: trimmedText,
      senderId: senderId.trim(),
      senderName: senderName?.trim() || 'Engineer',
      timestamp: new Date().toISOString(),
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[/api/chat POST]', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
