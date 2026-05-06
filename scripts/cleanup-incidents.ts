/**
 * One-shot cleanup script.
 *
 * - Keeps the 90 most recent incidents (by submitDate).
 * - Deletes the rest.
 * - Strips the legacy mock `assignee` field (USER1–USER8) from every kept doc.
 *
 * Run once:
 *   npx tsx scripts/cleanup-incidents.ts
 */

import { config } from 'dotenv'
import { resolve }  from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore }                  from 'firebase-admin/firestore'

if (getApps().length === 0) {
  const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS)
    : resolve(process.cwd(), 'service-account.json')
  initializeApp({ credential: cert(serviceAccountPath) })
}

const db = getFirestore()

const KEEP = 90
const BATCH_SIZE = 400  // Firestore batch limit is 500; stay well under

async function main() {
  console.log('[cleanup] Fetching all incidents…')

  const snap = await db.collection('incidents')
    .orderBy('submitDate', 'desc')
    .get()

  const total = snap.docs.length
  console.log(`[cleanup] Found ${total} incidents total`)

  if (total <= KEEP) {
    console.log(`[cleanup] Already at or under ${KEEP} — nothing to delete`)
  }

  const toKeep   = snap.docs.slice(0, KEEP)
  const toDelete = snap.docs.slice(KEEP)

  console.log(`[cleanup] Keeping ${toKeep.length} · Deleting ${toDelete.length}`)

  // ── Delete excess incidents in batches ───────────────────────────────────
  let deletedCount = 0
  for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
    const chunk = toDelete.slice(i, i + BATCH_SIZE)
    const batch = db.batch()
    chunk.forEach(doc => batch.delete(doc.ref))
    await batch.commit()
    deletedCount += chunk.length
    console.log(`[cleanup] Deleted ${deletedCount}/${toDelete.length}…`)
  }

  if (toDelete.length > 0) {
    console.log(`[cleanup] ✓ Deleted ${toDelete.length} incidents`)
  }

  // ── Strip mock assignee from kept incidents ──────────────────────────────
  const MOCK_PATTERN = /^USER\d+$/

  let patchCount = 0
  for (let i = 0; i < toKeep.length; i += BATCH_SIZE) {
    const chunk = toKeep.slice(i, i + BATCH_SIZE)
    const batch = db.batch()
    let batchHasWrites = false

    for (const doc of chunk) {
      const data = doc.data()
      const hasMockAssignee = typeof data.assignee === 'string' && MOCK_PATTERN.test(data.assignee)
      // Also clear any assignees array entries that look like mock IDs
      const hasMockAssignees = Array.isArray(data.assignees) && data.assignees.length > 0
        && data.assignees.every((a: { uid: string }) => MOCK_PATTERN.test(a.uid))

      if (hasMockAssignee || hasMockAssignees) {
        batch.update(doc.ref, {
          assignee:  '',
          ...(hasMockAssignees ? { assignees: [] } : {}),
        })
        batchHasWrites = true
        patchCount++
      }
    }

    if (batchHasWrites) await batch.commit()
  }

  console.log(`[cleanup] ✓ Cleared mock assignee fields on ${patchCount} kept incidents`)
  console.log(`[cleanup] Done — ${toKeep.length} incidents remain`)
}

main().catch(err => {
  console.error('[cleanup] Error:', err)
  process.exit(1)
})
