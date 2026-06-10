'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Bell, Volume2, VolumeX, CheckCheck } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import { useNotifications } from './NotificationProvider'
import type { AppNotification } from './NotificationProvider'
import { cn } from '@/lib/utils'

const EASE: [number, number, number, number] = [0.4, 0, 0.2, 1]

const PRIORITY_COLOR: Record<string, string> = {
  '1-Critical': 'var(--alarm-critical)',
  '2-High':     'var(--alarm-major)',
  '3-Medium':   'var(--alarm-minor)',
  '4-Low':      'var(--alarm-warning)',
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function NotificationBell() {
  const { profile } = useAuth()
  const role = profile?.role
  const { notifications, unreadCount, markAllRead, dismiss, soundEnabled, toggleSound } = useNotifications()
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])

  // Only render for admin and engineer roles
  if (role !== 'admin' && role !== 'engineer' && role !== 'technician') return null

  function handleNotifClick(n: AppNotification) {
    dismiss(n.id)
    setOpen(false)
    if (role === 'admin') {
      router.push(`/admin?tab=incidents&incident=${n.incidentNumber}`)
    } else if (role === 'technician') {
      router.push(`/technician?incident=${n.incidentNumber}`)
    } else {
      router.push(`/engineer?incident=${n.incidentNumber}`)
    }
  }

  return (
    <div className="relative z-[10001]" ref={containerRef}>
      <motion.button
        whileTap={{ scale: 0.93 }}
        onClick={() => { setOpen(v => !v); if (!open && unreadCount > 0) markAllRead() }}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        className={cn(
          'relative flex items-center justify-center w-8 h-8 rounded-[var(--radius-md)] transition-colors duration-150 cursor-pointer',
          open
            ? 'bg-[var(--accent-dim)] border border-[var(--border-accent)] text-[var(--accent-bright)]'
            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-hover)]'
        )}
      >
        <Bell className="size-4" />
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.span
              key="badge"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 25 }}
              className="absolute -top-1 -right-1 flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full font-mono text-[9px] font-bold text-white"
              style={{ background: 'var(--alarm-critical)', boxShadow: '0 0 6px var(--alarm-critical)' }}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      <AnimatePresence>
        {open && (
          <>
            {/* Panel */}
            <motion.div
              ref={panelRef}
              key="panel"
              initial={{ opacity: 0, y: 8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              transition={{ duration: 0.18, ease: EASE }}
              className="absolute right-0 top-10 z-[10002] w-[340px] rounded-[var(--radius-lg)] overflow-hidden"
              style={{
                background: 'var(--bg-overlay)',
                border: '1px solid var(--glass-border)',
                boxShadow: 'var(--shadow-lg)',
                backdropFilter: 'blur(24px)',
              }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--glass-border)]">
                <span className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-secondary)]">
                  Notifications
                </span>
                <div className="flex items-center gap-2">
                  <motion.button
                    whileTap={{ scale: 0.93 }}
                    onClick={toggleSound}
                    aria-label={soundEnabled ? 'Mute notifications' : 'Unmute notifications'}
                    className="flex items-center justify-center w-6 h-6 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                  >
                    {soundEnabled
                      ? <Volume2 className="size-3.5" />
                      : <VolumeX className="size-3.5" />
                    }
                  </motion.button>
                  {notifications.length > 0 && (
                    <motion.button
                      whileTap={{ scale: 0.93 }}
                      onClick={markAllRead}
                      aria-label="Mark all as read"
                      className="flex items-center justify-center w-6 h-6 rounded text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors cursor-pointer"
                    >
                      <CheckCheck className="size-3.5" />
                    </motion.button>
                  )}
                </div>
              </div>

              {/* List */}
              <div className="max-h-[380px] overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="py-10 text-center">
                    <Bell className="size-5 text-[var(--text-muted)] mx-auto mb-2 opacity-40" />
                    <p className="text-[12px] text-[var(--text-muted)] font-mono uppercase tracking-widest">
                      No notifications
                    </p>
                  </div>
                ) : (
                  <AnimatePresence initial={false}>
                    {notifications.map((n) => {
                      const color = PRIORITY_COLOR[n.priority] ?? 'var(--text-muted)'
                      return (
                        <motion.div
                          key={n.id}
                          initial={{ opacity: 0, x: 8 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -8 }}
                          transition={{ duration: 0.15, ease: EASE }}
                          onClick={() => handleNotifClick(n)}
                          className="flex items-start gap-3 px-4 py-3 border-b border-[var(--glass-border)] last:border-0 hover:bg-[var(--glass-hover)] cursor-pointer transition-colors duration-150"
                          style={{ borderLeft: n.read ? undefined : `2px solid ${color}` }}
                        >
                          <div
                            className="mt-1 flex-shrink-0 w-2 h-2 rounded-full"
                            style={{ background: n.read ? 'var(--text-muted)' : color }}
                          />
                          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                            <span className="text-[12px] font-medium text-[var(--text-primary)]">{n.title}</span>
                            <span className="text-[11px] text-[var(--text-secondary)] leading-snug">{n.message}</span>
                            <span className="font-mono text-[10px] text-[var(--text-muted)]">{relTime(n.timestamp)}</span>
                          </div>
                        </motion.div>
                      )
                    })}
                  </AnimatePresence>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
