import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin'
import type { UserProfile } from '@/types'
import { NextRequest, NextResponse } from 'next/server'

const AUTH_LOOKUP_CHUNK_SIZE = 100

/**
 * Safely maps a raw Firestore document to a UserProfile, falling back to safe
 * defaults for missing or invalid fields. The doc's `id` is used as the uid
 * fallback for legacy documents that predate the uid field.
 */
function toUserProfile(id: string, data: FirebaseFirestore.DocumentData): UserProfile {
  return {
    uid: typeof data.uid === 'string' ? data.uid : id,
    email: typeof data.email === 'string' ? data.email : '',
    displayName: typeof data.displayName === 'string' ? data.displayName : undefined,
    role:
      data.role === 'admin' || data.role === 'engineer' || data.role === 'technician'
        ? data.role
        : 'user',
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : new Date(0).toISOString(),
  }
}

/**
 * GET /api/users
 *
 * Returns all Firestore user profiles enriched with live display names and
 * emails from Firebase Auth. Only admins may call this endpoint.
 *
 * Auth records are fetched in chunks of AUTH_LOOKUP_CHUNK_SIZE (100) to stay
 * within the Firebase Admin `getUsers` batch limit. Profiles whose uid no
 * longer exists in Auth are filtered out, preventing stale ghost accounts
 * from appearing in the admin user management table.
 *
 * Returns: { users: UserProfile[] }
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const adminAuth = getAdminAuth()
    const caller = await adminAuth.verifyIdToken(authHeader.slice(7))

    if (caller.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const snapshot = await getAdminDb().collection('users').get()
    const profiles = snapshot.docs.map(doc => toUserProfile(doc.id, doc.data()))
    const existingAuthUsers = new Map<string, { email?: string; displayName?: string }>()

    for (let i = 0; i < profiles.length; i += AUTH_LOOKUP_CHUNK_SIZE) {
      const chunk = profiles.slice(i, i + AUTH_LOOKUP_CHUNK_SIZE)
      const result = await adminAuth.getUsers(chunk.map(user => ({ uid: user.uid })))

      result.users.forEach(user => {
        existingAuthUsers.set(user.uid, {
          email: user.email,
          displayName: user.displayName,
        })
      })
    }

    // Drop profiles whose uid is absent from Auth — they're orphaned Firestore docs.
    const users = profiles
      .filter(user => existingAuthUsers.has(user.uid))
      .map(user => {
        const authUser = existingAuthUsers.get(user.uid)
        return {
          ...user,
          email: authUser?.email ?? user.email,
          displayName: authUser?.displayName ?? user.displayName,
        }
      })

    return NextResponse.json({ users })
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
