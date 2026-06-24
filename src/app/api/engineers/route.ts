import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { requireAuth, isAuthError } from '@/lib/route-auth'
import type { UserProfile } from '@/types'

export const runtime = 'nodejs'

/**
 * GET /api/engineers
 *
 * Returns all user profiles that carry the "engineer" role, deduplicated by uid.
 * Used by the admin assignment panel to populate the engineer picker.
 * The deduplication step guards against legacy docs that were written twice
 * before the uid field was introduced.
 *
 * Returns: { engineers: UserProfile[] }
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (isAuthError(auth)) return auth

  try {
    const db = getAdminDb()
    const snapshot = await db.collection('users').where('role', '==', 'engineer').get()
    // Pin uid to the doc id — some user docs predate the `uid` field.
    const engineers: UserProfile[] = snapshot.docs.map(d => ({
      ...(d.data() as UserProfile),
      uid: (d.data().uid as string) ?? d.id,
    }))
    // Deduplicate by uid
    const unique = [...new Map(engineers.map(e => [e.uid, e])).values()]
    return NextResponse.json({ engineers: unique })
  } catch (error) {
    console.error('[/api/engineers]', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
