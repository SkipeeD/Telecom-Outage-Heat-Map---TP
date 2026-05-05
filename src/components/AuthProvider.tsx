'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { getIdTokenResult, onAuthStateChanged, User } from 'firebase/auth'
import { auth, db } from '@/lib/firebase'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { usePathname, useRouter } from 'next/navigation'
import type { UserProfile } from '@/types'

interface AuthContextType {
  user: User | null
  profile: UserProfile | null
  loading: boolean
  setProfile: (profile: UserProfile) => void
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  setProfile: () => {},
})

export const useAuth = () => useContext(AuthContext)

function parseRoleClaim(role: unknown): UserProfile['role'] | undefined {
  return role === 'admin' || role === 'engineer' || role === 'user'
    ? role
    : undefined
}

function getFallbackProfile(firebaseUser: User, role: UserProfile['role'] = 'user'): UserProfile {
  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email ?? '',
    displayName: firebaseUser.displayName ?? undefined,
    role,
    createdAt: new Date().toISOString(),
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const pathname = usePathname()
  const router = useRouter()

  // 1. Listen for Auth State Changes (Registered ONCE)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser)

      if (firebaseUser) {
        let roleFromClaim: UserProfile['role'] | undefined

        try {
          const tokenResult = await getIdTokenResult(firebaseUser, true)
          roleFromClaim = parseRoleClaim(tokenResult.claims.role)

          const profileRef = doc(db, 'users', firebaseUser.uid)
          const profileSnap = await getDoc(profileRef)
          
          if (profileSnap.exists()) {
            const firestoreProfile = profileSnap.data() as UserProfile
            setProfile({
              ...firestoreProfile,
              role: roleFromClaim ?? firestoreProfile.role,
            })
          } else {
            // New user or missing profile
            const newProfile = getFallbackProfile(firebaseUser)
            await setDoc(profileRef, newProfile)
            setProfile({
              ...newProfile,
              role: roleFromClaim ?? newProfile.role,
            })
          }
        } catch (error) {
          console.error("Error fetching/creating profile:", error)
          setProfile(getFallbackProfile(firebaseUser, roleFromClaim))
        }
      } else {
        setProfile(null)
      }
      setLoading(false)
    })

    return () => unsubscribe()
  }, []) // Empty dependency array: runs only once on mount

  // 2. Handle Redirection (Responsive to user and pathname changes)
  useEffect(() => {
    if (loading) return

    const isPublicRoute = ['/login', '/register', '/verify-email'].includes(pathname)
    const isVerified = user?.emailVerified || (user && user.providerData.some(p => p.providerId === 'google.com'))

    if (user) {
      if (isVerified) {
        // Set auth session cookie
        document.cookie = `auth-session=true; path=/; max-age=${60 * 60 * 24 * 7}; samesite=lax`
        
        // Immediate redirect to dashboard if on a public page
        if (isPublicRoute) {
          router.replace('/dashboard')
          // If the router is stuck, force with window
          setTimeout(() => {
            const currentPath = window.location.pathname
            if (['/login', '/register', '/verify-email'].includes(currentPath)) {
              window.location.href = '/dashboard'
            }
          }, 800)
        }
      } else {
        document.cookie = 'auth-session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
        if (pathname !== '/verify-email') {
          router.replace('/verify-email')
        }
      }
    } else {
      document.cookie = 'auth-session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
      if (!isPublicRoute) {
        router.replace('/login')
      }
    }
  }, [user, loading, pathname, router])

  return (
    <AuthContext.Provider value={{ user, profile, loading, setProfile }}>
      {loading ? (
        <div className="flex h-screen w-full items-center justify-center bg-bg-primary text-text-secondary font-mono text-sm uppercase tracking-widest">
          Authenticating...
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  )
}
