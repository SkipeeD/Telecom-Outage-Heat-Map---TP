import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { requireAuth, isAuthError } from '@/lib/route-auth'
import type { Incident } from '@/types'

export const runtime = 'nodejs'

const INCIDENT_LIST_LIMIT = 500

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (isAuthError(auth)) return auth

  try {
    const db = getAdminDb()
    const snapshot = await db.collection('incidents')
      .orderBy('submitDate', 'desc')
      .limit(INCIDENT_LIST_LIMIT)
      .get()
    const incidents: Incident[] = snapshot.docs.map(d => d.data() as Incident)
    return NextResponse.json({ incidents })
  } catch (error) {
    console.error('[/api/incidents]', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
