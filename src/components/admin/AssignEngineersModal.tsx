'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { Incident, IncidentAssignee, UserProfile } from '@/types'
import { getEngineers } from '@/lib/firestore'
import { Button } from '@/components/ui/button'

const INC_STATUS_COLOR: Record<string, string> = {
  'IN PROGRESS': 'var(--accent)',
  'ASSIGNED':    'var(--alarm-warning)',
  'RESOLVED':    'var(--alarm-ok)',
  'CLOSED':      'var(--text-muted)',
}

interface Props {
  incident: Incident | null
  open: boolean
  onClose: () => void
  onSave: (incidentNumber: string, assignees: IncidentAssignee[]) => Promise<void>
}

export function AssignEngineersModal({ incident, open, onClose, onSave }: Props) {
  const shouldReduce = useReducedMotion()

  const [engineers, setEngineers]     = useState<UserProfile[]>([])
  const [loadingEng, setLoadingEng]   = useState(false)
  const [pendingUids, setPendingUids] = useState<Set<string>>(new Set())
  const [saving, setSaving]           = useState(false)
  const [engLoaded, setEngLoaded]     = useState(false)

  // Reset selection and load engineers when incident changes
  useEffect(() => {
    void (async () => {
      if (!open || !incident) {
        setEngLoaded(false)
        return
      }
      setPendingUids(new Set((incident.assignees ?? []).map(a => a.uid)))
      if (!engLoaded) {
        setLoadingEng(true)
        try {
          const raw = await getEngineers()
          // Deduplicate by uid — guards against duplicate Firestore docs
          const unique = [...new Map(raw.map(e => [e.uid, e])).values()]
          setEngineers(unique)
          setEngLoaded(true)
        } finally {
          setLoadingEng(false)
        }
      }
    })()
  }, [open, incident, engLoaded])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  async function handleSave() {
    if (!incident) return
    setSaving(true)
    try {
      const next: IncidentAssignee[] = engineers
        .filter(e => pendingUids.has(e.uid))
        .map(e => ({ uid: e.uid, email: e.email, ...(e.displayName ? { displayName: e.displayName } : {}) }))
      await onSave(incident.incidentNumber, next)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  function toggleUid(uid: string, checked: boolean) {
    const next = new Set(pendingUids)
    if (checked) next.add(uid)
    else next.delete(uid)
    setPendingUids(next)
  }

  const statusColor = incident ? (INC_STATUS_COLOR[incident.status] ?? 'var(--text-muted)') : ''

  return (
    <AnimatePresence>
      {open && incident && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: shouldReduce ? 0 : 0.18 }}
            onClick={onClose}
            className="fixed inset-0 bg-[rgba(4,4,12,0.65)] backdrop-blur-[3px] z-[9990]"
            aria-hidden
          />

          {/* Modal */}
          <motion.div
            key="modal"
            role="dialog"
            aria-modal
            aria-label="Assign engineers"
            initial={shouldReduce ? {} : { opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={shouldReduce ? {} : { opacity: 0, scale: 0.96, y: 8, transition: { duration: 0.16 } }}
            transition={{ duration: 0.28, ease: [0.34, 1.56, 0.64, 1] }}
            className="
              fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
              z-[9991] flex flex-col w-[480px] max-w-[calc(100vw-32px)] max-h-[80vh]
              rounded-[var(--radius-lg)]
              bg-[rgba(9,9,20,0.94)] backdrop-blur-[40px] backdrop-saturate-[300%] backdrop-brightness-[0.85]
              border border-[rgba(255,255,255,0.10)]
              shadow-[0_32px_80px_rgba(0,0,0,0.85),0_8px_24px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.07)]
              overflow-hidden
            "
          >
            {/* ── Header ── */}
            <div className="shrink-0 px-5 pt-5 pb-4 border-b border-[rgba(255,255,255,0.07)]">
              <div className="flex items-start justify-between gap-3 mb-3.5">
                <div>
                  <div className="text-[16px] font-semibold text-[var(--text-primary)] leading-snug">
                    Assign Engineers
                  </div>
                  <div className="text-[12px] text-[var(--text-muted)] mt-0.5">
                    Select who should work on this incident
                  </div>
                </div>
                <button
                  onClick={onClose}
                  aria-label="Close"
                  className="
                    shrink-0 w-7 h-7 grid place-items-center rounded-[var(--radius-md)]
                    text-[var(--text-muted)] border border-transparent cursor-pointer
                    hover:text-[var(--text-primary)] hover:bg-[var(--glass-hover)] hover:border-[var(--glass-border)]
                    transition-colors duration-150
                  "
                >
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <path d="M2 2L11 11M11 2L2 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              {/* Incident chip row */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-mono text-[12px] font-bold text-[var(--text-primary)]">
                  {incident.incidentNumber}
                </span>
                <span className="font-mono text-[10px] text-[var(--text-muted)]">·</span>
                <span className="font-mono text-[10px] text-[var(--text-muted)]">{incident.siteId}</span>
                <span
                  className="font-mono text-[9px] font-semibold uppercase tracking-widest px-1.5 py-0.5 rounded-[var(--radius-full)]"
                  style={{ color: 'var(--accent-bright)', background: 'var(--accent-dim)', border: '1px solid var(--border-accent)' }}
                >
                  {incident.technology}
                </span>
                <span
                  className="font-mono text-[9px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-[var(--radius-full)]"
                  style={{
                    color:       statusColor,
                    background:  `color-mix(in srgb, ${statusColor} 12%, transparent)`,
                    border:      `1px solid color-mix(in srgb, ${statusColor} 28%, transparent)`,
                  }}
                >
                  {incident.status}
                </span>
              </div>
            </div>

            {/* ── Engineer list ── */}
            <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">
              {loadingEng ? (
                <div className="flex items-center justify-center gap-2.5 py-10 text-[13px] text-[var(--text-muted)] animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-[var(--text-muted)] animate-pulse" />
                  Loading engineers…
                </div>
              ) : engineers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-1.5 text-center">
                  <span className="text-[13px] text-[var(--text-secondary)]">No engineers found.</span>
                  <span className="text-[11px] text-[var(--text-muted)]">Promote users in the Users tab first.</span>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {engineers.map(eng => {
                    const checked  = pendingUids.has(eng.uid)
                    const label    = eng.displayName ?? eng.email.split('@')[0]
                    const initials = label.slice(0, 2).toUpperCase()
                    return (
                      <motion.label
                        key={eng.uid}
                        whileTap={{ scale: 0.98 }}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-md)] cursor-pointer transition-all duration-150 select-none"
                        style={{
                          border:     `1px solid ${checked ? 'var(--border-accent)' : 'var(--glass-border)'}`,
                          background: checked
                            ? 'var(--accent-dim)'
                            : 'var(--glass-bg)',
                        }}
                      >
                        {/* Avatar */}
                        <div
                          className="w-8 h-8 rounded-[var(--radius-md)] flex items-center justify-center shrink-0 font-mono text-[11px] font-bold transition-all duration-150"
                          style={{
                            background: checked
                              ? 'color-mix(in srgb, var(--accent) 22%, transparent)'
                              : 'var(--bg-subtle)',
                            color:  checked ? 'var(--accent-bright)' : 'var(--text-secondary)',
                            border: `1px solid ${checked ? 'var(--border-accent)' : 'var(--glass-border)'}`,
                          }}
                        >
                          {initials}
                        </div>

                        {/* Name + email */}
                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] font-medium text-[var(--text-primary)] truncate leading-snug">
                            {label}
                          </div>
                          <div className="text-[10px] font-mono text-[var(--text-muted)] truncate">
                            {eng.email}
                          </div>
                        </div>

                        {/* Hidden native checkbox */}
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={e => toggleUid(eng.uid, e.target.checked)}
                          className="sr-only"
                        />

                        {/* Custom check indicator */}
                        <div
                          className="w-[18px] h-[18px] rounded-[5px] flex items-center justify-center shrink-0 transition-all duration-150"
                          style={{
                            background: checked ? 'var(--accent)' : 'transparent',
                            border:     `1.5px solid ${checked ? 'var(--accent)' : 'rgba(255,255,255,0.15)'}`,
                            boxShadow:  checked ? '0 0 8px var(--accent-glow)' : 'none',
                          }}
                        >
                          {checked && (
                            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                              <path d="M1 4L3.8 7L9 1" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </div>
                      </motion.label>
                    )
                  })}
                </div>
              )}
            </div>

            {/* ── Footer ── */}
            <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-4 border-t border-[rgba(255,255,255,0.07)] bg-black/15">
              <span className="font-mono text-[11px] text-[var(--text-muted)]">
                {pendingUids.size === 0
                  ? 'No engineers selected'
                  : `${pendingUids.size} engineer${pendingUids.size !== 1 ? 's' : ''} selected`}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onClose}
                  className="
                    h-8 px-4 text-[11px] font-medium uppercase tracking-widest
                    bg-[var(--glass-bg)] border-[var(--glass-border)]
                    hover:bg-[var(--glass-hover)] hover:border-[var(--border-strong)]
                    text-[var(--text-secondary)] rounded-[var(--radius-md)]
                  "
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={saving || loadingEng || engineers.length === 0}
                  onClick={handleSave}
                  className="
                    h-8 px-4 text-[11px] font-medium uppercase tracking-widest
                    bg-[var(--accent)] hover:bg-[var(--accent-bright)] text-white
                    rounded-[var(--radius-md)] shadow-[var(--shadow-glow)] disabled:opacity-50
                    transition-all duration-200
                  "
                >
                  {saving ? 'Saving…' : 'Save assignment'}
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
