'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import { resolveIncident, closeIncident, acknowledgeAssignedIncidents, getIncidentHistory, updateIncidentTechnicians } from '@/lib/firestore'
import { useLiveSnapshot } from '@/hooks/useLiveSnapshot'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  LayoutDashboard, Wrench, Users, HardHat, MessageSquare,
  AlertTriangle, CheckCircle2, Circle, ArrowRight,
  MapPin, Play, X, History,
} from 'lucide-react'
import { IncidentTimeline } from '@/components/incident/IncidentTimeline'
import { IncidentChat } from '@/components/incident/IncidentChat'
import { AssignTechniciansModal } from '@/components/incident/AssignTechniciansModal'
import type { Incident, IncidentAssignee } from '@/types'
import { cn } from '@/lib/utils'

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
  '3-Medium':   'var(--alarm-minor)',
  '4-Low':      'var(--alarm-warning)',
}

const INC_PRIO_LABEL: Record<string, string> = {
  '1-Critical': 'Critical',
  '2-High':     'Major',
  '3-Medium':   'Minor',
  '4-Low':      'Warning',
}
const PRIORITY_ORDER: Record<string, number> = {
  '1-Critical': 0, '2-High': 1, '3-Medium': 2, '4-Low': 3,
}

type AssignFilter = 'ALL' | 'ASSIGNED' | 'IN PROGRESS' | 'RESOLVED' | 'CLOSED'
const ASSIGN_FILTERS: AssignFilter[] = ['ALL', 'ASSIGNED', 'IN PROGRESS', 'RESOLVED', 'CLOSED']

type View = 'overview' | 'incidents' | 'chat'

/** Returns a human-readable relative time string (e.g. "5m ago", "2h ago"). */
function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function formatPriority(p: string): string {
  return INC_PRIO_LABEL[p] ?? p
}

function incSites(inc: Incident): string {
  return (inc.siteIds?.length ? inc.siteIds : [inc.siteId]).join(', ')
}

function incTechs(inc: Incident): string {
  return (inc.technologies?.length ? inc.technologies : [inc.technology]).join(' · ')
}

function incMapAntennaId(inc: Incident): string {
  return inc.antennaIds?.[0] ?? inc.antennaId
}

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

/**
 * Returns the single highest-priority open/in-progress incident to surface
 * as the "Priority Incident" card on the overview tab.
 */
function getSpotlightIncident(incidents: Incident[]): Incident | null {
  const active = incidents.filter(i => i.status === 'ASSIGNED' || i.status === 'IN PROGRESS')
  if (!active.length) return null
  return active.sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99))[0]
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

interface SidebarProps {
  view: View
  setView: (v: View) => void
  stats: { total: number; assigned: number; inProgress: number; resolved: number; open: number }
  loading: boolean
}

