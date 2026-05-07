import { unstable_cache } from 'next/cache'
import { NextResponse } from 'next/server'
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin'
import type { Alarm, DashboardSummary, Incident } from '@/types'
import type { NextRequest } from 'next/server'

const INCIDENT_LIST_LIMIT = 100
const RESOLVED_ALARM_LIMIT = 100
const LONG_LIVED_ALARM_LIMIT = 20
const LONG_LIVED_THRESHOLD_MS = 24 * 60 * 60_000
const DASHBOARD_SUMMARY_REVALIDATE_SECONDS = 60

const getCachedDashboardSummary = unstable_cache(
  async (): Promise<DashboardSummary> => {
    const db = getAdminDb()

    const [resolvedSnap, longLivedSnap, incidentsSnap] = await Promise.all([
      db.collection('alarms')
        .where('resolved', '==', true)
        .orderBy('cancelTime', 'desc')
        .limit(RESOLVED_ALARM_LIMIT)
        .get(),
      db.collection('alarms')
        .where('resolved', '==', true)
        .where('durationMs', '>=', LONG_LIVED_THRESHOLD_MS)
        .orderBy('durationMs', 'desc')
        .limit(LONG_LIVED_ALARM_LIMIT)
        .get(),
      db.collection('incidents')
        .orderBy('submitDate', 'desc')
        .limit(INCIDENT_LIST_LIMIT)
        .get(),
    ])

    return {
      resolvedAlarms: resolvedSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Alarm)),
      longLivedAlarms: longLivedSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Alarm)),
      incidents: incidentsSnap.docs.map(doc => doc.data() as Incident),
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

    await getAdminAuth().verifyIdToken(authHeader.slice(7))

    const summary = await getCachedDashboardSummary()
    return NextResponse.json(summary)
  } catch (error) {
    console.error('[/api/dashboard/summary]', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
