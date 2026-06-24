import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { requireAuth, isAuthError } from '@/lib/route-auth'
import { incidentFromDoc } from '@/lib/incident-doc'
import type { Incident } from '@/types'

export const runtime = 'nodejs'

const MAX_PAGE_SIZE = 50

// Short TTL — history changes whenever an incident is resolved or closed.
// The lifecycle route calls clearHistoryCache() to invalidate immediately on writes.
const CACHE_TTL_MS = 60 * 1000
const cache = new Map<string, { data: Incident[]; expiresAt: number }>()

/** Called by the lifecycle route after any resolve/close to bust stale data. */
export function clearHistoryCache() {
  cache.clear()
}

/**
 * Fetches a page of RESOLVED or CLOSED incidents with optional filters.
 * Results are cached in a module-level Map keyed by the full parameter set;
 * entries expire after CACHE_TTL_MS (1 min) or when clearHistoryCache() is
 * called by the lifecycle route after a resolve/close write.
 *
 * @param cursor    - ISO timestamp of the last item from the previous page
 *                    (exclusive lower bound for "before this date" pagination)
 * @param limit     - page size, capped at MAX_PAGE_SIZE
 * @param assigneeUid - if set, only incidents where this uid is an assignee
 * @param sinceIso  - if set, only incidents submitted on or after this ISO date
 */
async function fetchHistoryPage(cursor: string, limit: number, assigneeUid: string, sinceIso: string): Promise<Incident[]> {
  const key = `${cursor}|${limit}|${assigneeUid}|${sinceIso}`
  const hit = cache.get(key)
  if (hit && hit.expiresAt > Date.now()) return hit.data

  const db = getAdminDb()
  // Avoid composite index requirement by fetching both statuses separately
  // and sorting in memory. Single-field indexes on 'status' are auto-created.
  const [resolvedSnap, closedSnap] = await Promise.all([
    db.collection('incidents').where('status', '==', 'RESOLVED').get(),
    db.collection('incidents').where('status', '==', 'CLOSED').get(),
  ])

  let docs = [
    ...resolvedSnap.docs.map(d => incidentFromDoc(d.id, d.data())),
    ...closedSnap.docs.map(d => incidentFromDoc(d.id, d.data())),
  ]

  if (sinceIso) docs = docs.filter(i => i.submitDate >= sinceIso)
  if (assigneeUid) docs = docs.filter(i => (i.assignees ?? []).some(a => a.uid === assigneeUid))

  // Sort descending by submitDate, then paginate
  docs.sort((a, b) => (a.submitDate > b.submitDate ? -1 : a.submitDate < b.submitDate ? 1 : 0))
  if (cursor) docs = docs.filter(i => i.submitDate < cursor)
  docs = docs.slice(0, limit)

  cache.set(key, { data: docs, expiresAt: Date.now() + CACHE_TTL_MS })
  return docs
}

/**
 * GET /api/incidents/history
 *
 * Returns a cursor-paginated list of RESOLVED and CLOSED incidents, newest
 * first. The `cursor` is the `submitDate` of the last item received; passing
 * it in the next request fetches the following page.
 *
 * Query params:
 *   - cursor      (optional): ISO timestamp for pagination
 *   - limit       (optional): page size, 1–50, default 25
 *   - assigneeUid (optional): filter to incidents assigned to this uid
 *   - sinceIso    (optional): filter to incidents submitted on/after this date
 *
 * Returns: { incidents: Incident[]; nextCursor: string | null }
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (isAuthError(auth)) return auth

  const url = req.nextUrl
  const cursor      = url.searchParams.get('cursor')      ?? ''
  const limitParam  = parseInt(url.searchParams.get('limit') ?? '25', 10)
  const limit       = Math.min(MAX_PAGE_SIZE, Math.max(1, isNaN(limitParam) ? 25 : limitParam))
  const assigneeUid = url.searchParams.get('assigneeUid') ?? ''
  const sinceIso    = url.searchParams.get('sinceIso')    ?? ''

  try {
    const incidents = await fetchHistoryPage(cursor, limit, assigneeUid, sinceIso)
    // If we got a full page, there may be more — pass the last item's date as the next cursor.
    const nextCursor = incidents.length === limit
      ? incidents[incidents.length - 1].submitDate
      : null
    return NextResponse.json({ incidents, nextCursor })
  } catch (error) {
    console.error('[/api/incidents/history]', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
