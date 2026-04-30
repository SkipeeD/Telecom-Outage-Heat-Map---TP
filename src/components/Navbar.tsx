'use client'

const EASE: [number, number, number, number] = [0.4, 0, 0.2, 1]

import { useAuth } from './AuthProvider'
import { auth } from '@/lib/firebase'
import { signOut } from 'firebase/auth'
import { useRouter, usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'motion/react'
import { useTheme } from '@/hooks/useTheme'
import { SignalHigh, Sun, Moon } from "lucide-react"
import { useFilters, FilterSeverity } from './FilterProvider'
import { cn } from '@/lib/utils'
import { Switch } from "@/components/ui/interfaces-switch"

export function ThemeToggle() {
  const { theme, toggle, isDark } = useTheme()

  return (
    <div className="flex items-center gap-2.5 transition-colors duration-200">
      <div className="relative flex items-center justify-center w-4 h-4">
        <AnimatePresence mode="wait">
          {isDark ? (
            <motion.div
              key="moon"
              initial={{ scale: 0.5, opacity: 0, rotate: -45 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 0.5, opacity: 0, rotate: 45 }}
              transition={{ duration: 0.2 }}
            >
              <Moon className="size-4 text-[var(--accent)]" />
            </motion.div>
          ) : (
             <div className="size-4" /> // Spacer to prevent layout shift
          )}
        </AnimatePresence>
      </div>

      <Switch 
        checked={theme === 'light'} 
        onCheckedChange={toggle}
        aria-label="Toggle theme"
        className={cn(
          "shadow-none border-none focus-visible:ring-0",
          "dark:data-[state=unchecked]:bg-slate-800/60" // Subtle background for the track in dark mode
        )}
      />

      <div className="relative flex items-center justify-center w-4 h-4">
        <AnimatePresence mode="wait">
          {!isDark ? (
            <motion.div
              key="sun"
              initial={{ scale: 0.5, opacity: 0, rotate: 45 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 0.5, opacity: 0, rotate: -45 }}
              transition={{ duration: 0.2 }}
            >
              <Sun className="size-4 text-[var(--accent)]" />
            </motion.div>
          ) : (
            <div className="size-4" /> // Spacer
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

const severityConfig: Record<FilterSeverity, { label: string, color: string }> = {
  all:      { label: 'All',      color: 'var(--accent)' },
  critical: { label: 'Critical', color: 'var(--alarm-critical)' },
  major:    { label: 'Major',    color: 'var(--alarm-major)' },
  minor:    { label: 'Minor',    color: 'var(--alarm-minor)' },
  warning:  { label: 'Warning',  color: 'var(--alarm-warning)' },
  ok:       { label: 'OK',       color: 'var(--alarm-ok)' }
}

export default function Navbar() {
  const { user, profile } = useAuth()
  const { selectedSeverity, setSelectedSeverity, counts } = useFilters()
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

  const filters: FilterSeverity[] = ['all', 'critical', 'major', 'minor', 'warning']

  const displayName = profile?.displayName || user.email?.split('@')[0] || 'User'

  return (
    <header className="
      h-14 flex-shrink-0 flex items-center justify-between px-6 
      border-b border-[var(--glass-border)] 
      bg-[var(--glass-bg)] backdrop-blur-xl
      z-50 transition-colors duration-300
    ">
      {/* Brand */}
      <div className="flex items-center gap-6 w-1/4">
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

      {/* Filter Toolbar - Centered */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: EASE, delay: 0.1 }}
        className="flex items-center gap-1.5 p-1 bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-[var(--radius-lg)]"
      >
        {filters.map((f) => {
          const isActive = selectedSeverity === f
          const config = severityConfig[f]
          const count = counts[f]

          return (
            <motion.button
              key={f}
              whileTap={{ scale: 0.96 }}
              onClick={() => setSelectedSeverity(f)}
              className={cn(
                "relative flex items-center gap-2 px-3 py-1.5 rounded-[var(--radius-md)]",
                "text-[11px] font-medium uppercase tracking-widest transition-colors duration-200 border border-transparent overflow-hidden",
                isActive
                  ? "text-white"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-hover)]"
              )}
            >
              {isActive && (
                <motion.span
                  layoutId="filter-active-pill"
                  className="absolute inset-0 rounded-[var(--radius-md)]"
                  style={{
                    backgroundColor: config.color,
                    boxShadow: `0 0 14px ${config.color}55`,
                  }}
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.38 }}
                />
              )}
              <span className="relative z-10">{config.label}</span>
              <span className={cn(
                "relative z-10 px-1.5 py-0.5 rounded-full text-[10px] font-mono overflow-hidden",
                isActive ? "bg-white/20 text-white" : "bg-[var(--bg-subtle)] text-[var(--text-primary)]"
              )}>
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={count}
                    initial={{ y: -10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 10, opacity: 0 }}
                    transition={{ duration: 0.14, ease: EASE }}
                    className="block"
                  >
                    {count}
                  </motion.span>
                </AnimatePresence>
              </span>
            </motion.button>
          )
        })}
      </motion.div>

      {/* User Actions */}
      <motion.div
        initial={{ opacity: 0, x: 10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.35, ease: EASE, delay: 0.15 }}
        className="flex items-center justify-end gap-5 w-1/4"
      >
        <div className="flex flex-col items-end">
          <span className="text-[13px] font-medium text-[var(--text-primary)] leading-none">
            {displayName}
          </span>
          <span className="text-[11px] font-mono text-[var(--text-muted)] mt-1 uppercase tracking-tighter">
            {profile?.role === 'admin' ? 'NOC Admin' : 'NOC Engineer'}
          </span>
        </div>

        <div className="h-6 w-[1px] bg-[var(--glass-border)] mx-1" />

        <ThemeToggle />

        <motion.button
          whileTap={{ scale: 0.95 }}
          whileHover={{ scale: 1.02 }}
          onClick={handleSignOut}
          className="
            text-[11px] font-medium uppercase tracking-widest px-3 py-1.5
            rounded-[var(--radius-md)] border border-[var(--glass-border)]
            text-[var(--text-secondary)] hover:text-[var(--text-primary)]
            hover:bg-[var(--glass-hover)] hover:border-[var(--border-strong)]
            transition-colors duration-200
          "
        >
          Sign Out
        </motion.button>
      </motion.div>
    </header>
  )
}
