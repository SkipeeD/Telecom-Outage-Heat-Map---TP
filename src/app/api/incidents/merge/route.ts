import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { requireAuth, isAuthError } from '@/lib/route-auth'
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

  try {
    const { target, source } = await req.json() as { target: Incident; source: Incident }

    if (!target?.incidentNumber || !source?.incidentNumber) {
      return NextResponse.json({ error: 'Missing target or source' }, { status: 400 })
    }
    if (target.incidentNumber === source.incidentNumber) {
      return NextResponse.json({ ok: true })
    }

    const db = getAdminDb()
    const now = new Date().toISOString()
    const targetPriority = target.priority ?? target.urgency
    const sourcePriority = source.priority ?? source.urgency
    const shouldEscalate = priorityRank(sourcePriority) < priorityRank(targetPriority)

    const assigneesByUid = new Map(
      [...(target.assignees ?? []), ...(source.assignees ?? [])].map(a => [a.uid, a])
    )

    await Promise.all([
      db.collection('incidents').doc(target.incidentNumber).update({
        siteIds:      unique([...incidentSites(target), ...incidentSites(source)]),
        antennaIds:   unique([...incidentAntennas(target), ...incidentAntennas(source)]),
        alarmIds:     unique([...incidentAlarms(target), ...incidentAlarms(source)]),
        technologies: unique([...incidentTechnologies(target), ...incidentTechnologies(source)]),
        assignees:    [...assigneesByUid.values()],
        ...(shouldEscalate ? {
          urgency:  source.urgency,
          priority: source.priority,
          impact:   source.impact,
        } : {}),
      }),
      db.collection('incidents').doc(source.incidentNumber).update({
        status:       'CLOSED',
        closedDate:   now,
        resolvedDate: source.resolvedDate ?? now,
        mergedInto:   target.incidentNumber,
      }),
    ])

    const sourceAlarmIds = incidentAlarms(source)
    await Promise.all(sourceAlarmIds.map(alarmId =>
      db.collection('alarms').doc(alarmId).update({ incidentId: target.incidentNumber }).catch(() => {})
    ))

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[/api/incidents/merge]', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
