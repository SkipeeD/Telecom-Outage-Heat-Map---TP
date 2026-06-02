import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { requireAuth, isAuthError } from '@/lib/route-auth'
import { snapshotOnIncidentCreated, snapshotOnIncidentUpdated } from '@/lib/live-snapshot'
import { logIncidentActivity, actorName } from '@/lib/incident-activity'
import type { Alarm, Antenna, AlarmSeverity, Incident, Technology } from '@/types'

export const runtime = 'nodejs'

const SITE_MERGE_RADIUS_M = 500
const OPEN_STATUSES = ['ASSIGNED', 'IN PROGRESS']
const SITE_LIMIT = 50

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function severityToUrgency(severity: AlarmSeverity): Incident['urgency'] {
  switch (severity) {
    case 'critical': return '1-Critical'
    case 'major':    return '2-High'
    case 'minor':    return '3-Medium'
    default:         return '4-Low'
  }
}

function priorityRank(priority: string): number {
  switch (priority) {
    case '1-Critical': return 1
    case '2-High':     return 2
    case '3-Medium':   return 3
    default:           return 4
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (isAuthError(auth)) return auth
  const caller = auth

  try {
    const { alarm, primaryAntenna, allAntennas } = await req.json() as {
      alarm: Alarm
      primaryAntenna: Antenna
      allAntennas?: Antenna[]
    }

    if (!alarm || !primaryAntenna) {
      return NextResponse.json({ error: 'Missing alarm or primaryAntenna' }, { status: 400 })
    }

    const db = getAdminDb()

    // Build scope: find all antennas within merge radius
    const siteIds = new Set<string>([alarm.siteId])
    const antennaIds = new Set<string>([alarm.antennaId])
    if (allAntennas) {
      for (const a of allAntennas) {
        if (a.id === primaryAntenna.id) continue
        const dist = haversineM(primaryAntenna.latitude, primaryAntenna.longitude, a.latitude, a.longitude)
        if (dist <= SITE_MERGE_RADIUS_M) {
          siteIds.add(a.siteId)
          antennaIds.add(a.id)
        }
      }
    }
    const scopeSiteIds = [...siteIds]
    const scopeAntennaIds = [...antennaIds]

    // Find open incidents for any of these sites
    const seen = new Set<string>()
    const openIncidents: Incident[] = []
    await Promise.all(scopeSiteIds.map(async siteId => {
      const [snapNew, snapLegacy] = await Promise.all([
        db.collection('incidents').where('siteIds', 'array-contains', siteId).limit(SITE_LIMIT).get(),
        db.collection('incidents').where('siteId', '==', siteId).limit(SITE_LIMIT).get(),
      ])
      for (const d of [...snapNew.docs, ...snapLegacy.docs]) {
        if (seen.has(d.id)) continue
        seen.add(d.id)
        const inc = d.data() as Incident
        if (OPEN_STATUSES.includes(inc.status)) openIncidents.push(inc)
      }
    }))
    openIncidents.sort((a, b) => new Date(a.submitDate).getTime() - new Date(b.submitDate).getTime())

    const urgency = severityToUrgency(alarm.severity)
    const impact = alarm.severity === 'critical' ? '2-Significant/Large' : '4-Minor/Localized'
    const existing = openIncidents[0]

    if (existing) {
      const existingPriority = existing.priority ?? existing.urgency
      const shouldEscalate = priorityRank(urgency) < priorityRank(existingPriority)
      await Promise.all([
        db.collection('incidents').doc(existing.incidentNumber).update({
          siteIds:      FieldValue.arrayUnion(...scopeSiteIds),
          antennaIds:   FieldValue.arrayUnion(...scopeAntennaIds),
          alarmIds:     FieldValue.arrayUnion(alarm.id),
          technologies: FieldValue.arrayUnion(alarm.technology as Technology),
          ...(shouldEscalate ? { urgency, priority: urgency, impact } : {}),
        }),
        db.collection('alarms').doc(alarm.id).update({ incidentId: existing.incidentNumber }),
      ])

      const next: Incident = {
        ...existing,
        siteIds:      Array.from(new Set([...(existing.siteIds ?? [existing.siteId]), ...scopeSiteIds])),
        antennaIds:   Array.from(new Set([...(existing.antennaIds ?? [existing.antennaId]), ...scopeAntennaIds])),
        alarmIds:     Array.from(new Set([...(existing.alarmIds ?? [existing.alarmId]), alarm.id])),
        technologies: Array.from(new Set<Technology>([...(existing.technologies ?? [existing.technology]), alarm.technology as Technology])),
        ...(shouldEscalate ? { urgency, priority: urgency, impact } : {}),
      }
      await snapshotOnIncidentUpdated(existing, next, db)
      return NextResponse.json({ incidentNumber: existing.incidentNumber })
    }

    const incidentNumber = `INC${Date.now()}`
    const newIncident: Incident = {
      incidentNumber,
      submitDate:   new Date().toISOString(),
      alarmId:      alarm.id,
      antennaId:    alarm.antennaId,
      technology:   alarm.technology,
      siteId:       alarm.siteId,
      siteIds:      scopeSiteIds,
      antennaIds:   scopeAntennaIds,
      alarmIds:     [alarm.id],
      technologies: [alarm.technology],
      status:       'ASSIGNED',
      urgency,
      impact,
      priority:     urgency,
      closedDate:   null,
      assignee:     '',
      assignees:    [],
      resolvedDate: null,
    }
    await db.collection('incidents').doc(incidentNumber).set(newIncident)
    await db.collection('alarms').doc(alarm.id).update({ incidentId: incidentNumber })
    await snapshotOnIncidentCreated(newIncident, db)
    void logIncidentActivity(db, incidentNumber, {
      type:      'created',
      actorUid:  caller.uid,
      actorName: actorName(caller),
      message:   `Incident created for site ${alarm.siteId} (${alarm.technology}, ${alarm.severity})`,
      timestamp: newIncident.submitDate,
    })

    return NextResponse.json({ incidentNumber })
  } catch (error) {
    console.error('[/api/incidents/create]', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
