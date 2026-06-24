import { unstable_cache } from 'next/cache'
import { NextResponse } from 'next/server'
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin'
import type { Alarm, DashboardSummary, Incident } from '@/types'
import type { NextRequest } from 'next/server'

const INCIDENT_LIST_LIMIT = 500
const RESOLVED_ALARM_LIMIT = 100
const LONG_LIVED_ALARM_LIMIT = 20
const LONG_LIVED_THRESHOLD_MS = 24 * 60 * 60_000
const DASHBOARD_SUMMARY_REVALIDATE_SECONDS = 5 * 60

export const runtime = 'nodejs'

/**
 * Runs a Firestore query and maps documents to type T.
 * Errors are caught and logged per-query so one failing query doesn't block
 * the others; an empty array is returned instead of throwing.
 */
async function readQuery<T>(
  label: string,
  queryPromise: Promise<FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>>,
  mapDoc: (doc: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>) => T
): Promise<T[]> {
  try {
    const snapshot = await queryPromise
    return snapshot.docs.map(mapDoc)
  } catch (error) {
    console.error(`[/api/dashboard/summary] ${label} query failed`, error)
    return []
  }
}

/**
 * Returns true when the error message indicates Firebase Admin SDK credentials
 * are missing or malformed. Used to return a 503 rather than a generic 401 so
 * the client can display a more helpful "configuration" error.
 */
function isAdminCredentialError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('Could not load the default credentials') ||
    message.includes('GOOGLE_APPLICATION_CREDENTIALS') ||
    message.includes('Failed to parse private key') ||
    message.includes('service account')
}

const getCachedDashboardSummary = unstable_cache(
  async (): Promise<DashboardSummary> => {
    const db = getAdminDb()

    const [resolvedAlarms, longLivedAlarms, incidents] = await Promise.all([
      readQuery(
        'resolved alarms',
        db.collection('alarms')
          .where('resolved', '==', true)
          .orderBy('cancelTime', 'desc')
          .limit(RESOLVED_ALARM_LIMIT)
          .get(),
        doc => ({ id: doc.id, ...doc.data() } as Alarm)
      ),
      readQuery(
        'long-lived alarms',
        db.collection('alarms')
          .where('resolved', '==', true)
          .where('durationMs', '>=', LONG_LIVED_THRESHOLD_MS)
          .orderBy('durationMs', 'desc')
          .limit(LONG_LIVED_ALARM_LIMIT)
          .get(),
        doc => ({ id: doc.id, ...doc.data() } as Alarm)
      ),
      readQuery(
        'incidents',
        db.collection('incidents')
          .orderBy('submitDate', 'desc')
          .limit(INCIDENT_LIST_LIMIT)
          .get(),
        doc => doc.data() as Incident
      ),
    ])

    return {
      resolvedAlarms,
      longLivedAlarms,
      incidents,
      updatedAt: new Date().toISOString(),
    }
  },
  ['dashboard-summary-v1'],
  {
    revalidate: DASHBOARD_SUMMARY_REVALIDATE_SECONDS,
    tags: ['dashboard-summary'],
  },
)

/*
 * Dashboard Summary API Route
 * Note: The main dashboard and engineer pages have been moved to real-time Firestore
 * subscriptions for better responsiveness. This route remains for potential
 * non-client-side data needs or legacy fallback, and provides a cached overview
 * of network health.
 */

/**
 * GET /api/dashboard/summary
 *
 * Returns a cached network-health overview containing recent resolved alarms,
 * long-lived alarms (≥24 h), and the latest incidents. The data is revalidated
 * every 5 minutes via Next.js data cache.
 *
 * Auth: Bearer token in Authorization header (manually verified here because
 * this handler predates the shared requireAuth helper).
 *
 * Returns: DashboardSummary
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
      await getAdminAuth().verifyIdToken(authHeader.slice(7))
    } catch (error) {
      if (isAdminCredentialError(error)) {
        console.error('[/api/dashboard/summary] admin credentials unavailable', error)
        return NextResponse.json({ error: 'Firebase Admin credentials unavailable' }, { status: 503 })
      }

      console.error('[/api/dashboard/summary] token verification failed', error)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const summary = await getCachedDashboardSummary()
    return NextResponse.json(summary)
  } catch (error) {
    console.error('[/api/dashboard/summary]', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
