import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { requireAuth, isAuthError } from '@/lib/route-auth'
import type { Alarm } from '@/types'

export const runtime = 'nodejs'

const CELL_HISTORY_LIMIT = 50

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (isAuthError(auth)) return auth

  const antennaId = req.nextUrl.searchParams.get('antennaId')
  const tech = req.nextUrl.searchParams.get('tech')

  if (!antennaId || !tech) {
    return NextResponse.json({ error: 'Missing antennaId or tech' }, { status: 400 })
  }

  try {
    const db = getAdminDb()
    const snapshot = await db.collection('alarms')
      .where('antennaId', '==', antennaId)
      .where('technology', '==', tech)
      .limit(CELL_HISTORY_LIMIT)
      .get()

    const alarms: Alarm[] = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() } as Alarm))
      .sort((a, b) => new Date(b.alarmTime).getTime() - new Date(a.alarmTime).getTime())

    return NextResponse.json({ alarms })
  } catch (error) {
    console.error('[/api/alarms/cell]', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
