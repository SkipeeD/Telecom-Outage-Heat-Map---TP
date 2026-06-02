import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { requireAuth, isAuthError } from '@/lib/route-auth'
import { snapshotOnIncidentUpdated } from '@/lib/live-snapshot'
import { logIncidentActivity, actorName } from '@/lib/incident-activity'
import type { Incident, IncidentAssignee } from '@/types'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (isAuthError(auth)) return auth
  const caller = auth

  try {
    const { incidentNumber, assignees } = await req.json() as {
      incidentNumber: string
      assignees: IncidentAssignee[]
    }

    if (!incidentNumber || !Array.isArray(assignees)) {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    }

    const db = getAdminDb()
    const ref = db.collection('incidents').doc(incidentNumber)
    const snap = await ref.get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'Incident not found' }, { status: 404 })
    }
    const prev = snap.data() as Incident
    await ref.update({ assignees })

    // Only the open-incident list cares about assignees (so engineers see
    // their assignment update without a page refresh). Status/urgency are
    // unchanged so totals don't move.
    if (prev.status === 'ASSIGNED' || prev.status === 'IN PROGRESS') {
      await snapshotOnIncidentUpdated(prev, { ...prev, assignees }, db)
    }

    const prevUids = new Set((prev.assignees ?? []).map(a => a.uid))
    const nextUids = new Set(assignees.map(a => a.uid))
    const now = new Date().toISOString()
    const name = actorName(caller)

    for (const a of assignees) {
      if (!prevUids.has(a.uid)) {
        void logIncidentActivity(db, incidentNumber, {
          type:      'assigned',
          actorUid:  caller.uid,
          actorName: name,
          message:   `Assigned ${a.displayName ?? a.email} to this incident`,
          timestamp: now,
        })
      }
    }
    for (const a of (prev.assignees ?? [])) {
      if (!nextUids.has(a.uid)) {
        void logIncidentActivity(db, incidentNumber, {
          type:      'unassigned',
          actorUid:  caller.uid,
          actorName: name,
          message:   `Removed ${a.displayName ?? a.email} from this incident`,
          timestamp: now,
        })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[/api/incidents/assignees]', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
