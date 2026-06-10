import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { requireAuth, isAuthError } from '@/lib/route-auth'
import type { UserProfile } from '@/types'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (isAuthError(auth)) return auth

  try {
    const db = getAdminDb()
    const snapshot = await db.collection('users').where('role', '==', 'technician').get()
    // Pin uid to the doc id — some user docs predate the `uid` field.
    const technicians: UserProfile[] = snapshot.docs.map(d => ({
      ...(d.data() as UserProfile),
      uid: (d.data().uid as string) ?? d.id,
    }))
    // Deduplicate by uid
    const unique = [...new Map(technicians.map(t => [t.uid, t])).values()]
    return NextResponse.json({ technicians: unique })
  } catch (error) {
    console.error('[/api/technicians]', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
