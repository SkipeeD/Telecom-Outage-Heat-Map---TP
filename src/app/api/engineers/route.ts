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
    const snapshot = await db.collection('users').where('role', '==', 'engineer').get()
    const engineers: UserProfile[] = snapshot.docs.map(d => d.data() as UserProfile)
    // Deduplicate by uid
    const unique = [...new Map(engineers.map(e => [e.uid, e])).values()]
    return NextResponse.json({ engineers: unique })
  } catch (error) {
    console.error('[/api/engineers]', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
