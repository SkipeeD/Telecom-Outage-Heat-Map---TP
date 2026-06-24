import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { requireAuth, isAuthError } from '@/lib/route-auth'
import { snapshotOnIncidentUpdated } from '@/lib/live-snapshot'
import { logIncidentActivity, actorName } from '@/lib/incident-activity'
import { sendEngineerAssignmentNotification } from '@/lib/email'
import { getIncidentDocByNumber } from '@/lib/incident-doc'
import type { IncidentAssignee } from '@/types'

export const runtime = 'nodejs'

/**
 * POST /api/incidents/assignees
 *
 * Replaces the engineer assignee list for an incident. Only admins may call
 * this endpoint. At most one engineer can be assigned at a time; the request
 * is rejected if more than one unique assignee is provided.
 *
 * After updating Firestore the liveSnapshot is refreshed for ASSIGNED and
 * IN PROGRESS incidents, and activity log entries are written for each
 * newly added or removed engineer. A notification email is sent to each
 * newly assigned engineer (fire-and-forget).
 *
 * Body: { incidentNumber: string; assignees: IncidentAssignee[] }
 * Returns: { ok: true }
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (isAuthError(auth)) return auth
  const caller = auth

  if (caller.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { incidentNumber, assignees } = await req.json() as {
      incidentNumber: string
      assignees: IncidentAssignee[]
    }

    if (!incidentNumber || !Array.isArray(assignees)) {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    }

    const invalidAssignee = assignees.some(a =>
      !a ||
      typeof a.uid !== 'string' ||
      typeof a.email !== 'string' ||
      (a.displayName !== undefined && typeof a.displayName !== 'string')
    )
    if (invalidAssignee) {
      return NextResponse.json({ error: 'Invalid assignee' }, { status: 400 })
    }

    // Deduplicate by uid before applying the one-engineer limit.
    const nextAssignees = [...new Map(assignees.map(a => [a.uid, a])).values()]
    if (nextAssignees.length > 1) {
      return NextResponse.json({ error: 'Only one engineer can be assigned to an incident' }, { status: 400 })
    }

    const db = getAdminDb()
    const doc = await getIncidentDocByNumber(db, incidentNumber)
    if (!doc) {
      return NextResponse.json({ error: 'Incident not found' }, { status: 404 })
    }
    const { ref, incident: prev } = doc
    await ref.update({
      assignee:  nextAssignees[0]?.uid ?? '',
      assignees: nextAssignees,
    })

    // Only the open-incident list cares about assignees (so engineers see
    // their assignment update without a page refresh). Status/urgency are
    // unchanged so totals don't move.
    const nextIncident = {
      ...prev,
      assignee:  nextAssignees[0]?.uid ?? '',
      assignees: nextAssignees,
    }
    if (prev.status === 'ASSIGNED' || prev.status === 'IN PROGRESS') {
      await snapshotOnIncidentUpdated(prev, nextIncident, db)
    }

    // Compute added/removed sets to write targeted activity log entries.
    const prevUids = new Set((prev.assignees ?? []).map(a => a.uid))
    const nextUids = new Set(nextAssignees.map(a => a.uid))
    const now = new Date().toISOString()
    const name = actorName(caller)

    for (const a of nextAssignees) {
      if (!prevUids.has(a.uid)) {
        void logIncidentActivity(db, incidentNumber, {
          type:      'assigned',
          actorUid:  caller.uid,
          actorName: name,
          message:   `Assigned ${a.displayName ?? a.email} to this incident`,
          timestamp: now,
        })

        // Notify via email
        void sendEngineerAssignmentNotification({
          engineerEmail: a.email,
          engineerName:  a.displayName,
          incident:      nextIncident,
          technicians:   nextIncident.technicians ?? [],
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
