'use client'

import { useEffect } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'motion/react'
import { X, Bell } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import { useNotifications } from './NotificationProvider'
import type { AppNotification } from './NotificationProvider'

const EASE: [number, number, number, number] = [0.4, 0, 0.2, 1]
const AUTO_DISMISS_MS = 6000

const PRIORITY_COLOR: Record<string, string> = {
  '1-Critical': 'var(--alarm-critical)',
  '2-High':     'var(--alarm-major)',
  '3-Medium':   'var(--alarm-minor)',
  '4-Low':      'var(--alarm-warning)',
}

function Toast({ notif, onDismiss, onNavigate }: {
  notif: AppNotification
  onDismiss: (id: string) => void
  onNavigate: (n: AppNotification) => void
}) {
  const shouldReduce = useReducedMotion()
  const color = PRIORITY_COLOR[notif.priority] ?? 'var(--alarm-warning)'

  useEffect(() => {
    const t = setTimeout(() => onDismiss(notif.id), AUTO_DISMISS_MS)
    return () => clearTimeout(t)
  }, [notif.id, onDismiss])

  return (
    <motion.div
      layout
      initial={shouldReduce ? { opacity: 0 } : { opacity: 0, x: 40, scale: 0.95 }}
      animate={shouldReduce ? { opacity: 1 } : { opacity: 1, x: 0, scale: 1 }}
      exit={shouldReduce ? { opacity: 0 } : { opacity: 0, x: 40, scale: 0.95 }}
      transition={{ duration: 0.22, ease: EASE }}
      onClick={() => { onDismiss(notif.id); onNavigate(notif) }}
      className="flex items-start gap-3 w-[320px] rounded-[var(--radius-lg)] px-4 py-3.5 overflow-hidden cursor-pointer"
      style={{
        background: 'var(--bg-overlay)',
        border: `1px solid color-mix(in srgb, ${color} 35%, var(--glass-border))`,
        boxShadow: `0 8px 24px rgba(0,0,0,0.5), 0 0 0 1px color-mix(in srgb, ${color} 12%, transparent)`,
        backdropFilter: 'blur(20px)',
        borderLeft: `3px solid ${color}`,
      }}
    >
      <div
        className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full mt-0.5"
        style={{
          background: `color-mix(in srgb, ${color} 15%, var(--bg-subtle))`,
          border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
          color,
        }}
      >
        <Bell className="size-3.5" />
      </div>

      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <span className="text-[12px] font-semibold text-[var(--text-primary)] leading-snug">{notif.title}</span>
        <span className="text-[11px] text-[var(--text-secondary)] leading-snug">{notif.message}</span>
        <span className="font-mono text-[10px] text-[var(--text-muted)] mt-0.5">Click to open incident</span>
      </div>

      <button
        onClick={e => { e.stopPropagation(); onDismiss(notif.id) }}
        aria-label="Dismiss notification"
        className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer mt-0.5"
      >
        <X className="size-3.5" />
      </button>
    </motion.div>
  )
}

export function NotificationToaster() {
  const { toasts, dismissToast } = useNotifications()
  const { profile } = useAuth()
  const router = useRouter()

  function handleNavigate(n: AppNotification) {
    if (profile?.role === 'admin') {
      router.push(`/admin?tab=incidents&incident=${n.incidentNumber}`)
    } else {
      router.push(`/engineer?incident=${n.incidentNumber}`)
    }
  }

  return (
    <div className="fixed top-16 right-4 z-[10003] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence mode="popLayout" initial={false}>
        {toasts.map(t => (
          <div key={t.id} className="pointer-events-auto">
            <Toast notif={t} onDismiss={dismissToast} onNavigate={handleNavigate} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  )
}
