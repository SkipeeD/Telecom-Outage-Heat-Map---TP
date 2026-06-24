'use client'

import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Users, MessageSquare, Send } from 'lucide-react'
import { subscribeToMessages } from '@/lib/firestore-chat'
import { sendChatMessage } from '@/lib/firestore'
import type { ChatMessage, Incident } from '@/types'
import { cn } from '@/lib/utils'

const EASE: [number, number, number, number] = [0.4, 0, 0.2, 1]

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
}

const INC_STATUS_COLOR: Record<string, string> = {
  'IN PROGRESS': 'var(--accent)',
  'ASSIGNED':    'var(--alarm-warning)',
  'RESOLVED':    'var(--alarm-ok)',
  'CLOSED':      'var(--text-muted)',
}

/** Formats an ISO timestamp as HH:MM for the message timestamp display. */
function chatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/** Returns a comma-separated string of all site IDs associated with an incident. */
function incSites(inc: Incident): string {
  return (inc.siteIds?.length ? inc.siteIds : [inc.siteId]).join(', ')
}

/** Returns a dot-separated string of all technologies for an incident. */
function incTechs(inc: Incident): string {
  return (inc.technologies?.length ? inc.technologies : [inc.technology]).join(' · ')
}

interface IncidentChatProps {
  incidents: Incident[]
  loading: boolean
  currentUid: string
  currentName: string
  /** Label for the conversation list header (defaults to "Teams"). */
  listTitle?: string
}

/**
 * Per-incident team chat. One real-time channel per incident, shared between the
 * engineer (dispatch) and technician (field) consoles so both sides coordinate
 * on the same thread.
 */
