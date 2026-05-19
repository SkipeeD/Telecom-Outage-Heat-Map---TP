import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { requireAuth, isAuthError } from '@/lib/route-auth'
import type { Incident } from '@/types'

export const runtime = 'nodejs'

const SITE_LIMIT = 50

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (isAuthError(auth)) return auth

  const siteId = req.nextUrl.searchParams.get('siteId')
  if (!siteId) return NextResponse.json({ error: 'Missing siteId' }, { status: 400 })

  try {
    const db = getAdminDb()
    const [snapNew, snapLegacy] = await Promise.all([
      db.collection('incidents').where('siteIds', 'array-contains', siteId).limit(SITE_LIMIT).get(),
      db.collection('incidents').where('siteId', '==', siteId).limit(SITE_LIMIT).get(),
    ])

    const seen = new Set<string>()
    const incidents: Incident[] = []
    for (const d of [...snapNew.docs, ...snapLegacy.docs]) {
      if (!seen.has(d.id)) {
        seen.add(d.id)
        incidents.push(d.data() as Incident)
      }
    }
    incidents.sort((a, b) => new Date(b.submitDate).getTime() - new Date(a.submitDate).getTime())

    return NextResponse.json({ incidents })
  } catch (error) {
    console.error('[/api/incidents/site]', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
