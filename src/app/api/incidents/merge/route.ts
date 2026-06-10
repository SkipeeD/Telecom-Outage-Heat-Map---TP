import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { requireAuth, isAuthError } from '@/lib/route-auth'
import { snapshotOnIncidentUpdated } from '@/lib/live-snapshot'
import { logIncidentActivity, actorName } from '@/lib/incident-activity'
import { sendEngineerAssignmentNotification } from '@/lib/email'
import { getIncidentDocByNumber } from '@/lib/incident-doc'
import type { Incident } from '@/types'

export const runtime = 'nodejs'

function unique<T>(items: T[]): T[] {
  return [...new Set(items)]
}

function priorityRank(priority: string): number {
  switch (priority) {
    case '1-Critical': return 1
    case '2-High':     return 2
    case '3-Medium':   return 3
    default:           return 4
  }
}

function incidentSites(i: Incident): string[] {
  return i.siteIds?.length ? i.siteIds : [i.siteId]
}
function incidentAntennas(i: Incident): string[] {
  return i.antennaIds?.length ? i.antennaIds : [i.antennaId]
}
function incidentAlarms(i: Incident): string[] {
  return i.alarmIds?.length ? i.alarmIds : [i.alarmId]
}
function incidentTechnologies(i: Incident) {
  return i.technologies?.length ? i.technologies : [i.technology]
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (isAuthError(auth)) return auth
  const caller = auth

  try {
    const { target, source } = await req.json() as { target: Incident; source: Incident }

    if (!target?.incidentNumber || !source?.incidentNumber) {
      return NextResponse.json({ error: 'Missing target or source' }, { status: 400 })
    }
    if (target.incidentNumber === source.incidentNumber) {
      return NextResponse.json({ ok: true })
    }

    const db = getAdminDb()
    const [targetDoc, sourceDoc] = await Promise.all([
      getIncidentDocByNumber(db, target.incidentNumber),
      getIncidentDocByNumber(db, source.incidentNumber),
    ])
    if (!targetDoc || !sourceDoc) {
      return NextResponse.json({ error: 'Incident not found' }, { status: 404 })
    }
    const currentTarget = targetDoc.incident
    const currentSource = sourceDoc.incident
    const now = new Date().toISOString()
    const targetPriority = currentTarget.priority ?? currentTarget.urgency
    const sourcePriority = currentSource.priority ?? currentSource.urgency
    const shouldEscalate = priorityRank(sourcePriority) < priorityRank(targetPriority)

    const targetOwner = (currentTarget.assignees ?? [])[0] ?? null
    const sourceOwner = (currentSource.assignees ?? [])[0] ?? null
    const nextOwner = targetOwner ?? sourceOwner
    const nextAssignees = nextOwner ? [nextOwner] : []

    await Promise.all([
      targetDoc.ref.update({
        siteIds:      unique([...incidentSites(currentTarget), ...incidentSites(currentSource)]),
        antennaIds:   unique([...incidentAntennas(currentTarget), ...incidentAntennas(currentSource)]),
        alarmIds:     unique([...incidentAlarms(currentTarget), ...incidentAlarms(currentSource)]),
        technologies: unique([...incidentTechnologies(currentTarget), ...incidentTechnologies(currentSource)]),
        assignee:     nextOwner?.uid ?? '',
        assignees:    nextAssignees,
        ...(shouldEscalate ? {
          urgency:  currentSource.urgency,
          priority: currentSource.priority,
          impact:   currentSource.impact,
        } : {}),
      }),
      sourceDoc.ref.update({
        status:       'CLOSED',
        closedDate:   now,
        resolvedDate: currentSource.resolvedDate ?? now,
        mergedInto:   currentTarget.incidentNumber,
      }),
    ])

    const sourceAlarmIds = incidentAlarms(currentSource)
    await Promise.all(sourceAlarmIds.map(alarmId =>
      db.collection('alarms').doc(alarmId).update({ incidentId: currentTarget.incidentNumber }).catch(() => {})
    ))

    // Mirror in liveSnapshot: target gains scope (and possibly urgency),
    // source transitions to CLOSED.
    const nextTarget: Incident = {
      ...currentTarget,
      siteIds:      unique([...incidentSites(currentTarget), ...incidentSites(currentSource)]),
      antennaIds:   unique([...incidentAntennas(currentTarget), ...incidentAntennas(currentSource)]),
      alarmIds:     unique([...incidentAlarms(currentTarget), ...incidentAlarms(currentSource)]),
      technologies: unique([...incidentTechnologies(currentTarget), ...incidentTechnologies(currentSource)]),
      assignee:     nextOwner?.uid ?? '',
      assignees:    nextAssignees,
      ...(shouldEscalate ? { urgency: currentSource.urgency, priority: currentSource.priority, impact: currentSource.impact } : {}),
    }
    const nextSource: Incident = {
      ...currentSource,
      status:       'CLOSED',
      closedDate:   now,
      resolvedDate: currentSource.resolvedDate ?? now,
      mergedInto:   currentTarget.incidentNumber,
    }
    await Promise.all([
      snapshotOnIncidentUpdated(currentTarget, nextTarget, db),
      snapshotOnIncidentUpdated(currentSource, nextSource, db),
    ])

    const name = actorName(caller)
    void logIncidentActivity(db, target.incidentNumber, {
      type:      'merged',
      actorUid:  caller.uid,
      actorName: name,
      message:   `Merged ${currentSource.incidentNumber} into this incident`,
      timestamp: now,
    })

    // If the target was unowned, the source owner becomes the single owner.
    if (!targetOwner && sourceOwner) {
      void sendEngineerAssignmentNotification({
        engineerEmail: sourceOwner.email,
        engineerName:  sourceOwner.displayName,
        incident:      nextTarget,
        technicians:   nextTarget.technicians ?? [],
      })
    }

    void logIncidentActivity(db, source.incidentNumber, {
      type:      'merged',
      actorUid:  caller.uid,
      actorName: name,
      message:   `Merged into ${currentTarget.incidentNumber}`,
      timestamp: now,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[/api/incidents/merge]', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
