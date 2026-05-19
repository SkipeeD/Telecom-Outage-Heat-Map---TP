import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { requireAuth, isAuthError } from '@/lib/route-auth'
import type { IncidentAssignee } from '@/types'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (isAuthError(auth)) return auth

  try {
    const { incidentNumber, assignees } = await req.json() as {
      incidentNumber: string
      assignees: IncidentAssignee[]
    }

    if (!incidentNumber || !Array.isArray(assignees)) {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    }

    const db = getAdminDb()
    await db.collection('incidents').doc(incidentNumber).update({ assignees })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[/api/incidents/assignees]', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
