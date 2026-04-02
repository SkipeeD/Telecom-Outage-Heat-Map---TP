'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged, User } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { usePathname } from 'next/navigation'

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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user)
      setLoading(false)

      // Only set the session cookie for verified users
      if (user && user.emailVerified) {
        document.cookie = `auth-session=true; path=/; max-age=${60 * 60 * 24 * 7}; samesite=lax`
      } else {
        document.cookie = 'auth-session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
      }
    })

    return () => unsubscribe()
  }, [pathname])

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
