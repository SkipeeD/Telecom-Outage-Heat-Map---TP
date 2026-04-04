'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged, User } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { usePathname, useRouter } from 'next/navigation'

interface AuthContextType {
  user: User | null
  loading: boolean
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
})

export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user)
      setLoading(false)

      // Public routes that don't need auth
      const isPublicRoute = ['/login', '/register', '/verify-email'].includes(pathname)

      // Only set the session cookie for verified users
      if (user && user.emailVerified) {
        document.cookie = `auth-session=true; path=/; max-age=${60 * 60 * 24 * 7}; samesite=lax`
        
        // If on a public route but logged in, redirect to map
        if (isPublicRoute) {
          router.push('/map')
        }
      } else {
        document.cookie = 'auth-session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
        
        // If NOT on a public route and NOT logged in, redirect to login
        if (!user && !isPublicRoute) {
          router.push('/login')
        }
        
        // If logged in but not verified, and not already on verify page, redirect to verify
        if (user && !user.emailVerified && pathname !== '/verify-email') {
          router.push('/verify-email')
        }
      }
    })

    return () => unsubscribe()
  }, [pathname, router])

  return (
    <AuthContext.Provider value={{ user, loading }}>
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
