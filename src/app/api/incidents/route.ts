import { unstable_cache } from 'next/cache'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { requireAuth, isAuthError } from '@/lib/route-auth'
import { incidentFromDoc } from '@/lib/incident-doc'
import type { Incident } from '@/types'

export const runtime = 'nodejs'

const INCIDENT_LIST_LIMIT = 100
// Legacy endpoint — the live UI subscribes to meta/liveSnapshot for open
// incidents and uses /api/incidents/history for older ones. This route is
// kept for backwards-compat callers and is heavily cached to bound reads.
const LEGACY_LIST_TTL_S = 5 * 60

const fetchRecentIncidents = unstable_cache(
  async (): Promise<Incident[]> => {
    const db = getAdminDb()
    const snap = await db.collection('incidents')
      .orderBy('submitDate', 'desc')
      .limit(INCIDENT_LIST_LIMIT)
      .get()
    return snap.docs.map(d => incidentFromDoc(d.id, d.data()))
  },
  ['incidents-recent-v1'],
  { revalidate: LEGACY_LIST_TTL_S },
)

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (isAuthError(auth)) return auth

  try {
    const incidents = await fetchRecentIncidents()
    return NextResponse.json({ incidents })
  } catch (error) {
    console.error('[/api/incidents]', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
