import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin'
import type { Incident, UserProfile } from '@/types'
import { NextRequest, NextResponse } from 'next/server'

type Role = UserProfile['role']

function isIncidentNumberList(value: unknown): value is string[] {
  return Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 20 &&
    value.every(item => typeof item === 'string' && item.startsWith('INC'))
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const adminAuth = getAdminAuth()
    const db = getAdminDb()
    const caller = await adminAuth.verifyIdToken(authHeader.slice(7))

    const profileSnap = await db.collection('users').doc(caller.uid).get()
    const role = (profileSnap.data()?.role ?? caller.role) as Role | undefined
    if (role !== 'engineer' && role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { incidentNumbers } = await req.json()
    if (!isIncidentNumberList(incidentNumbers)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    let updated: string[] = []

    await db.runTransaction(async tx => {
      const nextUpdated: string[] = []

      for (const incidentNumber of incidentNumbers) {
        const ref = db.collection('incidents').doc(incidentNumber)
        const snap = await tx.get(ref)

        if (!snap.exists) {
          throw new Error('NOT_FOUND')
        }

        const incident = snap.data() as Incident
        const assignedToCaller = (incident.assignees ?? []).some(a => a.uid === caller.uid)

        if (role !== 'admin' && !assignedToCaller) {
          throw new Error('FORBIDDEN')
        }

        if (incident.status === 'ASSIGNED') {
          tx.update(ref, { status: 'IN PROGRESS' })
          nextUpdated.push(incidentNumber)
        }
      }

      updated = nextUpdated
    })

    return NextResponse.json({ updated })
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'FORBIDDEN') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      if (error.message === 'NOT_FOUND') {
        return NextResponse.json({ error: 'Incident not found' }, { status: 404 })
      }
    }

    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
