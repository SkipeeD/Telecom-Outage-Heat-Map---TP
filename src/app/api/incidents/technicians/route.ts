import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { requireAuth, isAuthError } from '@/lib/route-auth'
import { snapshotOnIncidentUpdated } from '@/lib/live-snapshot'
import { logIncidentActivity, actorName } from '@/lib/incident-activity'
import { sendTechnicianAssignmentNotification } from '@/lib/email'
import { getIncidentDocByNumber } from '@/lib/incident-doc'
import type { IncidentAssignee } from '@/types'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (isAuthError(auth)) return auth
  const caller = auth

  // Only engineers (dispatchers) and admins may dispatch field technicians.
  if (caller.role !== 'engineer' && caller.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { incidentNumber, technicians } = await req.json() as {
      incidentNumber: string
      technicians: IncidentAssignee[]
    }

    if (!incidentNumber || !Array.isArray(technicians)) {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    }

    const invalidTechnician = technicians.some(t =>
      !t ||
      typeof t.uid !== 'string' ||
      typeof t.email !== 'string' ||
      (t.displayName !== undefined && typeof t.displayName !== 'string')
    )
    if (invalidTechnician) {
      return NextResponse.json({ error: 'Invalid technician' }, { status: 400 })
    }
    const nextTechnicians = [...new Map(technicians.map(t => [t.uid, t])).values()]

    const db = getAdminDb()
    const doc = await getIncidentDocByNumber(db, incidentNumber)
    if (!doc) {
      return NextResponse.json({ error: 'Incident not found' }, { status: 404 })
    }
    const { ref, incident: prev } = doc
    if (caller.role === 'engineer' && !(prev.assignees ?? []).some(a => a.uid === caller.uid)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    await ref.update({ technicians: nextTechnicians })

    // Keep the open-incident mirror in sync so technicians see new dispatches
    // without a refresh. Status/urgency unchanged so totals don't move.
    const nextIncident = { ...prev, technicians: nextTechnicians }
    if (prev.status === 'ASSIGNED' || prev.status === 'IN PROGRESS') {
      await snapshotOnIncidentUpdated(prev, nextIncident, db)
    }

    const prevUids = new Set((prev.technicians ?? []).map(t => t.uid))
    const nextUids = new Set(nextTechnicians.map(t => t.uid))
    const now = new Date().toISOString()
    const name = actorName(caller)
    const assignedEngineer = (prev.assignees ?? [])[0] ?? null

    for (const t of nextTechnicians) {
      if (!prevUids.has(t.uid)) {
        void logIncidentActivity(db, incidentNumber, {
          type:      'assigned',
          actorUid:  caller.uid,
          actorName: name,
          message:   `Dispatched technician ${t.displayName ?? t.email} to this incident`,
          timestamp: now,
        })

        // Notify the technician via email
        void sendTechnicianAssignmentNotification({
          technicianEmail: t.email,
          technicianName:  t.displayName,
          incident:        nextIncident,
          assignedEngineer,
          technicians:     nextTechnicians,
        })
      }
    }
    for (const t of (prev.technicians ?? [])) {
      if (!nextUids.has(t.uid)) {
        void logIncidentActivity(db, incidentNumber, {
          type:      'unassigned',
          actorUid:  caller.uid,
          actorName: name,
          message:   `Removed technician ${t.displayName ?? t.email} from this incident`,
          timestamp: now,
        })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[/api/incidents/technicians]', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
