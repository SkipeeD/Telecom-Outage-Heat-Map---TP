'use client'

import { useCallback, useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { RefreshCw } from 'lucide-react'
import type { Incident, IncidentAssignee } from '@/types'
import { getAllIncidents, updateIncidentAssignees } from '@/lib/firestore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AssignEngineersModal } from './AssignEngineersModal'

const INC_STATUS_COLOR: Record<string, string> = {
  'IN PROGRESS': 'var(--accent)',
  'ASSIGNED':    'var(--alarm-warning)',
  'RESOLVED':    'var(--alarm-ok)',
  'CLOSED':      'var(--text-muted)',
}

const INC_PRIO_COLOR: Record<string, string> = {
  '1-Critical': 'var(--alarm-critical)',
  '2-High':     'var(--alarm-major)',
  '3-Medium':   'var(--alarm-warning)',
  '4-Low':      'var(--text-secondary)',
}

const EASE: [number, number, number, number] = [0.4, 0, 0.2, 1]

const containerVariants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.04, delayChildren: 0.02 } },
}

const itemVariants = {
  hidden:  { opacity: 0, y: 8, filter: 'blur(4px)' },
  visible: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.3, ease: EASE } },
}

type StatusFilter = 'ALL' | 'ASSIGNED' | 'IN PROGRESS' | 'RESOLVED' | 'CLOSED'
const STATUS_FILTERS: StatusFilter[] = ['ALL', 'ASSIGNED', 'IN PROGRESS', 'RESOLVED', 'CLOSED']

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function IncidentsPanel() {
  const [incidents, setIncidents]       = useState<Incident[]>([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [assigningInc, setAssigningInc] = useState<Incident | null>(null)
  const [refreshKey, setRefreshKey]     = useState(0)

  const loadIncidents = useCallback(() => setRefreshKey(k => k + 1), [])

  useEffect(() => {
    void (async () => {
      setLoading(true)
      setError(null)
      try {
        setIncidents(await getAllIncidents())
      } catch {
        setError('Failed to load incidents. Check Firestore rules.')
      } finally {
        setLoading(false)
      }
    })()
  }, [refreshKey])

  async function handleSave(incidentNumber: string, assignees: IncidentAssignee[]) {
    await updateIncidentAssignees(incidentNumber, assignees)
    setIncidents(prev =>
      prev.map(i => i.incidentNumber === incidentNumber ? { ...i, assignees } : i)
    )
  }

  const filtered = incidents.filter(i =>
    statusFilter === 'ALL' ? true : i.status === statusFilter
  )

  const stats = {
    total:      incidents.length,
    open:       incidents.filter(i => i.status === 'ASSIGNED' || i.status === 'IN PROGRESS').length,
    inProgress: incidents.filter(i => i.status === 'IN PROGRESS').length,
    resolved:   incidents.filter(i => i.status === 'RESOLVED' || i.status === 'CLOSED').length,
  }

  return (
    <>
      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total',       value: stats.total,      color: 'var(--text-primary)' },
            { label: 'Open',        value: stats.open,       color: 'var(--alarm-major)' },
            { label: 'In Progress', value: stats.inProgress, color: 'var(--accent-bright)' },
            { label: 'Resolved',    value: stats.resolved,   color: 'var(--alarm-ok)' },
          ].map(s => (
            <motion.div key={s.label} variants={itemVariants}>
              <Card className="bg-[var(--glass-bg)] backdrop-blur-xl border-[var(--glass-border)] shadow-[var(--shadow-md)]">
                <CardHeader className="pb-1">
                  <CardTitle className="text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-widest">
                    {s.label}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold font-mono" style={{ color: s.color }}>
                    {loading ? '—' : s.value}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* List */}
        <motion.div variants={itemVariants}>
          <Card className="bg-[var(--glass-bg)] backdrop-blur-xl border-[var(--glass-border)] shadow-[var(--shadow-md)] overflow-hidden">
            <CardHeader className="border-b border-[var(--glass-border)]">
              <div className="flex items-center justify-between gap-4 mb-3">
                <CardTitle className="text-[13px] font-medium text-[var(--text-primary)] uppercase tracking-widest">
                  All Incidents
                </CardTitle>
                <div className="flex items-center gap-3 shrink-0">
                  {!loading && (
                    <span className="font-mono text-[11px] text-[var(--text-muted)]">
                      {filtered.length} shown
                    </span>
                  )}
                  <motion.button
                    whileTap={{ scale: 0.96 }}
                    onClick={loadIncidents}
                    disabled={loading}
                    className="
                      flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--radius-md)]
                      text-[10px] font-medium uppercase tracking-widest
                      border border-[var(--glass-border)] bg-[var(--glass-bg)]
                      text-[var(--text-secondary)] hover:text-[var(--text-primary)]
                      hover:bg-[var(--glass-hover)] hover:border-[var(--border-strong)]
                      transition-colors duration-200 disabled:opacity-40 cursor-pointer
                    "
                  >
                    <RefreshCw className={`size-3 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                  </motion.button>
                </div>
              </div>

              {/* Filters */}
              <div className="flex gap-1.5 flex-wrap">
                {STATUS_FILTERS.map(f => {
                  const isActive = statusFilter === f
                  const color    = INC_STATUS_COLOR[f]
                  return (
                    <motion.button
                      key={f}
                      whileTap={{ scale: 0.96 }}
                      onClick={() => setStatusFilter(f)}
                      className="text-[10px] font-medium uppercase tracking-widest px-3 py-1.5 rounded-[var(--radius-md)] border transition-all duration-150 cursor-pointer"
                      style={
                        isActive && color
                          ? { background: `color-mix(in srgb, ${color} 12%, transparent)`, borderColor: `color-mix(in srgb, ${color} 30%, transparent)`, color }
                          : isActive
                          ? { background: 'var(--accent-dim)', borderColor: 'var(--border-accent)', color: 'var(--accent-bright)' }
                          : { background: 'var(--glass-bg)', borderColor: 'var(--glass-border)', color: 'var(--text-secondary)' }
                      }
                    >
                      {f}
                    </motion.button>
                  )
                })}
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {error && (
                <div className="px-6 py-3 text-[13px] text-[var(--alarm-critical)] bg-[rgba(240,79,79,0.06)] border-b border-[var(--glass-border)]">
                  {error}
                </div>
              )}

              {loading ? (
                <div className="flex items-center gap-2.5 px-6 py-10 text-[13px] text-[var(--text-muted)] animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-[var(--text-muted)] animate-pulse" />
                  Loading incidents…
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2">
                  <span className="text-[28px]" style={{ color: 'var(--alarm-ok)' }}>✓</span>
                  <span className="text-[13px] text-[var(--text-muted)]">
                    {statusFilter === 'ALL' ? 'No incidents found.' : `No ${statusFilter.toLowerCase()} incidents.`}
                  </span>
                </div>
              ) : (
                <div>
                  {filtered.map((inc, idx) => {
                    const assignees     = inc.assignees ?? []
                    const displayStatus = (inc.status === 'ASSIGNED' && assignees.length === 0) ? 'UNASSIGNED' : inc.status
                    const statusColor   = displayStatus === 'UNASSIGNED'
                      ? 'var(--text-muted)'
                      : (INC_STATUS_COLOR[inc.status] ?? 'var(--text-muted)')
                    const priorityColor = INC_PRIO_COLOR[inc.priority] ?? 'var(--text-secondary)'

                    return (
                      <motion.div
                        key={inc.incidentNumber}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: idx * 0.015 }}
                        className="group relative flex items-center gap-4 px-5 py-4 border-b border-[var(--glass-border)] last:border-0 hover:bg-[var(--glass-hover)] transition-colors duration-150"
                        style={{ borderLeft: `2px solid ${statusColor}` }}
                      >
                        {/* Left: meta */}
                        <div className="flex-1 min-w-0">
                          {/* Top row: INC# + badges */}
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-mono text-[12px] font-bold text-[var(--text-primary)]">
                              {inc.incidentNumber}
                            </span>
                            <span className="font-mono text-[10px] text-[var(--text-muted)]">{inc.siteId}</span>
                            <span
                              className="font-mono text-[9px] font-semibold uppercase tracking-widest px-1.5 py-0.5 rounded-[var(--radius-full)]"
                              style={{ color: 'var(--accent-bright)', background: 'var(--accent-dim)', border: '1px solid var(--border-accent)' }}
                            >
                              {inc.technology}
                            </span>
                            <span
                              className="font-mono text-[9px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-[var(--radius-full)]"
                              style={{
                                color:       statusColor,
                                background:  `color-mix(in srgb, ${statusColor} 12%, transparent)`,
                                border:      `1px solid color-mix(in srgb, ${statusColor} 28%, transparent)`,
                              }}
                            >
                              {displayStatus}
                            </span>
                            <span
                              className="font-mono text-[9px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-[var(--radius-full)]"
                              style={{
                                color:       priorityColor,
                                background:  `color-mix(in srgb, ${priorityColor} 10%, transparent)`,
                                border:      `1px solid color-mix(in srgb, ${priorityColor} 22%, transparent)`,
                              }}
                            >
                              {inc.priority}
                            </span>
                          </div>

                          {/* Impact */}
                          <p className="text-[12px] text-[var(--text-secondary)] leading-snug truncate mb-1.5">
                            {inc.impact}
                          </p>

                          {/* Timestamp */}
                          <span className="font-mono text-[10px] text-[var(--text-muted)]">
                            {relTime(inc.submitDate)} · {new Date(inc.submitDate).toISOString().slice(0, 10)}
                          </span>
                        </div>

                        {/* Right: assignee avatars + assign button */}
                        <div className="flex items-center gap-3 shrink-0">
                          {/* Avatar stack */}
                          <div className="flex items-center">
                            {assignees.length === 0 ? (
                              <span className="text-[10px] font-mono text-[var(--text-muted)] italic pr-1">
                                Unassigned
                              </span>
                            ) : (
                              <div className="flex items-center -space-x-1.5">
                                {assignees.slice(0, 4).map((a, i) => {
                                  const label    = a.displayName ?? a.email.split('@')[0]
                                  const initials = label.slice(0, 2).toUpperCase()
                                  return (
                                    <div
                                      key={a.uid}
                                      title={a.email}
                                      className="w-7 h-7 rounded-full flex items-center justify-center font-mono text-[10px] font-bold ring-2 ring-[var(--bg-base)]"
                                      style={{
                                        background:  'color-mix(in srgb, var(--alarm-ok) 15%, var(--bg-subtle))',
                                        color:       'var(--alarm-ok)',
                                        border:      '1px solid rgba(52,211,153,0.3)',
                                        zIndex:      assignees.length - i,
                                      }}
                                    >
                                      {initials}
                                    </div>
                                  )
                                })}
                                {assignees.length > 4 && (
                                  <div
                                    className="w-7 h-7 rounded-full flex items-center justify-center font-mono text-[9px] font-bold ring-2 ring-[var(--bg-base)]"
                                    style={{ background: 'var(--bg-subtle)', color: 'var(--text-muted)', border: '1px solid var(--glass-border)' }}
                                  >
                                    +{assignees.length - 4}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Assign button */}
                          <motion.button
                            whileTap={{ scale: 0.95 }}
                            onClick={() => setAssigningInc(inc)}
                            className="
                              flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-md)]
                              text-[10px] font-medium uppercase tracking-widest cursor-pointer
                              border border-[var(--glass-border)] bg-[var(--glass-bg)]
                              text-[var(--text-secondary)] hover:text-[var(--text-primary)]
                              hover:bg-[var(--glass-hover)] hover:border-[var(--border-strong)]
                              transition-all duration-150 whitespace-nowrap
                            "
                          >
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                              <circle cx="5" cy="3" r="2" stroke="currentColor" strokeWidth="1.2" />
                              <path d="M1 9c0-2.2 1.8-4 4-4s4 1.8 4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                            </svg>
                            Assign
                          </motion.button>
                        </div>
                      </motion.div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      {/* Assignment modal — rendered outside card to avoid clipping */}
      <AssignEngineersModal
        incident={assigningInc}
        open={assigningInc !== null}
        onClose={() => setAssigningInc(null)}
        onSave={handleSave}
      />
    </>
  )
}
