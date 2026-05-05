'use client'

import { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import { getEngineers, subscribeToIncidents } from '@/lib/firestore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { RefreshCw, Users, Wrench } from 'lucide-react'
import type { Incident, UserProfile } from '@/types'

const EASE: [number, number, number, number] = [0.4, 0, 0.2, 1]

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 12, filter: 'blur(6px)' },
  visible: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.4, ease: EASE } },
}

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

type AssignFilter = 'ALL' | 'ASSIGNED' | 'IN PROGRESS' | 'RESOLVED' | 'CLOSED'
const ASSIGN_FILTERS: AssignFilter[] = ['ALL', 'ASSIGNED', 'IN PROGRESS', 'RESOLVED', 'CLOSED']

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function EngineerPage() {
  const { profile, loading: authLoading } = useAuth()
  const router = useRouter()

  const [incidents, setIncidents] = useState<Incident[]>([])
  const [team, setTeam]           = useState<UserProfile[]>([])
  const [loading, setLoading]     = useState(true)
  const [teamLoading, setTeamLoading] = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<AssignFilter>('ALL')
  const [refreshTeamKey, setRefreshTeamKey] = useState(0)

  const refresh = useCallback(() => setRefreshTeamKey(k => k + 1), [])

  useEffect(() => {
    if (authLoading) return
    if (profile?.role !== 'engineer') {
      router.replace('/dashboard')
    }
  }, [authLoading, profile, router])

  // Live incident subscription — filters to only this engineer's assigned incidents
  useEffect(() => {
    if (authLoading || !profile || profile.role !== 'engineer') return
    const unsub = subscribeToIncidents(all => {
      setIncidents(all.filter(i => (i.assignees ?? []).some(a => a.uid === profile.uid)))
      setLoading(false)
    })
    return () => unsub()
  }, [authLoading, profile])

  // Team: one-shot fetch with manual refresh
  useEffect(() => {
    if (authLoading || !profile || profile.role !== 'engineer') return
    let cancelled = false
    getEngineers()
      .then(engineers => { if (!cancelled) { setError(null); setTeam(engineers); setTeamLoading(false) } })
      .catch(() => { if (!cancelled) { setError('Failed to load team.'); setTeamLoading(false) } })
    return () => { cancelled = true }
  }, [authLoading, profile, refreshTeamKey])

  if (authLoading || profile?.role !== 'engineer') return null

  const filtered = incidents.filter(i =>
    statusFilter === 'ALL' ? true : i.status === statusFilter
  )

  const stats = {
    total:      incidents.length,
    open:       incidents.filter(i => i.status === 'ASSIGNED' || i.status === 'IN PROGRESS').length,
    inProgress: incidents.filter(i => i.status === 'IN PROGRESS').length,
    resolved:   incidents.filter(i => i.status === 'RESOLVED' || i.status === 'CLOSED').length,
  }

  const teamWithoutMe = team.filter(u => u.uid !== profile?.uid)
  const isLoading = loading || teamLoading

  return (
    <div className="min-h-full bg-[var(--bg-base)] p-6 md:p-8">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="max-w-5xl mx-auto space-y-8"
      >
        {/* Header */}
        <motion.div variants={itemVariants} className="flex flex-col gap-1">
          <h1 className="text-[28px] font-semibold text-[var(--text-primary)]">
            My Workspace
          </h1>
          <p className="text-[14px] text-[var(--text-secondary)]">
            Incidents assigned to you and your NOC team.
          </p>
        </motion.div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Assigned to Me', value: stats.total,      color: 'var(--text-primary)' },
            { label: 'Open',           value: stats.open,       color: 'var(--alarm-major)' },
            { label: 'In Progress',    value: stats.inProgress, color: 'var(--accent-bright)' },
            { label: 'Resolved',       value: stats.resolved,   color: 'var(--alarm-ok)' },
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
                    {isLoading ? '—' : s.value}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 items-start">

          {/* Incidents list */}
          <motion.div variants={itemVariants}>
            <Card className="bg-[var(--glass-bg)] backdrop-blur-xl border-[var(--glass-border)] shadow-[var(--shadow-md)] overflow-hidden">
              <CardHeader className="border-b border-[var(--glass-border)]">
                <div className="flex items-center justify-between gap-4 mb-3">
                  <div className="flex items-center gap-2">
                    <Wrench className="size-3.5 text-[var(--accent)]" />
                    <CardTitle className="text-[13px] font-medium text-[var(--text-primary)] uppercase tracking-widest">
                      My Incidents
                    </CardTitle>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {!isLoading && (
                      <span className="font-mono text-[11px] text-[var(--text-muted)]">
                        {filtered.length} shown
                      </span>
                    )}
                    <motion.button
                      whileTap={{ scale: 0.96 }}
                      onClick={refresh}
                      disabled={isLoading}
                      className="
                        flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--radius-md)]
                        text-[10px] font-medium uppercase tracking-widest
                        border border-[var(--glass-border)] bg-[var(--glass-bg)]
                        text-[var(--text-secondary)] hover:text-[var(--text-primary)]
                        hover:bg-[var(--glass-hover)] hover:border-[var(--border-strong)]
                        transition-colors duration-200 disabled:opacity-40 cursor-pointer
                      "
                    >
                      <RefreshCw className={`size-3 ${isLoading ? 'animate-spin' : ''}`} />
                      Refresh
                    </motion.button>
                  </div>
                </div>

                {/* Status filters */}
                <div className="flex gap-1.5 flex-wrap">
                  {ASSIGN_FILTERS.map(f => {
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

                {isLoading ? (
                  <div className="flex items-center gap-2.5 px-6 py-10 text-[13px] text-[var(--text-muted)] animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-[var(--text-muted)] animate-pulse" />
                    Loading incidents…
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-2">
                    <span className="text-[28px]" style={{ color: 'var(--alarm-ok)' }}>✓</span>
                    <span className="text-[13px] text-[var(--text-muted)]">
                      {incidents.length === 0
                        ? 'No incidents assigned to you.'
                        : `No ${statusFilter.toLowerCase()} incidents.`}
                    </span>
                  </div>
                ) : (
                  <AnimatePresence initial={false}>
                    {filtered.map((inc, idx) => {
                      const statusColor   = INC_STATUS_COLOR[inc.status] ?? 'var(--text-muted)'
                      const priorityColor = INC_PRIO_COLOR[inc.priority] ?? 'var(--text-secondary)'

                      return (
                        <motion.div
                          key={inc.incidentNumber}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ delay: idx * 0.015, duration: 0.25, ease: EASE }}
                          className="flex flex-col gap-2 px-5 py-4 border-b border-[var(--glass-border)] last:border-0 hover:bg-[var(--glass-hover)] transition-colors duration-150"
                          style={{ borderLeft: `2px solid ${statusColor}` }}
                        >
                          {/* Top row */}
                          <div className="flex items-center gap-2 flex-wrap">
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
                                color:      statusColor,
                                background: `color-mix(in srgb, ${statusColor} 12%, transparent)`,
                                border:     `1px solid color-mix(in srgb, ${statusColor} 28%, transparent)`,
                              }}
                            >
                              {inc.status}
                            </span>
                            <span
                              className="font-mono text-[9px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-[var(--radius-full)]"
                              style={{
                                color:      priorityColor,
                                background: `color-mix(in srgb, ${priorityColor} 10%, transparent)`,
                                border:     `1px solid color-mix(in srgb, ${priorityColor} 22%, transparent)`,
                              }}
                            >
                              {inc.priority}
                            </span>
                          </div>

                          {/* Impact */}
                          <p className="text-[12px] text-[var(--text-secondary)] leading-snug line-clamp-2">
                            {inc.impact}
                          </p>

                          {/* Timestamp */}
                          <span className="font-mono text-[10px] text-[var(--text-muted)]">
                            {relTime(inc.submitDate)} · {new Date(inc.submitDate).toISOString().slice(0, 10)}
                          </span>
                        </motion.div>
                      )
                    })}
                  </AnimatePresence>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Team panel */}
          <motion.div variants={itemVariants}>
            <Card className="bg-[var(--glass-bg)] backdrop-blur-xl border-[var(--glass-border)] shadow-[var(--shadow-md)] overflow-hidden sticky top-4">
              <CardHeader className="border-b border-[var(--glass-border)] pb-3">
                <div className="flex items-center gap-2">
                  <Users className="size-3.5 text-[var(--accent)]" />
                  <CardTitle className="text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-widest">
                    NOC Team
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {teamLoading ? (
                  <div className="px-4 py-6 text-[12px] text-[var(--text-muted)] animate-pulse font-mono">
                    Loading team…
                  </div>
                ) : (
                  <div>
                    {/* You */}
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--glass-border)]">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center font-mono text-[11px] font-bold shrink-0"
                        style={{
                          background: 'color-mix(in srgb, var(--accent) 15%, var(--bg-subtle))',
                          color:      'var(--accent-bright)',
                          border:     '1px solid var(--border-accent)',
                        }}
                      >
                        {(profile?.displayName ?? profile?.email ?? 'U').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-[13px] font-medium text-[var(--text-primary)] truncate">
                          {profile?.displayName ?? profile?.email?.split('@')[0]}
                        </span>
                        <span className="text-[10px] font-mono text-[var(--accent)] uppercase tracking-widest">You</span>
                      </div>
                    </div>

                    {/* Teammates */}
                    <AnimatePresence initial={false}>
                      {teamWithoutMe.length === 0 ? (
                        <div className="px-4 py-6 text-[12px] text-[var(--text-muted)] text-center font-mono">
                          No other engineers yet.
                        </div>
                      ) : (
                        teamWithoutMe.map((eng, i) => {
                          const label    = eng.displayName ?? eng.email.split('@')[0]
                          const initials = label.slice(0, 2).toUpperCase()
                          return (
                            <motion.div
                              key={eng.uid}
                              initial={{ opacity: 0, x: 8 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: i * 0.04, duration: 0.25, ease: EASE }}
                              className="flex items-center gap-3 px-4 py-3 border-b border-[var(--glass-border)] last:border-0 hover:bg-[var(--glass-hover)] transition-colors duration-150"
                            >
                              <div
                                className="w-8 h-8 rounded-full flex items-center justify-center font-mono text-[11px] font-bold shrink-0"
                                style={{
                                  background: 'color-mix(in srgb, var(--alarm-ok) 12%, var(--bg-subtle))',
                                  color:      'var(--alarm-ok)',
                                  border:     '1px solid rgba(52,211,153,0.25)',
                                }}
                              >
                                {initials}
                              </div>
                              <div className="flex flex-col gap-0.5 min-w-0">
                                <span className="text-[13px] text-[var(--text-primary)] truncate">{label}</span>
                                <span className="text-[11px] font-mono text-[var(--text-muted)] truncate">{eng.email}</span>
                              </div>
                            </motion.div>
                          )
                        })
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

        </div>
      </motion.div>
    </div>
  )
}
