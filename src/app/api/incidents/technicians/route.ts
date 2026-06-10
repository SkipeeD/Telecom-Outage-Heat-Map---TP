import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { requireAuth, isAuthError } from '@/lib/route-auth'
import { snapshotOnIncidentUpdated } from '@/lib/live-snapshot'
import { logIncidentActivity, actorName } from '@/lib/incident-activity'
import { sendAssignmentNotification } from '@/lib/email'
import type { Incident, IncidentAssignee } from '@/types'

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

    const db = getAdminDb()
    const ref = db.collection('incidents').doc(incidentNumber)
    const snap = await ref.get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'Incident not found' }, { status: 404 })
    }
    const prev = snap.data() as Incident
    await ref.update({ technicians })

    // Keep the open-incident mirror in sync so technicians see new dispatches
    // without a refresh. Status/urgency unchanged so totals don't move.
    if (prev.status === 'ASSIGNED' || prev.status === 'IN PROGRESS') {
      await snapshotOnIncidentUpdated(prev, { ...prev, technicians }, db)
    }

    const prevUids = new Set((prev.technicians ?? []).map(t => t.uid))
    const nextUids = new Set(technicians.map(t => t.uid))
    const now = new Date().toISOString()
    const name = actorName(caller)

    for (const t of technicians) {
      if (!prevUids.has(t.uid)) {
        void logIncidentActivity(db, incidentNumber, {
          type:      'assigned',
          actorUid:  caller.uid,
          actorName: name,
          message:   `Dispatched technician ${t.displayName ?? t.email} to this incident`,
          timestamp: now,
        })

        // Notify the technician via email
        void sendAssignmentNotification({
          engineerEmail:  t.email,
          incidentNumber: incidentNumber,
          location:       prev.siteIds?.join(', ') || prev.siteId || 'Unknown',
          urgency:        prev.urgency || 'N/A',
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
