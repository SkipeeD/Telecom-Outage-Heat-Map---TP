import { unstable_cache } from 'next/cache'
import { NextResponse } from 'next/server'
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin'
import type { Alarm, DashboardSummary, Incident } from '@/types'
import type { NextRequest } from 'next/server'

const INCIDENT_LIST_LIMIT = 100
const RESOLVED_ALARM_LIMIT = 100
const LONG_LIVED_ALARM_LIMIT = 20
const LONG_LIVED_THRESHOLD_MS = 24 * 60 * 60_000
const DASHBOARD_SUMMARY_REVALIDATE_SECONDS = 5 * 60

export const runtime = 'nodejs'

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
