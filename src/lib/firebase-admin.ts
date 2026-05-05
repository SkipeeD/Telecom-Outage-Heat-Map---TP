import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

if (!getApps().length) {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
    : process.env.GOOGLE_APPLICATION_CREDENTIALS

  initializeApp({ credential: cert(serviceAccount) })
}

export const adminAuth = getAuth()
