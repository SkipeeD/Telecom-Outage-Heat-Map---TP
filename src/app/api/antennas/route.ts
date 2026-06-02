import { unstable_cache } from 'next/cache'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { requireAuth, isAuthError } from '@/lib/route-auth'
import type { Antenna, AlarmSeverity } from '@/types'

export const runtime = 'nodejs'

// Topology positions don't change at runtime — the simulator only mutates the
// `cells` field, and the map page no longer reads cell state from this route
// (it comes from meta/liveSnapshot). A long TTL keeps the static read count
// near zero. Severity changes flow through liveSnapshot in real time.
const CACHE_TTL_S = 6 * 60 * 60 // 6 hours

// ─── Severity helpers ────────────────────────────────────────────────────────

const SEV_ORDER: AlarmSeverity[] = ['critical', 'major', 'minor', 'warning', 'ok']

function worstSeverity(antenna: Antenna): AlarmSeverity {
  for (const s of SEV_ORDER) {
    if (antenna.cells.some(c => c.status === s)) return s
  }
  return 'ok'
}

function computeCounts(antennas: Antenna[]): Record<string, number> {
  const counts: Record<string, number> = {
    all: 0, critical: 0, major: 0, minor: 0, warning: 0, ok: 0,
  }
  for (const a of antennas) {
    counts.all++
    counts[worstSeverity(a)]++
  }
  return counts
}

// ─── Cache layers ────────────────────────────────────────────────────────────

/**
 * Primary cache: Next.js data cache (persists across serverless invocations).
 * Revalidates every 60 s — one Firestore read regardless of how many users poll.
 */
const fetchTopologyFromFirestore = unstable_cache(
  async (): Promise<Antenna[]> => {
    const db = getAdminDb()
    const snapshot = await db.collection('topology').get()
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Antenna))
  },
  ['topology-v1'],
  { revalidate: CACHE_TTL_S },
)

/**
 * Stale fallback: module-level variable that survives within a running process.
 * If Firestore quota is exceeded and the Next.js cache has also expired,
 * we serve the last successfully-fetched topology instead of returning 500.
 */
let staleCache: Antenna[] | null = null

async function getTopology(): Promise<{ antennas: Antenna[]; fromStale: boolean }> {
  try {
    const antennas = await fetchTopologyFromFirestore()
    staleCache = antennas          // update stale backup on every success
    return { antennas, fromStale: false }
  } catch (err) {
    if (staleCache) {
      console.warn('[/api/antennas] Firestore unavailable — serving stale cache', err)
      return { antennas: staleCache, fromStale: true }
    }
    throw err
  }
}

// ─── Route handler ───────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (isAuthError(auth)) return auth

  const severity = req.nextUrl.searchParams.get('severity') ?? ''

  try {
    const { antennas: all, fromStale } = await getTopology()

    // Counts always reflect the FULL topology so the filter bar stays accurate
    const counts = computeCounts(all)

    // Filter the returned antenna list if a specific severity was requested
    const validSeverities: string[] = ['critical', 'major', 'minor', 'warning', 'ok']
    const antennas =
      severity && validSeverities.includes(severity)
        ? all.filter(a => a.cells.some(c => c.status === severity))
        : all

    return NextResponse.json(
      { antennas, counts },
      fromStale
        ? { headers: { 'X-Cache': 'STALE' } }
        : { headers: { 'X-Cache': 'HIT' } },
    )
  } catch (error) {
    console.error('[/api/antennas]', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