export function IncidentChat({ incidents, loading, currentUid, currentName, listTitle = 'Teams' }: IncidentChatProps) {
  const activeIncidents = incidents.filter(i => i.status !== 'CLOSED')
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [msgLoading, setMsgLoading] = useState(false)
  const [msgError, setMsgError] = useState<string | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)

  // Auto-select first active incident
  useEffect(() => {
    if (!selectedIncident && activeIncidents.length > 0) {
      setSelectedIncident(activeIncidents[0]) // eslint-disable-line react-hooks/set-state-in-effect
    }
  }, [activeIncidents, selectedIncident])

  // Subscribe to messages for selected incident (real-time via Firestore onSnapshot).
  // Resets messages to [] on incident change so the old thread doesn't flash.
  useEffect(() => {
    if (!selectedIncident) return
    setMsgLoading(true) // eslint-disable-line react-hooks/set-state-in-effect
    setMsgError(null)
    setMessages([])
    const unsub = subscribeToMessages(
      selectedIncident.incidentNumber,
      msgs => { setMessages(msgs); setMsgLoading(false); setMsgError(null) },
      () => { setMsgLoading(false); setMsgError('Failed to load messages. Check your connection and try again.') }
    )
    return () => unsub()
  }, [selectedIncident])

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    if (!draft.trim() || !selectedIncident || sending) return
    const text = draft.trim()
    // Optimistic message id — will be replaced by the Firestore snapshot on success
    const pendingId = `pending-${Date.now()}`
    const pendingTimestamp = new Date().toISOString()

    setDraft('')
    setSendError(null)
    setSending(true)
    // Optimistically append the message so the sender sees it immediately
    setMessages(prev => [
      ...prev,
      { id: pendingId, text, senderId: currentUid, senderName: currentName, timestamp: pendingTimestamp },
    ])

    try {
      await sendChatMessage(selectedIncident.incidentNumber, text, currentUid, currentName)
    } catch {
      setSendError('Message failed to send. Check your connection and try again.')
      // Restore draft and remove the optimistic message on failure
      setDraft(text)
      setMessages(prev => prev.filter(msg => msg.id !== pendingId))
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  // Enter sends; Shift+Enter and composing (IME) fall through to insert a newline
  function handleDraftKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return
    e.preventDefault()
    void handleSend()
  }

  const teamSize = selectedIncident?.assignees?.length ?? 0

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="flex h-full">

      {/* Conversation list */}
      <div className="w-[240px] flex-shrink-0 flex flex-col border-r border-[var(--glass-border)] h-full">
        <div className="px-4 pt-5 pb-3 border-b border-[var(--glass-border)]">
          <p className="text-[10px] font-medium uppercase tracking-widest text-[var(--text-muted)]">{listTitle}</p>
          <p className="text-[12px] text-[var(--text-secondary)] mt-0.5">One channel per incident</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="px-4 py-6 text-[12px] text-[var(--text-muted)] animate-pulse font-mono">Loading…</div>
          ) : activeIncidents.length === 0 ? (
            <div className="px-4 py-8 text-center text-[12px] text-[var(--text-muted)]">No active incidents.</div>
          ) : (
            activeIncidents.map(inc => {
              const isSelected = selectedIncident?.incidentNumber === inc.incidentNumber
              const statusColor = INC_STATUS_COLOR[inc.status] ?? 'var(--text-muted)'
              return (
                <motion.button
                  key={inc.incidentNumber}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setSelectedIncident(inc)}
                  className={cn(
                    'w-full text-left px-4 py-3.5 border-b border-[var(--glass-border)] transition-colors duration-150 cursor-pointer',
                    isSelected ? 'bg-[var(--accent-dim)]' : 'hover:bg-[var(--glass-hover)]'
                  )}
                  style={{ borderLeft: `2px solid ${isSelected ? 'var(--accent-bright)' : statusColor}` }}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-mono text-[11px] font-bold text-[var(--text-primary)] truncate">
                      {inc.incidentNumber}
                    </span>
                    <span
                      className="font-mono text-[9px] font-semibold uppercase tracking-widest px-1.5 py-0.5 rounded-full shrink-0"
                      style={{ color: statusColor, background: `color-mix(in srgb, ${statusColor} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${statusColor} 25%, transparent)` }}
                    >
                      {inc.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[10px] text-[var(--text-muted)] truncate">{incSites(inc)} · {incTechs(inc)}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-1">
                    <Users className="size-3 text-[var(--text-muted)]" />
                    <span className="text-[10px] text-[var(--text-muted)]">{inc.assignees?.length ?? 0} members</span>
                  </div>
                </motion.button>
              )
            })
          )}
        </div>
      </div>

      {/* Message thread */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selectedIncident ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageSquare className="size-8 text-[var(--text-muted)] mx-auto mb-3" />
              <p className="text-[14px] text-[var(--text-secondary)]">Select a team to start chatting</p>
            </div>
          </div>
        ) : (
          <>
            {/* Thread header */}
            <div className="px-6 py-4 border-b border-[var(--glass-border)] flex items-center gap-3 flex-shrink-0">
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[14px] font-bold text-[var(--text-primary)]">
                    {selectedIncident.incidentNumber}
                  </span>
                  <span
                    className="font-mono text-[9px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full"
                    style={{
                      color: INC_STATUS_COLOR[selectedIncident.status] ?? 'var(--text-muted)',
                      background: `color-mix(in srgb, ${INC_STATUS_COLOR[selectedIncident.status] ?? 'var(--text-muted)'} 12%, transparent)`,
                      border: `1px solid color-mix(in srgb, ${INC_STATUS_COLOR[selectedIncident.status] ?? 'var(--text-muted)'} 28%, transparent)`,
                    }}
                  >
                    {selectedIncident.status}
                  </span>
                </div>
                <p className="text-[12px] text-[var(--text-muted)]">
                  {incSites(selectedIncident)} · {incTechs(selectedIncident)} · {teamSize} member{teamSize !== 1 ? 's' : ''}
                </p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-3">
              {msgError && (
                <div className="text-[12px] font-mono px-3 py-2 rounded-[var(--radius-md)] border" style={{ color: 'var(--alarm-critical)', background: 'rgba(240,79,79,0.08)', borderColor: 'rgba(240,79,79,0.25)' }}>
                  {msgError}
                </div>
              )}
              {msgLoading ? (
                <div className="text-[12px] text-[var(--text-muted)] font-mono animate-pulse">Loading messages…</div>
              ) : messages.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 py-12">
                  <MessageSquare className="size-6 text-[var(--text-muted)]" />
                  <p className="text-[13px] text-[var(--text-muted)]">No messages yet. Start the conversation.</p>
                </div>
              ) : (
                <>
                  {messages.map((msg, i) => {
                    const isMe = msg.senderId === currentUid
                    // Only show sender name on the first message in a consecutive run from the same sender
                    const showName = i === 0 || messages[i - 1].senderId !== msg.senderId
                    return (
                      <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, ease: EASE }}
                        className={cn('flex flex-col gap-1', isMe ? 'items-end' : 'items-start')}
                      >
                        {showName && (
                          <span className="font-mono text-[10px] text-[var(--text-muted)] px-1">
                            {isMe ? 'You' : msg.senderName}
                          </span>
                        )}
                        <div
                          className="max-w-[72%] px-3.5 py-2.5 rounded-[var(--radius-lg)] text-[13px] leading-relaxed"
                          style={
                            isMe
                              ? { background: 'var(--accent-dim)', border: '1px solid var(--border-accent)', color: 'var(--text-primary)', borderBottomRightRadius: '4px' }
                              : { background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)', borderBottomLeftRadius: '4px' }
                          }
                        >
                          {msg.text}
                        </div>
                        <span className="font-mono text-[10px] text-[var(--text-muted)] px-1">
                          {chatTime(msg.timestamp)}
                        </span>
                      </motion.div>
                    )
                  })}
                  <div ref={bottomRef} />
                </>
              )}
            </div>

            {/* Input */}
            <div className="px-6 py-4 border-t border-[var(--glass-border)] flex-shrink-0">
              <div
                className="flex items-end gap-3 rounded-[var(--radius-lg)] px-4 py-3"
                style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}
              >
                <textarea
                  ref={inputRef}
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={handleDraftKeyDown}
                  placeholder="Message the team…"
                  rows={1}
                  className="flex-1 resize-none bg-transparent text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none font-sans leading-relaxed"
                  style={{ maxHeight: '120px', overflowY: 'auto' }}
                />
                <motion.button
                  whileTap={{ scale: 0.93 }}
                  onClick={handleSend}
                  disabled={!draft.trim() || sending}
                  aria-label="Send message"
                  title="Send message"
                  className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-[var(--radius-md)] transition-all duration-150 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{
                    background: draft.trim() ? 'var(--accent)' : 'var(--bg-subtle)',
                    color: 'white',
                    boxShadow: draft.trim() ? 'var(--shadow-glow)' : 'none',
                  }}
                >
                  <Send className="size-3.5" />
                </motion.button>
              </div>
              {sendError && (
                <p className="mt-1.5 text-[10px] font-mono" style={{ color: 'var(--alarm-critical)' }}>{sendError}</p>
              )}
            </div>
          </>
        )}
      </div>

    </motion.div>
  )
}
