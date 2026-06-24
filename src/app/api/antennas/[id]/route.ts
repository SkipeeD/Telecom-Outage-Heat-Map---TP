import { unstable_cache } from 'next/cache'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { requireAuth, isAuthError } from '@/lib/route-auth'
import type { Antenna } from '@/types'

export const runtime = 'nodejs'

const ANTENNA_CACHE_TTL_S = 30

/**
 * Single-antenna read for the popup/details panel cell breakdown. Cached
 * server-side so a click storm or many users opening the same antenna only
 * costs one Firestore doc read per 30 s.
 *
 * The map page never calls this — pin colors come from meta/liveSnapshot.
 * This endpoint is for the per-cell drill-down only.
 */
const fetchAntenna = unstable_cache(
  async (id: string): Promise<Antenna | null> => {
    const db = getAdminDb()
    const snap = await db.collection('topology').doc(id).get()
    if (!snap.exists) return null
    return { id: snap.id, ...snap.data() } as Antenna
  },
  ['antenna-by-id-v1'],
  { revalidate: ANTENNA_CACHE_TTL_S },
)

/**
 * GET /api/antennas/[id]
 *
 * Returns a single antenna document from the `topology` collection.
 * Used by the map popup / details panel for the per-cell drill-down view.
 * The map pin colors themselves come from meta/liveSnapshot — this route
 * is only called when a user explicitly opens an antenna's detail panel.
 *
 * Path param:
 *   - id: Firestore topology doc id
 *
 * Returns: { antenna: Antenna } or 404 if the doc does not exist.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(req)
  if (isAuthError(auth)) return auth

  const { id } = await params
  if (!id) return NextResponse.json({ error: 'Missing antenna id' }, { status: 400 })

  try {
    const antenna = await fetchAntenna(id)
    if (!antenna) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ antenna })
  } catch (error) {
    console.error('[/api/antennas/[id]]', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
