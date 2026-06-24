import { initializeApp, getApps, getApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore'

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

// Reuse the existing Firebase app if already initialised (hot-reload / multi-import safe).
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp()

/**
 * Returns a Firestore instance with offline persistence enabled in the browser.
 * On the server (SSR / API routes) persistence is skipped — the IndexedDB API
 * is unavailable in Node.js. The try/catch handles the case where
 * initializeFirestore has already been called (e.g. in tests or HMR).
 */
function getConfiguredFirestore() {
  if (typeof window === 'undefined') return getFirestore(app)

  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({
        // Allow multiple browser tabs to share the same local cache.
        tabManager: persistentMultipleTabManager(),
      }),
    })
  } catch {
    // Already initialised — just return the existing instance.
    return getFirestore(app)
  }
}

export const auth = getAuth(app)
export const db   = getConfiguredFirestore()
export const googleProvider = new GoogleAuthProvider()
