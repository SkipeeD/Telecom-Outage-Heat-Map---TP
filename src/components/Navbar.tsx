'use client'

import { useAuth } from './AuthProvider'
import { auth } from '@/lib/firebase'
import { signOut } from 'firebase/auth'
import { usePathname } from 'next/navigation'

export default function Navbar() {
  const { user } = useAuth()
  const pathname = usePathname()

  const isAuthPage = pathname === '/login' || pathname === '/register'

  if (!user || isAuthPage) {
    return null
  }

  const handleSignOut = async () => {
    try {
      await signOut(auth)
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  return (
    <header className="h-12 flex-shrink-0 flex items-center justify-between px-4 border-b border-border-subtle bg-bg-surface">
      <div className="flex items-center gap-4">
        <h1 className="text-sm font-semibold uppercase tracking-wider text-text-primary">
          Telecom Outage Heat Map
        </h1>

        {/* Live Status Indicator */}
        <div className="flex items-center gap-2 px-2 py-1 rounded bg-bg-elevated border border-border-subtle">
          <div className="w-2 h-2 rounded-full bg-alarm-ok animate-pulse" />
          <span className="text-[10px] font-mono font-medium text-alarm-ok uppercase">
            System Live
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <span className="text-xs font-mono text-text-secondary">
          {user.email}
        </span>
        <button
          onClick={handleSignOut}
          className="text-xs font-medium text-text-secondary hover:text-text-primary transition-colors uppercase tracking-wider"
        >
          Sign Out
        </button>
      </div>
    </header>
  )
}
