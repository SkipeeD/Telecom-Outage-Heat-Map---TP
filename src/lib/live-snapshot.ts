import { FieldValue } from 'firebase-admin/firestore'
import type { Firestore } from 'firebase-admin/firestore'
import type { Incident } from '@/types'

/**
 * meta/liveSnapshot maintenance for backend write routes.
 *
 * This is the same atomic-field-update pattern the simulator uses: each writer
 * issues field-path updates (FieldValue.increment / FieldValue.delete) so the
 * simulator and any number of concurrent API requests can mutate distinct
 * entries of the same doc without read-modify-write conflicts.
 *
 * Drift between this and the incident write is bounded — the simulator
 * rebuilds antennaSeverity every tick and the field-path updates are atomic
 * with respect to each other.
 */

const LIVE_SNAPSHOT_PATH = 'meta/liveSnapshot'

function isOpenStatus(status: Incident['status']): status is 'ASSIGNED' | 'IN PROGRESS' {
  return status === 'ASSIGNED' || status === 'IN PROGRESS'
}

function ref(db: Firestore) {
  return db.doc(LIVE_SNAPSHOT_PATH)
}

function withMeta(patch: Record<string, unknown>): Record<string, unknown> {
  return {
    ...patch,
    version:   FieldValue.increment(1),
    updatedAt: new Date().toISOString(),
  }
}

/**
 * Record a newly created incident. Called from /api/incidents/create.
 */
export async function snapshotOnIncidentCreated(incident: Incident, db: Firestore) {
  const patch: Record<string, unknown> = {
    [`totals.byStatus.${incident.status}`]: FieldValue.increment(1),
  }
  if (isOpenStatus(incident.status)) {
    patch[`openIncidents.${incident.incidentNumber}`] = incident
    patch[`totals.openByUrgency.${incident.urgency}`] = FieldValue.increment(1)
  }
  try {
    // update() treats dot-notation keys as nested field paths (e.g.
    // 'openIncidents.INC123' updates the INC123 field inside openIncidents).
    // set(merge:true) does NOT — it creates a literal top-level key.
    await ref(db).update(withMeta(patch))
  } catch (err) {
    console.error('[live-snapshot] create patch failed', err)
  }
}

/**
 * Record an update to an existing incident. Pass the previous and next states.
 * Used by lifecycle / assignees / merge / acknowledge routes.
 */
export async function snapshotOnIncidentUpdated(prev: Incident, next: Incident, db: Firestore) {
  const patch: Record<string, unknown> = {}

  if (prev.status !== next.status) {
    patch[`totals.byStatus.${prev.status}`] = FieldValue.increment(-1)
    patch[`totals.byStatus.${next.status}`] = FieldValue.increment(1)
    if (isOpenStatus(prev.status) && !isOpenStatus(next.status)) {
      patch[`totals.openByUrgency.${prev.urgency}`] = FieldValue.increment(-1)
    } else if (!isOpenStatus(prev.status) && isOpenStatus(next.status)) {
      patch[`totals.openByUrgency.${next.urgency}`] = FieldValue.increment(1)
    }
  } else if (isOpenStatus(prev.status) && prev.urgency !== next.urgency) {
    patch[`totals.openByUrgency.${prev.urgency}`] = FieldValue.increment(-1)
    patch[`totals.openByUrgency.${next.urgency}`] = FieldValue.increment(1)
  }

  if (isOpenStatus(next.status)) {
    patch[`openIncidents.${next.incidentNumber}`] = next
  } else {
    patch[`openIncidents.${next.incidentNumber}`] = FieldValue.delete()
  }

  if (Object.keys(patch).length === 0) return
  try {
    await ref(db).update(withMeta(patch))
  } catch (err) {
    console.error('[live-snapshot] update patch failed', err)
  }
}
