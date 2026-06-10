import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin'
import { snapshotOnIncidentUpdated } from '@/lib/live-snapshot'
import { logIncidentActivity, actorName } from '@/lib/incident-activity'
import { clearHistoryCache } from '@/app/api/incidents/history/route'
import type { Incident, UserProfile } from '@/types'
import { NextRequest, NextResponse } from 'next/server'

type Action = 'resolve' | 'close'
type Role = UserProfile['role']

function isValidAction(v: unknown): v is Action {
  return v === 'resolve' || v === 'close'
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

    const role = caller.role as Role | undefined
    if (role !== 'engineer' && role !== 'admin' && role !== 'technician') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { incidentNumber, action } = await req.json()

    if (typeof incidentNumber !== 'string' || !incidentNumber.startsWith('INC')) {
      return NextResponse.json({ error: 'Invalid incidentNumber' }, { status: 400 })
    }
    if (!isValidAction(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    const ref = db.collection('incidents').doc(incidentNumber)
    const snap = await ref.get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'Incident not found' }, { status: 404 })
    }

    const incident = snap.data() as Incident
    // The owning engineers (assignees) or the dispatched field technicians may
    // drive the incident lifecycle; admins always may.
    const assignedToCaller =
      (incident.assignees ?? []).some(a => a.uid === caller.uid) ||
      (incident.technicians ?? []).some(t => t.uid === caller.uid)
    if (role !== 'admin' && !assignedToCaller) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let next: Incident
    if (action === 'resolve') {
      if (incident.status !== 'IN PROGRESS') {
        return NextResponse.json({ error: 'Incident must be IN PROGRESS to resolve' }, { status: 409 })
      }
      const resolvedDate = new Date().toISOString()
      await ref.update({ status: 'RESOLVED', resolvedDate, closedDate: null })
      next = { ...incident, status: 'RESOLVED', resolvedDate, closedDate: null }
    } else {
      if (incident.status !== 'RESOLVED') {
        return NextResponse.json({ error: 'Incident must be RESOLVED to close' }, { status: 409 })
      }
      const closedDate = new Date().toISOString()
      await ref.update({ status: 'CLOSED', closedDate })
      next = { ...incident, status: 'CLOSED', closedDate }
    }

    await snapshotOnIncidentUpdated(incident, next, db)
    clearHistoryCache()
    void logIncidentActivity(db, incidentNumber, {
      type:      action === 'resolve' ? 'resolved' : 'closed',
      actorUid:  caller.uid,
      actorName: actorName(caller),
      message:   action === 'resolve' ? 'Incident marked as resolved' : 'Incident closed',
      timestamp: action === 'resolve' ? next.resolvedDate! : next.closedDate!,
    })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
