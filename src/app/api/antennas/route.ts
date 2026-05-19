import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { requireAuth, isAuthError } from '@/lib/route-auth'
import type { Antenna } from '@/types'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (isAuthError(auth)) return auth

  try {
    const db = getAdminDb()
    const snapshot = await db.collection('topology').get()
    const antennas: Antenna[] = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Antenna))
    return NextResponse.json({ antennas })
  } catch (error) {
    console.error('[/api/antennas]', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
