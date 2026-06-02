/**
 * Reset all RESOLVED and CLOSED incidents back to ASSIGNED status.
 *
 * Run once to undo the simulator's auto-resolution behaviour:
 *   yarn tsx scripts/reset-incidents.ts
 *
 * Also rebuilds the live snapshot's openIncidents map and totals so
 * the UI immediately reflects the new state without a page reload.
 */

import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import type { Incident } from '../src/types'

if (getApps().length === 0) {
  const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS)
    : resolve(process.cwd(), 'service-account.json')
  initializeApp({ credential: cert(serviceAccountPath) })
}

const db = getFirestore()

async function run() {
  console.log('[reset-incidents] Fetching RESOLVED and CLOSED incidents…')

  const [resolvedSnap, closedSnap] = await Promise.all([
    db.collection('incidents').where('status', '==', 'RESOLVED').get(),
    db.collection('incidents').where('status', '==', 'CLOSED').get(),
  ])

  const docs = [...resolvedSnap.docs, ...closedSnap.docs]
  console.log(`[reset-incidents] Found ${docs.length} incidents to reset`)

  if (docs.length === 0) {
    console.log('[reset-incidents] Nothing to do.')
    return
  }

  // Firestore batches are limited to 500 writes each
  const BATCH_SIZE = 400
  let resetCount = 0

  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const chunk = docs.slice(i, i + BATCH_SIZE)
    const batch = db.batch()

    for (const doc of chunk) {
      batch.update(doc.ref, {
        status:       'ASSIGNED',
        resolvedDate: null,
        closedDate:   null,
        assignees:    [],
      })
    }

    await batch.commit()
    resetCount += chunk.length
    console.log(`[reset-incidents] Reset ${resetCount}/${docs.length}`)
  }

  // ── Rebuild live snapshot ────────────────────────────────────────────────
  console.log('[reset-incidents] Rebuilding live snapshot…')

  const liveRef = db.collection('meta').doc('liveSnapshot')
  const liveSnap = await liveRef.get()

  // Fetch freshly reset incidents to populate openIncidents (no artificial cap —
  // each incident is ~500 bytes; Firestore's 1 MB doc limit supports ~2000 incidents)
  const freshSnap = await db.collection('incidents')
    .where('status', '==', 'ASSIGNED')
    .limit(1000)
    .get()

  const openIncidents: Record<string, Incident> = {}
  const openByUrgency: Record<string, number> = {
    '1-Critical': 0, '2-High': 0, '3-Medium': 0, '4-Low': 0,
  }

  for (const doc of freshSnap.docs) {
    const inc = doc.data() as Incident
    openIncidents[inc.incidentNumber] = inc
    openByUrgency[inc.urgency] = (openByUrgency[inc.urgency] ?? 0) + 1
  }

  // Count totals
  const [assignedCount, inProgressCount] = await Promise.all([
    db.collection('incidents').where('status', '==', 'ASSIGNED').count().get(),
    db.collection('incidents').where('status', '==', 'IN PROGRESS').count().get(),
  ])

  const patch = {
    openIncidents,
    'totals.byStatus.ASSIGNED':     assignedCount.data().count,
    'totals.byStatus.IN PROGRESS':  inProgressCount.data().count,
    'totals.byStatus.RESOLVED':     0,
    'totals.byStatus.CLOSED':       0,
    'totals.openByUrgency':         openByUrgency,
    version:   FieldValue.increment(1),
    updatedAt: new Date().toISOString(),
  }

  if (liveSnap.exists) {
    await liveRef.update(patch)
  } else {
    await liveRef.set(patch)
  }

  console.log(`[reset-incidents] Done — ${resetCount} incidents reset to ASSIGNED, live snapshot updated.`)
  console.log(`[reset-incidents] Open incidents in snapshot: ${Object.keys(openIncidents).length}`)
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
