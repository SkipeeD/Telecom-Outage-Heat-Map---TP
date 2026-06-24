import { applicationDefault, cert, getApps, initializeApp, type Credential } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

/**
 * Resolves the Firebase Admin credential at runtime.
 * In production the full service-account JSON is injected via an env var.
 * In local development / Cloud Run the Application Default Credential is used
 * (i.e. `gcloud auth application-default login` or the attached service account).
 */
function getAdminCredential(): Credential {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))
  }

  return applicationDefault()
}

/**
 * Lazily initialises the Firebase Admin SDK singleton.
 * Subsequent calls return the already-initialised app so server-side modules
 * can safely call getAdminAuth() / getAdminDb() without double-initialising.
 */
function getAdminApp() {
  if (getApps().length) return getApps()[0]!

  return initializeApp({
    credential: getAdminCredential(),
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  })
}

/** Returns the Admin Auth service — used in API routes for token verification. */
export function getAdminAuth() {
  return getAuth(getAdminApp())
}

/** Returns the Admin Firestore service — used in server-side read/write routes. */
export function getAdminDb() {
  return getFirestore(getAdminApp())
}
