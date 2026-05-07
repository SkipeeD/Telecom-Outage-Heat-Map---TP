import { applicationDefault, cert, getApps, initializeApp, type Credential } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

function getAdminCredential(): Credential {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))
  }

  return applicationDefault()
}

function getAdminApp() {
  if (getApps().length) return getApps()[0]!

  return initializeApp({
    credential: getAdminCredential(),
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  })
}

export function getAdminAuth() {
  return getAuth(getAdminApp())
}

export function getAdminDb() {
  return getFirestore(getAdminApp())
}
