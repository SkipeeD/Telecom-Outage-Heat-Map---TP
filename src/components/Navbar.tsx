'use client'

import { useAuth } from './AuthProvider'
import { auth } from '@/lib/firebase'
import { signOut } from 'firebase/auth'
import { useRouter, usePathname } from 'next/navigation'
import { motion } from 'motion/react'
import { useTheme } from '@/hooks/useTheme'
import { SignalHigh } from "lucide-react"

export function ThemeToggle() {
  const { theme, toggle } = useTheme()

  return (
    <motion.button
      onClick={toggle}
      whileTap={{ scale: 0.92 }}
      className="
        w-8 h-8 rounded-[var(--radius-md)]
        bg-[var(--glass-bg)] border border-[var(--glass-border)]
        flex items-center justify-center
        text-[var(--text-secondary)] hover:text-[var(--text-primary)]
        hover:bg-[var(--glass-hover)]
        transition-colors duration-200
      "
      aria-label="Toggle theme"
    >
      {theme === 'dark' ? '☀' : '☾'}
    </motion.button>
  )
}

export default function Navbar() {
  const { user } = useAuth()
  const pathname = usePathname()
  const router = useRouter()

  const isAuthPage = ['/login', '/register', '/verify-email'].includes(pathname)

  if (!user || isAuthPage) {
    return null
  }

  const handleSignOut = async () => {
    try {
      await signOut(auth)
      router.push('/login')
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  return (
    <header className="
      h-14 flex-shrink-0 flex items-center justify-between px-6 
      border-b border-[var(--glass-border)] 
      bg-[var(--glass-bg)] backdrop-blur-xl
      z-50 transition-colors duration-300
    ">
      <div className="flex items-center gap-6">
        <motion.div 
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-3"
        >
          <div className="flex size-8 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent)] text-white shadow-[var(--shadow-glow)]">
            <SignalHigh className="size-5" />
          </div>
          <span className="font-semibold tracking-[0.2em] uppercase text-[14px] text-[var(--text-primary)]">
            SIGNALIS
          </span>
        </motion.div>
      </div>

      <div className="flex items-center gap-5">
        <div className="flex flex-col items-end">
          <span className="text-[13px] font-medium text-[var(--text-primary)] leading-none">
            {user.email?.split('@')[0]}
          </span>
          <span className="text-[11px] font-mono text-[var(--text-muted)] mt-1 uppercase tracking-tighter">
            NOC Engineer
          </span>
        </div>

        <div className="h-6 w-[1px] bg-[var(--glass-border)] mx-1" />

        <ThemeToggle />

        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={handleSignOut}
          className="
            text-[11px] font-medium uppercase tracking-widest px-3 py-1.5
            rounded-[var(--radius-md)] border border-[var(--glass-border)]
            text-[var(--text-secondary)] hover:text-[var(--text-primary)]
            hover:bg-[var(--glass-hover)] hover:border-[var(--border-strong)]
            transition-all duration-200
          "
        >
          Sign Out
        </motion.button>
      </div>
    </header>
  )
}
