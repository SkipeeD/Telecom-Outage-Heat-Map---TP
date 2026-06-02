'use client'

import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Incident, LiveSnapshot } from '@/types'

const EMPTY_TOTALS: LiveSnapshot['totals'] = {
  byStatus:      { ASSIGNED: 0, 'IN PROGRESS': 0, RESOLVED: 0, CLOSED: 0 },
  openByUrgency: { '1-Critical': 0, '2-High': 0, '3-Medium': 0, '4-Low': 0 },
}

interface UseLiveSnapshotResult {
  snapshot: LiveSnapshot | null
  /** True until the first onSnapshot callback fires. */
  loading: boolean
  /** Open incidents as an array, most-recent-first. Derived from openIncidents map. */
  openIncidents: Incident[]
}

/**
 * Subscribes to meta/liveSnapshot. This is the single hot read path for the
 * UI — clients pay 1 Firestore read per server-side change, and zero reads
 * when nothing is happening.
 *
 * Pass `enabled=false` while auth is pending to avoid a transient "permission
 * denied" listener error.
 */
export function useLiveSnapshot(enabled = true): UseLiveSnapshotResult {
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!enabled) return
    const ref = doc(db, 'meta', 'liveSnapshot')
    const unsubscribe = onSnapshot(
      ref,
      snap => {
        if (!snap.exists()) {
          setSnapshot(null)
        } else {
          const data = snap.data() as Partial<LiveSnapshot>
          setSnapshot({
            version:         typeof data.version === 'number' ? data.version : 0,
            updatedAt:       data.updatedAt ?? new Date(0).toISOString(),
            antennaSeverity: data.antennaSeverity ?? {},
            activeAlarms:    data.activeAlarms ?? [],
            openIncidents:   data.openIncidents ?? {},
            totals: {
              byStatus:      { ...EMPTY_TOTALS.byStatus,      ...(data.totals?.byStatus ?? {}) },
              openByUrgency: { ...EMPTY_TOTALS.openByUrgency, ...(data.totals?.openByUrgency ?? {}) },
            },
          })
        }
        setLoading(false)
      },
      err => {
        console.error('[useLiveSnapshot] subscription error:', err)
        setLoading(false)
      }
    )
    return unsubscribe
  }, [enabled])

  const openIncidents = snapshot
    ? Object.values(snapshot.openIncidents).sort(
        (a, b) => new Date(b.submitDate).getTime() - new Date(a.submitDate).getTime()
      )
    : []

  return { snapshot, loading, openIncidents }
}
