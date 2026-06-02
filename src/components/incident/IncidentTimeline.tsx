'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { subscribeToActivity, addIncidentNote } from '@/lib/firestore-activity'
import type { IncidentActivity } from '@/types'
import { cn } from '@/lib/utils'
import {
  Plus, CheckCircle2, XCircle, Users, GitMerge,
  FileText, Clock, Send, AlertCircle,
} from 'lucide-react'

const EASE: [number, number, number, number] = [0.4, 0, 0.2, 1]

const TYPE_CONFIG: Record<IncidentActivity['type'], {
  icon: React.ReactNode
  color: string
  label: string
}> = {
  created:      { icon: <Plus className="size-3" />,          color: 'var(--accent)',        label: 'Created' },
  acknowledged: { icon: <Clock className="size-3" />,         color: 'var(--alarm-warning)', label: 'Acknowledged' },
  resolved:     { icon: <CheckCircle2 className="size-3" />,  color: 'var(--alarm-ok)',      label: 'Resolved' },
  closed:       { icon: <XCircle className="size-3" />,       color: 'var(--text-muted)',    label: 'Closed' },
  assigned:     { icon: <Users className="size-3" />,         color: 'var(--alarm-warning)', label: 'Assigned' },
  unassigned:   { icon: <Users className="size-3" />,         color: 'var(--text-muted)',    label: 'Unassigned' },
  merged:       { icon: <GitMerge className="size-3" />,      color: 'var(--accent)',        label: 'Merged' },
  note:         { icon: <FileText className="size-3" />,      color: 'var(--text-secondary)',label: 'Note' },
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

interface IncidentTimelineProps {
  incidentNumber: string
  currentUid?: string
  currentName?: string
  /** If false, hides the note composer */
  allowNotes?: boolean
  className?: string
}

export function IncidentTimeline({
  incidentNumber,
  currentUid,
  currentName,
  allowNotes = true,
  className,
}: IncidentTimelineProps) {
  const [entries, setEntries] = useState<IncidentActivity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const prevCountRef = useRef<number | null>(null)

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setLoading(true)
      setError(null)
    })
    prevCountRef.current = null
    const unsub = subscribeToActivity(
      incidentNumber,
      data => { setEntries(data); setLoading(false) },
      () => { setLoading(false); setError('Failed to load activity.') }
    )
    return () => {
      cancelled = true
      unsub()
    }
  }, [incidentNumber])

  // Only auto-scroll when a new entry arrives after initial load (not on first render)
  useEffect(() => {
    if (prevCountRef.current !== null && entries.length > prevCountRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
    prevCountRef.current = entries.length
  }, [entries])

  async function handleSend() {
    if (!draft.trim() || !currentUid || !currentName || sending) return
    const text = draft.trim()
    setDraft('')
    setSendError(null)
    setSending(true)
    try {
      await addIncidentNote(incidentNumber, text, currentUid, currentName)
    } catch {
      setSendError('Failed to save note.')
      setDraft(text)
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return
    e.preventDefault()
    void handleSend()
  }

  return (
    <div className={cn('flex flex-col gap-0', className)}>
      {/* Timeline entries */}
      <div className="flex-1 overflow-y-auto space-y-0 max-h-[360px] px-1">
        {loading ? (
          <div className="py-6 text-center text-[11px] font-mono text-[var(--text-muted)] animate-pulse uppercase tracking-widest">
            Loading timeline…
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 py-4 px-3 rounded-[var(--radius-md)] text-[11px] font-mono"
            style={{ color: 'var(--alarm-critical)', background: 'rgba(240,79,79,0.08)', border: '1px solid rgba(240,79,79,0.2)' }}>
            <AlertCircle className="size-3.5 shrink-0" />
            {error}
          </div>
        ) : entries.length === 0 ? (
          <div className="py-8 text-center">
            <Clock className="size-5 text-[var(--text-muted)] mx-auto mb-2 opacity-40" />
            <p className="text-[11px] font-mono text-[var(--text-muted)] uppercase tracking-widest">No activity yet</p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {entries.map((entry, i) => {
              const cfg = TYPE_CONFIG[entry.type] ?? TYPE_CONFIG.note
              const isLast = i === entries.length - 1
              return (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, ease: EASE }}
                  className="flex gap-3 relative"
                >
                  {/* Vertical connector */}
                  {!isLast && (
                    <div className="absolute left-[11px] top-6 bottom-0 w-px bg-[var(--glass-border)]" />
                  )}

                  {/* Icon dot */}
                  <div
                    className="relative z-10 flex-shrink-0 flex size-[22px] items-center justify-center rounded-full mt-1"
                    style={{
                      background: `color-mix(in srgb, ${cfg.color} 15%, var(--bg-subtle))`,
                      border: `1px solid color-mix(in srgb, ${cfg.color} 35%, transparent)`,
                      color: cfg.color,
                    }}
                  >
                    {cfg.icon}
                  </div>

                  {/* Content */}
                  <div className="flex flex-col gap-0.5 pb-4 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[12px] font-medium text-[var(--text-primary)]">{entry.actorName}</span>
                      <span
                        className="text-[9px] font-mono font-semibold uppercase tracking-widest px-1.5 py-0.5 rounded-full"
                        style={{
                          color: cfg.color,
                          background: `color-mix(in srgb, ${cfg.color} 12%, transparent)`,
                          border: `1px solid color-mix(in srgb, ${cfg.color} 25%, transparent)`,
                        }}
                      >
                        {cfg.label}
                      </span>
                      <span className="font-mono text-[10px] text-[var(--text-muted)] ml-auto">
                        {relTime(entry.timestamp)}
                      </span>
                    </div>
                    <p className="text-[12px] text-[var(--text-secondary)] leading-snug">{entry.message}</p>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Note composer */}
      {allowNotes && currentUid && (
        <div className="pt-3 border-t border-[var(--glass-border)] mt-2">
          <div
            className="flex items-end gap-2 rounded-[var(--radius-md)] px-3 py-2.5"
            style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}
          >
            <textarea
              ref={inputRef}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Add a note…"
              rows={1}
              className="flex-1 resize-none bg-transparent text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none font-sans leading-relaxed"
              style={{ maxHeight: '80px', overflowY: 'auto' }}
            />
            <motion.button
              whileTap={{ scale: 0.93 }}
              onClick={handleSend}
              disabled={!draft.trim() || sending}
              aria-label="Save note"
              className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-[var(--radius-sm)] transition-all duration-150 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                background: draft.trim() ? 'var(--accent)' : 'var(--bg-subtle)',
                color: 'white',
                boxShadow: draft.trim() ? 'var(--shadow-glow)' : 'none',
              }}
            >
              <Send className="size-3" />
            </motion.button>
          </div>
          {sendError && (
            <p className="mt-1 text-[10px] font-mono" style={{ color: 'var(--alarm-critical)' }}>{sendError}</p>
          )}
        </div>
      )}
    </div>
  )
}