/** Left-rail navigation sidebar shared across all engineer views. Shows nav items and an at-a-glance incident status breakdown. */
function Sidebar({ view, setView, stats, loading }: SidebarProps) {
  const navItems: { id: View; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'overview',  label: 'Overview',     icon: <LayoutDashboard className="size-4" /> },
    { id: 'incidents', label: 'My Incidents', icon: <Wrench className="size-4" />, badge: stats.open },
    { id: 'chat',      label: 'Team Chat',    icon: <MessageSquare className="size-4" /> },
  ]

  const statusBreakdown = [
    { label: 'Assigned',    count: stats.assigned,   color: 'var(--alarm-warning)' },
    { label: 'In Progress', count: stats.inProgress, color: 'var(--accent-bright)' },
    { label: 'Resolved',    count: stats.resolved,   color: 'var(--alarm-ok)' },
  ]

  return (
    <aside className="w-[220px] flex-shrink-0 flex flex-col h-full border-r border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-2xl">

      <div className="px-5 pt-5 pb-3">
        <span className="text-[10px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
          Engineer
        </span>
      </div>

      <nav className="px-3 flex flex-col gap-0.5">
        {navItems.map(item => {
          const isActive = view === item.id
          return (
            <motion.button
              key={item.id}
              whileTap={{ scale: 0.97 }}
              onClick={() => setView(item.id)}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-md)] w-full text-left',
                'text-[13px] transition-colors duration-150 cursor-pointer',
                isActive
                  ? 'bg-[var(--accent-dim)] text-[var(--accent-bright)] border border-[var(--border-accent)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-hover)] border border-transparent'
              )}
            >
              <span className={isActive ? 'text-[var(--accent-bright)]' : 'text-[var(--text-muted)]'}>
                {item.icon}
              </span>
              <span className="flex-1">{item.label}</span>
              {item.badge !== undefined && item.badge > 0 && (
                <span
                  className="font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded-full min-w-[20px] text-center"
                  style={{
                    background: isActive ? 'var(--accent-dim)' : 'var(--bg-subtle)',
                    color: isActive ? 'var(--accent-bright)' : 'var(--text-secondary)',
                    border: `1px solid ${isActive ? 'var(--border-accent)' : 'var(--glass-border)'}`,
                  }}
                >
                  {loading ? '·' : item.badge}
                </span>
              )}
            </motion.button>
          )
        })}
      </nav>

      <div className="mx-4 my-3 h-px bg-[var(--glass-border)]" />

      <div className="px-5">
        <p className="text-[10px] font-medium uppercase tracking-widest text-[var(--text-muted)] mb-2">
          Incidents
        </p>
        <div className="flex flex-col gap-2">
          {statusBreakdown.map(s => (
            <div key={s.label} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
                <span className="text-[12px] text-[var(--text-secondary)]">{s.label}</span>
              </div>
              <span className="font-mono text-[11px] text-[var(--text-primary)]">
                {loading ? '—' : s.count}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1" />

    </aside>
  )
}

// ─── Overview view ────────────────────────────────────────────────────────────

interface OverviewProps {
  incidents: Incident[]
  loading: boolean
  greeting: string
  firstName: string
  hasNameSet: boolean
  onInspect: (num: string) => void
  onGoToIncidents: () => void
}


/**
 * Overview tab: a personalised greeting with summary stats, a spotlight card
 * for the most critical open incident, and a to-do checklist.
 *
 * Checklist items are either auto-driven by live data (e.g. "has set a display
 * name") or manually togglable, with manual checks persisted in localStorage.
 */
function OverviewView({ incidents, loading, greeting, firstName, hasNameSet, onInspect, onGoToIncidents }: OverviewProps) {
  const stats = {
    total:      incidents.length,
    open:       incidents.filter(i => i.status === 'ASSIGNED' || i.status === 'IN PROGRESS').length,
    inProgress: incidents.filter(i => i.status === 'IN PROGRESS').length,
    resolved:   incidents.filter(i => i.status === 'RESOLVED' || i.status === 'CLOSED').length,
  }
  const spotlight = getSpotlightIncident(incidents)
  const router = useRouter()

  // Manual overrides stored in localStorage — auto-checks from data take priority
  const [manualChecked, setManualChecked] = useState<Record<string, boolean>>(() => {
    if (typeof window === 'undefined') return {}
    try {
      return JSON.parse(localStorage.getItem('engineer-todo') ?? '{}')
    } catch { return {} }
  })

  function toggleManual(key: string, autoDone: boolean) {
    if (autoDone) return // data-driven, can't uncheck
    setManualChecked(prev => {
      const next = { ...prev, [key]: !prev[key] }
      localStorage.setItem('engineer-todo', JSON.stringify(next))
      return next
    })
  }

  const autoDone: Record<string, boolean> = {
    'todo-display-name':  hasNameSet,
    'todo-start-working': !loading && stats.inProgress > 0,
    'todo-clear-backlog': !loading && stats.total > 0 && stats.open === 0,
    'todo-resolve-one':   !loading && stats.resolved > 0,
  }

  const checklist = [
    {
      key: 'todo-display-name',
      label: 'Set your display name',
      note: hasNameSet ? 'Profile complete' : 'Enter your name when prompted',
    },
    {
      key: 'todo-start-working',
      label: 'Start working on an incident',
      note: loading ? '—' : stats.inProgress > 0 ? `${stats.inProgress} in progress` : 'Acknowledge an incident first',
    },
    {
      key: 'todo-clear-backlog',
      label: 'Clear your open backlog',
      note: loading ? '—' : stats.open === 0 ? (stats.total > 0 ? 'All caught up' : 'No incidents yet') : `${stats.open} still open`,
    },
    {
      key: 'todo-resolve-one',
      label: 'Resolve at least one incident',
      note: loading ? '—' : stats.resolved > 0 ? `${stats.resolved} resolved` : 'No resolved incidents yet',
    },
  ]

  const STAT_ACCENT = [
    'var(--accent-bright)', 'var(--alarm-major)', 'var(--alarm-warning)', 'var(--alarm-ok)',
  ]

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="max-w-4xl mx-auto space-y-8 p-6 md:p-8">

      <motion.div variants={itemVariants}>
        <h1 className="text-[28px] font-semibold text-[var(--text-primary)] leading-tight">
          {greeting},{' '}
          <span className="italic font-light text-[var(--accent-bright)]">{firstName}</span>
        </h1>
        <p className="mt-1 text-[14px] text-[var(--text-secondary)]">
          Here&apos;s an overview of your assigned incidents and workload.
        </p>
      </motion.div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Assigned to Me', value: stats.total,      accent: STAT_ACCENT[0] },
          { label: 'Open',           value: stats.open,       accent: STAT_ACCENT[1] },
          { label: 'In Progress',    value: stats.inProgress, accent: STAT_ACCENT[2] },
          { label: 'Resolved',       value: stats.resolved,   accent: STAT_ACCENT[3] },
        ].map(s => (
          <motion.div key={s.label} variants={itemVariants}>
            <Card className="relative overflow-hidden bg-[var(--glass-bg)] backdrop-blur-xl border-[var(--glass-border)] shadow-[var(--shadow-md)]">
              <CardHeader className="pb-1">
                <CardTitle className="text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-widest">
                  {s.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-5">
                <div className="text-[28px] font-bold font-mono text-[var(--text-primary)]">
                  {loading ? '—' : s.value}
                </div>
              </CardContent>
              <div className="absolute bottom-0 left-0 right-0 h-[3px]" style={{ background: s.accent }} />
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">

        <motion.div variants={itemVariants}>
          <Card
            className="bg-[var(--glass-bg)] backdrop-blur-xl border-[var(--glass-border)] shadow-[var(--shadow-md)] overflow-hidden"
            style={spotlight ? { borderLeft: `3px solid ${INC_PRIO_COLOR[spotlight.priority] ?? 'var(--text-muted)'}` } : undefined}
          >
            <CardHeader className="pb-3 border-b border-[var(--glass-border)]">
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-3.5 text-[var(--alarm-critical)]" />
                <CardTitle className="text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-widest">
                  Priority Incident
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-4 pb-5">
              {loading ? (
                <div className="text-[13px] text-[var(--text-muted)] font-mono animate-pulse">Loading…</div>
              ) : !spotlight ? (
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="size-5 text-[var(--alarm-ok)] shrink-0" />
                  <div>
                    <p className="text-[15px] font-semibold text-[var(--text-primary)]">All clear</p>
                    <p className="text-[12px] text-[var(--text-secondary)] mt-0.5">No open or in-progress incidents.</p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {/* Incident ID + impact on one block, no dot */}
                  <div>
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-mono text-[14px] font-bold text-[var(--text-primary)]">
                        {spotlight.incidentNumber}
                      </span>
                      <span
                        className="font-mono text-[9px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-[var(--radius-full)]"
                        style={{
                          color: INC_STATUS_COLOR[spotlight.status],
                          background: `color-mix(in srgb, ${INC_STATUS_COLOR[spotlight.status]} 12%, transparent)`,
                          border: `1px solid color-mix(in srgb, ${INC_STATUS_COLOR[spotlight.status]} 28%, transparent)`,
                        }}
                      >
                        {spotlight.status}
                      </span>
                    </div>
                    <p className="text-[13px] text-[var(--text-secondary)] leading-snug">{spotlight.impact}</p>
                  </div>

                  {/* Meta chips */}
                  <div className="flex flex-wrap gap-1.5">
                    {(spotlight.siteIds?.length ? spotlight.siteIds : [spotlight.siteId]).map(s => (
                      <span key={s} className="font-mono text-[10px] font-semibold uppercase tracking-widest px-2.5 py-0.5 rounded-[var(--radius-full)]" style={{ color: 'var(--text-muted)', background: `color-mix(in srgb, var(--text-muted) 12%, transparent)`, border: `1px solid color-mix(in srgb, var(--text-muted) 28%, transparent)` }}>{s}</span>
                    ))}
                    {(spotlight.technologies?.length ? spotlight.technologies : [spotlight.technology]).map(t => (
                      <span key={t} className="font-mono text-[10px] font-semibold uppercase tracking-widest px-2.5 py-0.5 rounded-[var(--radius-full)]" style={{ color: 'var(--accent-bright)', background: 'var(--accent-dim)', border: '1px solid var(--border-accent)' }}>{t}</span>
                    ))}
                    <span
                      className="font-mono text-[10px] font-semibold uppercase tracking-widest px-2.5 py-0.5 rounded-[var(--radius-full)]"
                      style={{
                        background: INC_PRIO_COLOR[spotlight.priority] ?? 'var(--text-secondary)',
                        color: 'white',
                        border: '1px solid transparent',
                        boxShadow: `0 0 8px color-mix(in srgb, ${INC_PRIO_COLOR[spotlight.priority] ?? 'var(--text-secondary)'} 55%, transparent)`,
                      }}
                    >
                      {formatPriority(spotlight.priority)}
                    </span>
                  </div>

                  <p className="font-mono text-[10px] text-[var(--text-muted)]">
                    {relTime(spotlight.submitDate)} · {new Date(spotlight.submitDate).toISOString().slice(0, 10)}
                  </p>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-wrap pt-1">
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={() => onInspect(spotlight.incidentNumber)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-md)] text-[12px] font-medium cursor-pointer"
                      style={{ background: 'var(--accent-dim)', border: '1px solid var(--border-accent)', color: 'var(--accent-bright)' }}
                    >
                      Inspect <ArrowRight className="size-3" />
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={() => router.push(`/map?antennaId=${incMapAntennaId(spotlight)}`)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-md)] text-[12px] font-medium cursor-pointer backdrop-blur-sm transition-all duration-150 hover:brightness-125"
                      style={{
                        background: 'rgba(96,165,250,0.12)',
                        border: '1px solid rgba(96,165,250,0.35)',
                        color: '#60a5fa',
                        boxShadow: '0 0 10px rgba(96,165,250,0.15)',
                      }}
                    >
                      <MapPin className="size-3" /> Map
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={onGoToIncidents}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-md)] text-[12px] font-medium cursor-pointer backdrop-blur-sm transition-all duration-150 hover:bg-[var(--glass-hover)] hover:text-[var(--text-primary)]"
                      style={{
                        background: 'var(--glass-bg)',
                        border: '1px solid var(--border-strong)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      All incidents
                    </motion.button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className="bg-[var(--glass-bg)] backdrop-blur-xl border-[var(--glass-border)] shadow-[var(--shadow-md)]">
            <CardHeader className="pb-3 border-b border-[var(--glass-border)]">
              <CardTitle className="text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-widest">
                To-Do
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {checklist.map((item, i) => {
                const isAutoDone = autoDone[item.key] ?? false
                const isDone = isAutoDone || (manualChecked[item.key] ?? false)
                return (
                <motion.button
                  key={item.key}
                  initial={{ opacity: 0, x: 6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 + i * 0.07, duration: 0.3, ease: EASE }}
                  onClick={() => toggleManual(item.key, isAutoDone)}
                  className="flex items-start gap-3 px-5 py-3.5 border-b border-[var(--glass-border)] last:border-0 w-full text-left transition-colors duration-150 hover:bg-[var(--glass-hover)] cursor-pointer"
                  style={{ cursor: isAutoDone ? 'default' : 'pointer' }}
                >
                  <div className="mt-0.5 shrink-0">
                    {isDone
                      ? <CheckCircle2 className="size-4 text-[var(--alarm-ok)]" />
                      : <Circle className="size-4 text-[var(--text-muted)]" />
                    }
                  </div>
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span
                      className="text-[13px] leading-snug"
                      style={{
                        color: isDone ? 'var(--text-muted)' : 'var(--text-primary)',
                        textDecoration: isDone ? 'line-through' : 'none',
                      }}
                    >
                      {item.label}
                    </span>
                    <span className="font-mono text-[10px] text-[var(--text-muted)]">{item.note}</span>
                  </div>
                </motion.button>
                )})}
            </CardContent>
          </Card>
        </motion.div>

      </div>
    </motion.div>
  )
}

// ─── Incidents view ───────────────────────────────────────────────────────────

interface IncidentsViewProps {
  incidents: Incident[]
  loading: boolean
  selectedIncidentNumber: string | null
  onSelect: (num: string) => void
  profile: { uid: string; displayName?: string } | null
  onIncidentResolved: (incidentNumber: string) => void
  onIncidentClosed: (incidentNumber: string) => void
}

/**
 * Incidents tab: filterable list of all incidents assigned to the engineer,
 * with action buttons (Acknowledge → Resolve → Close) and a side panel showing
 * the NOC team, dispatched technicians, and activity timeline for the selected incident.
 */
function IncidentsView({ incidents, loading, selectedIncidentNumber, onSelect, profile, onIncidentResolved, onIncidentClosed }: IncidentsViewProps) {
  const router = useRouter()
  const [statusFilter, setStatusFilter] = useState<AssignFilter>('ALL')
  const [resolving, setResolving] = useState<string | null>(null)
  const [acknowledging, setAcknowledging] = useState<string | null>(null)
  const [dispatchOpen, setDispatchOpen] = useState(false)

  async function handleDispatch(incidentNumber: string, technicians: IncidentAssignee[]) {
    await updateIncidentTechnicians(incidentNumber, technicians)
    // The live snapshot pushes the updated technician list back into `incidents`.
  }

  async function handleResolve(e: React.MouseEvent, incidentNumber: string) {
    e.stopPropagation()
    setResolving(incidentNumber)
    try {
      await resolveIncident(incidentNumber)
      onIncidentResolved(incidentNumber)
    } finally {
      setResolving(null)
    }
  }

  async function handleAcknowledge(e: React.MouseEvent, incidentNumber: string) {
    e.stopPropagation()
    setAcknowledging(incidentNumber)
    try {
      await acknowledgeAssignedIncidents([incidentNumber])
    } finally {
      setAcknowledging(null)
    }
  }

  async function handleClose(e: React.MouseEvent, incidentNumber: string) {
    e.stopPropagation()
    setResolving(incidentNumber)
    try {
      await closeIncident(incidentNumber)
      onIncidentClosed(incidentNumber)
    } finally {
      setResolving(null)
    }
  }

  const filtered = incidents.filter(i =>
    statusFilter === 'ALL' ? true : i.status === statusFilter
  )
  const selectedIncident =
    incidents.find(i => i.incidentNumber === selectedIncidentNumber) ??
    incidents[0] ??
    null
  const selectedTeam = selectedIncident?.assignees ?? []
  const selectedTechnicians = selectedIncident?.technicians ?? []

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="p-6 md:p-8 h-full">
      <motion.div variants={itemVariants} className="mb-6">
        <h2 className="text-[20px] font-semibold text-[var(--text-primary)]">My Incidents</h2>
        <p className="text-[14px] text-[var(--text-secondary)] mt-0.5">Select an incident to view its NOC team.</p>
      </motion.div>

      <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 items-start">

        <Card className="bg-[var(--glass-bg)] backdrop-blur-xl border-[var(--glass-border)] shadow-[var(--shadow-md)] overflow-hidden">
          <CardHeader className="border-b border-[var(--glass-border)]">
            <div className="flex items-center justify-between gap-4 mb-3">
              <div className="flex items-center gap-2">
                <Wrench className="size-3.5 text-[var(--accent)]" />
                <CardTitle className="text-[13px] font-medium text-[var(--text-primary)] uppercase tracking-widest">All Assigned</CardTitle>
              </div>
              {!loading && (
                <span className="font-mono text-[11px] text-[var(--text-muted)]">{filtered.length} shown</span>
              )}
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {ASSIGN_FILTERS.map(f => {
                const isActive = statusFilter === f
                const color = INC_STATUS_COLOR[f]
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
            {loading ? (
              <div className="flex items-center gap-2.5 px-6 py-10 text-[13px] text-[var(--text-muted)] animate-pulse">
                <span className="w-2 h-2 rounded-full bg-[var(--text-muted)] animate-pulse" />
                Loading incidents…
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2">
                <span className="text-[28px]" style={{ color: 'var(--alarm-ok)' }}>✓</span>
                <span className="text-[13px] text-[var(--text-muted)]">
                  {incidents.length === 0 ? 'No incidents assigned to you.' : `No ${statusFilter.toLowerCase()} incidents.`}
                </span>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {filtered.map((inc, idx) => {
                  const statusColor   = INC_STATUS_COLOR[inc.status] ?? 'var(--text-muted)'
                  const priorityColor = INC_PRIO_COLOR[inc.priority] ?? 'var(--text-secondary)'
                  const isSelected    = (selectedIncident?.incidentNumber ?? null) === inc.incidentNumber

                  return (
                    <motion.div
                      key={inc.incidentNumber}
                      role="button" tabIndex={0} aria-pressed={isSelected}
                      onClick={() => onSelect(inc.incidentNumber)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(inc.incidentNumber) } }}
                      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                      transition={{ delay: idx * 0.015, duration: 0.25, ease: EASE }}
                      className="flex flex-col gap-2 px-5 py-4 border-b border-[var(--glass-border)] last:border-0 hover:bg-[var(--glass-hover)] transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-accent)]"
                      style={{
                        borderLeft: `2px solid ${statusColor}`,
                        background: isSelected ? 'var(--glass-hover)' : undefined,
                        boxShadow: isSelected ? 'inset 0 0 0 1px var(--border-accent)' : undefined,
                      }}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-[12px] font-bold text-[var(--text-primary)]">{inc.incidentNumber}</span>
                        {(inc.siteIds?.length ? inc.siteIds : [inc.siteId]).map(s => (
                          <span key={s} className="font-mono text-[10px] text-[var(--text-muted)]">{s}</span>
                        ))}
                        {(inc.technologies?.length ? inc.technologies : [inc.technology]).map(t => (
                          <span key={t} className="font-mono text-[9px] font-semibold uppercase tracking-widest px-1.5 py-0.5 rounded-[var(--radius-full)]" style={{ color: 'var(--accent-bright)', background: 'var(--accent-dim)', border: '1px solid var(--border-accent)' }}>{t}</span>
                        ))}
                        <span className="font-mono text-[9px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-[var(--radius-full)]" style={{ color: statusColor, background: `color-mix(in srgb, ${statusColor} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${statusColor} 28%, transparent)` }}>{inc.status}</span>
                        <span className="font-mono text-[9px] font-semibold uppercase tracking-widest px-2.5 py-0.5 rounded-[var(--radius-full)]" style={{ background: priorityColor, color: 'white', border: '1px solid transparent', boxShadow: `0 0 6px color-mix(in srgb, ${priorityColor} 55%, transparent)` }}>{formatPriority(inc.priority)}</span>
                      </div>
                      <p className="text-[12px] text-[var(--text-secondary)] leading-snug line-clamp-2">{inc.impact}</p>
                      <div className="flex items-center justify-between gap-2 mt-1">
                        <span className="font-mono text-[10px] text-[var(--text-muted)]">
                          {relTime(inc.submitDate)} · {new Date(inc.submitDate).toISOString().slice(0, 10)}
                        </span>
                        <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                          {/* Map — hidden for closed incidents */}
                          {inc.status !== 'CLOSED' && (
                            <motion.button
                              whileTap={{ scale: 0.95 }}
                              onClick={e => { e.stopPropagation(); router.push(`/map?antennaId=${incMapAntennaId(inc)}`) }}
                              className="flex items-center gap-1 px-2 py-1 rounded-[var(--radius-sm)] text-[10px] font-medium cursor-pointer backdrop-blur-sm transition-all duration-150 hover:brightness-125"
                              style={{ background: 'rgba(96,165,250,0.12)', border: '1px solid rgba(96,165,250,0.35)', color: '#60a5fa', boxShadow: '0 0 8px rgba(96,165,250,0.15)' }}
                            >
                              <MapPin className="size-2.5" /> Map
                            </motion.button>
                          )}

                          {/* Acknowledge — only when ASSIGNED */}
                          {inc.status === 'ASSIGNED' && (
                            <motion.button
                              whileTap={{ scale: 0.95 }}
                              onClick={e => handleAcknowledge(e, inc.incidentNumber)}
                              disabled={acknowledging === inc.incidentNumber}
                              className="flex items-center gap-1 px-2 py-1 rounded-[var(--radius-sm)] text-[10px] font-medium cursor-pointer backdrop-blur-sm transition-all duration-150 hover:brightness-125 disabled:opacity-40 disabled:cursor-not-allowed"
                              style={{ background: 'rgba(124,111,247,0.12)', border: '1px solid rgba(124,111,247,0.35)', color: 'var(--accent-bright)', boxShadow: '0 0 8px rgba(124,111,247,0.15)' }}
                            >
                              <Play className="size-2.5" />
                              {acknowledging === inc.incidentNumber ? 'Starting…' : 'Acknowledge'}
                            </motion.button>
                          )}

                          {/* Resolve — only when IN PROGRESS */}
                          {inc.status === 'IN PROGRESS' && (
                            <motion.button
                              whileTap={{ scale: 0.95 }}
                              onClick={e => handleResolve(e, inc.incidentNumber)}
                              disabled={resolving === inc.incidentNumber}
                              className="flex items-center gap-1 px-2 py-1 rounded-[var(--radius-sm)] text-[10px] font-medium cursor-pointer backdrop-blur-sm transition-all duration-150 hover:brightness-125 disabled:opacity-40 disabled:cursor-not-allowed"
                              style={{ background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.35)', color: 'var(--alarm-ok)', boxShadow: '0 0 8px rgba(52,211,153,0.15)' }}
                            >
                              <CheckCircle2 className="size-2.5" />
                              {resolving === inc.incidentNumber ? 'Resolving…' : 'Resolve'}
                            </motion.button>
                          )}

                          {/* Close — only when RESOLVED */}
                          {inc.status === 'RESOLVED' && (
                            <motion.button
                              whileTap={{ scale: 0.95 }}
                              onClick={e => handleClose(e, inc.incidentNumber)}
                              disabled={resolving === inc.incidentNumber}
                              className="flex items-center gap-1 px-2 py-1 rounded-[var(--radius-sm)] text-[10px] font-medium cursor-pointer backdrop-blur-sm transition-all duration-150 hover:brightness-125 disabled:opacity-40 disabled:cursor-not-allowed"
                              style={{ background: 'rgba(74,72,104,0.25)', border: '1px solid rgba(74,72,104,0.5)', color: 'var(--text-secondary)', boxShadow: 'none' }}
                            >
                              <X className="size-2.5" />
                              {resolving === inc.incidentNumber ? 'Closing…' : 'Close'}
                            </motion.button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4 sticky top-6">
        <Card className="bg-[var(--glass-bg)] backdrop-blur-xl border-[var(--glass-border)] shadow-[var(--shadow-md)] overflow-hidden">
          <CardHeader className="border-b border-[var(--glass-border)] pb-3">
            <div className="flex items-center gap-2">
              <Users className="size-3.5 text-[var(--accent)]" />
              <CardTitle className="text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-widest">NOC Team</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="px-4 py-6 text-[12px] text-[var(--text-muted)] animate-pulse font-mono">Loading team…</div>
            ) : !selectedIncident ? (
              <div className="px-4 py-8 text-center">
                <div className="text-[12px] text-[var(--text-secondary)]">Select an incident to view its team.</div>
                <div className="mt-1 text-[11px] font-mono text-[var(--text-muted)]">The team is scoped per incident.</div>
              </div>
            ) : (
              <div>
                <div className="px-4 py-3 border-b border-[var(--glass-border)] bg-[var(--glass-bg)]">
                  <div className="font-mono text-[12px] font-bold text-[var(--text-primary)]">{selectedIncident.incidentNumber}</div>
                  <div className="mt-1 text-[10px] font-mono text-[var(--text-muted)] truncate">
                    {incSites(selectedIncident)} · {incTechs(selectedIncident)}
                  </div>
                </div>
                <AnimatePresence initial={false} mode="popLayout">
                  {selectedTeam.length === 0 ? (
                    <motion.div key="empty-team" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2, ease: EASE }} className="px-4 py-6 text-[12px] text-[var(--text-muted)] text-center font-mono">
                      No engineers assigned.
                    </motion.div>
                  ) : selectedTeam.map((eng, i) => {
                    const isMe     = eng.uid === profile?.uid
                    const label    = eng.displayName ?? eng.email.split('@')[0]
                    const initials = label.slice(0, 2).toUpperCase()
                    return (
                      <motion.div key={eng.uid} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ delay: i * 0.04, duration: 0.25, ease: EASE }} className="flex items-center gap-3 px-4 py-3 border-b border-[var(--glass-border)] last:border-0">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center font-mono text-[11px] font-bold shrink-0" style={{ background: isMe ? 'color-mix(in srgb, var(--accent) 15%, var(--bg-subtle))' : 'color-mix(in srgb, var(--alarm-ok) 12%, var(--bg-subtle))', color: isMe ? 'var(--accent-bright)' : 'var(--alarm-ok)', border: `1px solid ${isMe ? 'var(--border-accent)' : 'rgba(52,211,153,0.25)'}` }}>{initials}</div>
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="text-[13px] text-[var(--text-primary)] truncate">{label}</span>
                          <span className="text-[11px] font-mono text-[var(--text-muted)] truncate">{eng.email}</span>
                        </div>
                        {isMe && <span className="ml-auto text-[10px] font-mono text-[var(--accent)] uppercase tracking-widest">You</span>}
                      </motion.div>
                    )
                  })}
                </AnimatePresence>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Field technicians — dispatched by the engineer to resolve on-site */}
        <Card className="bg-[var(--glass-bg)] backdrop-blur-xl border-[var(--glass-border)] shadow-[var(--shadow-md)] overflow-hidden">
          <CardHeader className="border-b border-[var(--glass-border)] pb-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <HardHat className="size-3.5 text-[var(--alarm-warning)]" />
                <CardTitle className="text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-widest">Field Technicians</CardTitle>
              </div>
              {selectedIncident && selectedIncident.status !== 'CLOSED' && (
                <button
                  onClick={() => setDispatchOpen(true)}
                  className="text-[10px] font-medium uppercase tracking-widest px-2.5 py-1 rounded-[var(--radius-md)] border border-[var(--glass-border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-hover)] hover:border-[var(--border-strong)] transition-colors duration-150"
                >
                  Dispatch
                </button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {!selectedIncident ? (
              <div className="px-4 py-6 text-[12px] text-[var(--text-muted)] text-center font-mono">
                Select an incident to dispatch technicians.
              </div>
            ) : (
              <AnimatePresence initial={false} mode="popLayout">
                {selectedTechnicians.length === 0 ? (
                  <motion.div key="empty-tech" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2, ease: EASE }} className="px-4 py-6 text-[12px] text-[var(--text-muted)] text-center font-mono">
                    No technicians on-site yet.
                  </motion.div>
                ) : selectedTechnicians.map((tech, i) => {
                  const label    = tech.displayName ?? tech.email.split('@')[0]
                  const initials = label.slice(0, 2).toUpperCase()
                  return (
                    <motion.div key={tech.uid} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ delay: i * 0.04, duration: 0.25, ease: EASE }} className="flex items-center gap-3 px-4 py-3 border-b border-[var(--glass-border)] last:border-0">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center font-mono text-[11px] font-bold shrink-0" style={{ background: 'color-mix(in srgb, var(--alarm-warning) 12%, var(--bg-subtle))', color: 'var(--alarm-warning)', border: '1px solid rgba(245,158,11,0.25)' }}>{initials}</div>
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-[13px] text-[var(--text-primary)] truncate">{label}</span>
                        <span className="text-[11px] font-mono text-[var(--text-muted)] truncate">{tech.email}</span>
                      </div>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            )}
          </CardContent>
        </Card>

        {/* Activity Timeline */}
        {selectedIncident && (
          <Card className="bg-[var(--glass-bg)] backdrop-blur-xl border-[var(--glass-border)] shadow-[var(--shadow-md)] overflow-hidden">
            <CardHeader className="border-b border-[var(--glass-border)] pb-3">
              <div className="flex items-center gap-2">
                <History className="size-3.5 text-[var(--accent)]" />
                <CardTitle className="text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-widest">Activity</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <IncidentTimeline
                incidentNumber={selectedIncident.incidentNumber}
                currentUid={profile?.uid}
                currentName={profile?.displayName ?? profile?.uid}
                allowNotes={true}
              />
            </CardContent>
          </Card>
        )}
        </div>

      </motion.div>

      <AssignTechniciansModal
        incident={selectedIncident}
        open={dispatchOpen}
        onClose={() => setDispatchOpen(false)}
        onSave={handleDispatch}
      />
    </motion.div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

/**
 * Engineer workspace page (engineer-only).
 *
 * Data strategy:
 * - Open incidents arrive via the `useLiveSnapshot` Firestore listener so
 *   the UI updates in real-time without polling.
 * - Resolved/closed history is fetched once on mount from the server-cached
 *   history endpoint, then merged with live data so the incidents list shows
 *   both active and historical work.
 * - Local optimistic updates (handleIncidentResolved / handleIncidentClosed)
 *   keep the UI snappy while Firestore catches up.
 *
 * Access guard: non-engineers are redirected to `/dashboard`.
 */
export default function EngineerPage() {
  const { profile, loading: authLoading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  // Support deep-linking from notifications: /engineer?incident=INC-123
  const incidentFromUrl = searchParams.get('incident')

  const [view, setView]           = useState<View>(incidentFromUrl ? 'incidents' : 'overview')
  const [selectedIncidentNumber, setSelectedIncidentNumber] = useState<string | null>(incidentFromUrl)
  const [greeting]                = useState(getGreeting)

  // When a notification navigates here with a new incident param, switch view
  useEffect(() => {
    if (incidentFromUrl) {
      let cancelled = false
      queueMicrotask(() => {
        if (cancelled) return
        setView('incidents')
        setSelectedIncidentNumber(incidentFromUrl)
        router.replace('/engineer', { scroll: false })
      })
      return () => {
        cancelled = true
      }
    }
  }, [incidentFromUrl, router])

  // Live open incidents pushed via meta/liveSnapshot — no polling.
  // Resolved/closed history for this engineer is fetched on demand from the
  // history endpoint below (kept out of the live snapshot to bound its size).
  const enableSnapshot = !authLoading && profile?.role === 'engineer'
  const { openIncidents: allOpenIncidents, loading: snapshotLoading } = useLiveSnapshot(enableSnapshot)
  const loading = enableSnapshot && snapshotLoading

  const myOpenIncidents = useMemo<Incident[]>(() => {
    if (!profile) return []
    return allOpenIncidents.filter(i => (i.assignees ?? []).some(a => a.uid === profile.uid))
  }, [allOpenIncidents, profile])

  // Resolved/closed history for this engineer — fetched once on mount and
  // refreshed on demand. Server cache (15 min) absorbs repeated loads.
  const [myHistory, setMyHistory] = useState<Incident[]>([])
  useEffect(() => {
    if (!profile || profile.role !== 'engineer') return
    let cancelled = false
    void (async () => {
      try {
        const { incidents: hist } = await getIncidentHistory({ assigneeUid: profile.uid, limit: 50 })
        if (!cancelled) setMyHistory(hist)
      } catch (err) {
        console.error('[engineer] history fetch failed', err)
      }
    })()
    return () => { cancelled = true }
  }, [profile])

  // Merge history and live incidents — history goes in first so the live
  // snapshot can overwrite stale status values with the real-time truth.
  const incidents = useMemo<Incident[]>(() => {
    const merged = new Map<string, Incident>()
    // History first, then live snapshot overwrites so the real-time state wins
    for (const i of myHistory)       merged.set(i.incidentNumber, i)
    for (const i of myOpenIncidents) merged.set(i.incidentNumber, i)
    return Array.from(merged.values())
  }, [myOpenIncidents, myHistory])

  function handleIncidentResolved(incidentNumber: string) {
    const resolvedDate = new Date().toISOString()
    // Grab the incident from the live snapshot before it disappears
    const live = myOpenIncidents.find(i => i.incidentNumber === incidentNumber)
    setMyHistory(prev => {
      const exists = prev.some(i => i.incidentNumber === incidentNumber)
      if (exists) {
        return prev.map(i =>
          i.incidentNumber === incidentNumber
            ? { ...i, status: 'RESOLVED' as const, resolvedDate, closedDate: null }
            : i
        )
      }
      return live ? [...prev, { ...live, status: 'RESOLVED' as const, resolvedDate, closedDate: null }] : prev
    })
  }

  function handleIncidentClosed(incidentNumber: string) {
    const closedDate = new Date().toISOString()
    setMyHistory(prev => {
      const exists = prev.some(i => i.incidentNumber === incidentNumber)
      if (exists) {
        return prev.map(i =>
          i.incidentNumber === incidentNumber
            ? { ...i, status: 'CLOSED' as const, closedDate }
            : i
        )
      }
      // Incident transitioned to RESOLVED mid-session — add it to history as CLOSED
      const live = myOpenIncidents.find(i => i.incidentNumber === incidentNumber)
      return live ? [...prev, { ...live, status: 'CLOSED' as const, closedDate }] : prev
    })
  }

  useEffect(() => {
    if (authLoading) return
    if (profile?.role !== 'engineer') router.replace('/dashboard')
  }, [authLoading, profile, router])

  if (authLoading || profile?.role !== 'engineer') return null

  const stats = {
    total:      incidents.length,
    assigned:   incidents.filter(i => i.status === 'ASSIGNED').length,
    inProgress: incidents.filter(i => i.status === 'IN PROGRESS').length,
    resolved:   incidents.filter(i => i.status === 'RESOLVED' || i.status === 'CLOSED').length,
    open:       incidents.filter(i => i.status === 'ASSIGNED' || i.status === 'IN PROGRESS').length,
  }

  const firstName   = profile.displayName?.split(' ')[0] ?? profile.email?.split('@')[0] ?? 'Engineer'
  const displayName = profile.displayName ?? profile.email?.split('@')[0] ?? 'Engineer'
  const hasNameSet  = !!(profile.displayName)

  function handleInspect(num: string) {
    setSelectedIncidentNumber(num)
    setView('incidents')
  }

  return (
    <div className="flex h-full bg-[var(--bg-base)] overflow-hidden">

      <Sidebar
        view={view}
        setView={setView}
        stats={stats}
        loading={loading}
      />

      <main className="flex-1 overflow-hidden flex flex-col min-w-0">
        <AnimatePresence mode="wait">
          {view === 'overview' && (
            <motion.div key="overview" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }} transition={{ duration: 0.2, ease: EASE }} className="flex-1 overflow-y-auto">
              <OverviewView
                incidents={incidents}
                loading={loading}
                greeting={greeting}
                firstName={firstName}
                hasNameSet={hasNameSet}
                onInspect={handleInspect}
                onGoToIncidents={() => setView('incidents')}
              />
            </motion.div>
          )}
          {view === 'incidents' && (
            <motion.div key="incidents" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.2, ease: EASE }} className="flex-1 overflow-y-auto">
              <IncidentsView
                incidents={incidents}
                loading={loading}
                selectedIncidentNumber={selectedIncidentNumber}
                onSelect={setSelectedIncidentNumber}
                profile={profile}
                onIncidentResolved={handleIncidentResolved}
                onIncidentClosed={handleIncidentClosed}
              />
            </motion.div>
          )}
          {view === 'chat' && (
            <motion.div key="chat" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.2, ease: EASE }} className="flex-1 overflow-hidden">
              <IncidentChat
                incidents={incidents}
                loading={loading}
                currentUid={profile.uid}
                currentName={displayName}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

    </div>
  )
}
