'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { Alarm, AlarmSeverity, Antenna, Cell, Incident, IncidentAssignee, Technology, UserProfile } from '@/types'
import {
  TECHS,
  relTime,
  sevColorVar,
  techColorVar,
  severityPalette,
  overallSeverity,
} from '@/lib/antenna-helpers'
import { SeverityBadge } from './SeverityBadge'
import { Button } from '@/components/ui/button'
import { acknowledgeAssignedIncidents, createIncidentForAlarm, getAlarmsForAntennaCell, getIncidentsForSite, updateIncidentAssignees } from '@/lib/firestore'
import { useAuth } from '@/components/AuthProvider'
import { canAssignEngineers, canCreateIncident } from '@/lib/roles'
import { AssignEngineersModal } from '@/components/admin/AssignEngineersModal'
import { MapPin } from 'lucide-react'

// Evaluated once at module load — safe to use in render (avoids react-hooks/purity violation)
const MODULE_NOW_MS = Date.now()

const SPRING: { type: 'spring'; stiffness: number; damping: number } = {
  type: 'spring',
  stiffness: 260,
  damping: 28,
}

const FADE: { duration: number } = { duration: 0.2 }

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

interface Props {
  antenna: Antenna
  allAntennas?: Antenna[]
  initialTech: Technology
  open: boolean
  onClose: () => void
}

type Tab = 'overview' | 'alarms' | 'incidents'
type SevFilter = 'ALL' | AlarmSeverity
type IncFilter = 'ALL' | 'MINE' | 'IN PROGRESS' | 'ASSIGNED' | 'RESOLVED' | 'CLOSED'

export function AntennaDetailsPanel({ antenna, allAntennas, initialTech, open, onClose }: Props) {
  const shouldReduce = useReducedMotion()
  const { profile } = useAuth()
  const canInc    = canCreateIncident(profile?.role)
  const canAssign = canAssignEngineers(profile?.role)

  const [activeTech, setActiveTech]         = useState<Technology>(initialTech)
  const [tab, setTab]                       = useState<Tab>('overview')
  const [alarmHistory, setAlarmHistory]     = useState<Alarm[]>([])
  const [incidents, setIncidents]           = useState<Incident[]>([])
  const [loadingAlarms, setLoadingAlarms]   = useState(false)
  const [loadingIncidents, setLoadingIncidents] = useState(false)
  const [acknowledged, setAcknowledged]       = useState(false)
  const [sevFilter, setSevFilter]             = useState<SevFilter>('ALL')
  const [incFilter, setIncFilter]             = useState<IncFilter>('ALL')
  const [creatingIncident, setCreatingIncident] = useState(false)
  const [incidentCreated, setIncidentCreated]   = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    void (async () => {
      setActiveTech(initialTech)
      setTab('overview')
      setAcknowledged(false)
      setSevFilter('ALL')
      setIncFilter('ALL')
      setCreatingIncident(false)
      setIncidentCreated(null)
    })()
  }, [open, initialTech])

  useEffect(() => {
    if (!open) return
    let cancelled = false

    void (async () => {
      setLoadingAlarms(true)
      setLoadingIncidents(true)

      const [alarms, incs] = await Promise.all([
        getAlarmsForAntennaCell(antenna.id, activeTech).catch(() => null),
        getIncidentsForSite(antenna.siteId).catch(() => null),
      ])

      if (cancelled) return
      setAlarmHistory(alarms ?? [])
      setLoadingAlarms(false)
      setIncidents(incs ?? [])
      setLoadingIncidents(false)
    })()

    return () => { cancelled = true }
  }, [open, activeTech, antenna.id, antenna.siteId])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const cell = antenna.cells.find(c => c.technology === activeTech) ?? null

  // Admins can acknowledge any assigned incident. Engineers only get their own.
  const acknowledgeableIncidents = incidents.filter(i =>
    i.status === 'ASSIGNED' &&
    (profile?.role === 'admin' || (i.assignees ?? []).some(a => a.uid === profile?.uid))
  )
  const canAck = acknowledged || acknowledgeableIncidents.length > 0

  async function handleAcknowledge() {
    if (acknowledged || acknowledgeableIncidents.length === 0) return
    try {
      const updated = await acknowledgeAssignedIncidents(
        acknowledgeableIncidents.map(i => i.incidentNumber),
      )
      if (updated.length > 0) {
        const updatedSet = new Set(updated)
        setIncidents(prev =>
          prev.map(i => updatedSet.has(i.incidentNumber) ? { ...i, status: 'IN PROGRESS' } : i)
        )
        setAcknowledged(true)
      }
    } catch {
      setAcknowledged(false)
    }
  }

  async function handleCreateIncident() {
    const alarm = cell?.currentAlarm
    if (!alarm || creatingIncident || incidentCreated) return
    setCreatingIncident(true)
    try {
      const id = await createIncidentForAlarm(alarm, antenna, allAntennas)
      setIncidentCreated(id)
      const updated = await getIncidentsForSite(antenna.siteId)
      setIncidents(updated)
    } finally {
      setCreatingIncident(false)
    }
  }

  const resolvedAlarms = alarmHistory.filter(a => a.resolved)

  const alarmTabCount    = (cell?.currentAlarm ? 1 : 0) + resolvedAlarms.length
  const incidentTabCount = incidents.filter(i => i.status !== 'CLOSED' && i.status !== 'RESOLVED').length

  const filteredAlarms = alarmHistory.filter(a => {
    if (sevFilter === 'ALL') return true
    return a.severity === sevFilter
  })

  const filteredIncidents = incidents.filter(i => {
    if (incFilter === 'ALL')  return true
    if (incFilter === 'MINE') return (i.assignees ?? []).some(a => a.uid === profile?.uid)
    return i.status === incFilter
  })

  async function handleUpdateAssignees(incidentNumber: string, assignees: IncidentAssignee[]) {
    await updateIncidentAssignees(incidentNumber, assignees)
    const updated = await getIncidentsForSite(antenna.siteId)
    setIncidents(updated)
  }

  const panelVariants = shouldReduce
    ? {}
    : {
        initial: { x: 500 },
        animate: { x: 0 },
        exit:    { x: 500 },
      }

  const backdropVariants = shouldReduce
    ? {}
    : {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit:    { opacity: 0 },
      }

  const techColor = `var(${techColorVar[activeTech]})`
  const overallSev = overallSeverity(antenna.cells)

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            {...backdropVariants}
            transition={FADE}
            onClick={onClose}
            className="fixed inset-0 backdrop-blur-[2px] z-[9998]"
            style={{ background: 'color-mix(in srgb, var(--bg-base) 50%, transparent)' }}
            aria-hidden
          />

          {/* Panel */}
          <motion.div
            key="panel"
            {...panelVariants}
            transition={shouldReduce ? { duration: 0 } : SPRING}
            role="dialog"
            aria-label={`${antenna.name} details`}
            style={{ width: 500, background: 'color-mix(in srgb, var(--bg-surface) 94%, transparent)', backdropFilter: 'blur(32px) saturate(260%)' }}
            className="
              fixed top-0 right-0 h-full z-[9999] flex flex-col
              border-l border-[var(--glass-border)]
              shadow-[var(--shadow-lg)]
            "
          >
            {/* ── Header ─────────────────────────────────────────────── */}
            <div className="shrink-0 border-b border-[var(--glass-border)]">
              {/* Row 1: siteId · provider + close */}
              <div className="flex items-center justify-between px-5 pt-4 pb-2">
                <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-[var(--text-muted)]">
                  {antenna.siteId} · {antenna.provider.toUpperCase()}
                </span>
                <button
                  onClick={onClose}
                  aria-label="Close panel"
                  className="
                    w-7 h-7 grid place-items-center rounded-[var(--radius-md)]
                    text-[var(--text-muted)] border border-transparent cursor-pointer
                    hover:text-[var(--text-primary)] hover:bg-[var(--glass-hover)] hover:border-[var(--glass-border)]
                    transition-colors duration-200
                  "
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              {/* Row 2: tech icon + antenna name + badges */}
              <div className="flex items-center gap-3 px-5 pb-3">
                <div
                  className="w-10 h-10 rounded-[var(--radius-md)] flex flex-col items-center justify-center shrink-0"
                  style={{
                    background: `color-mix(in srgb, ${techColor} 18%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${techColor} 33%, transparent)`,
                  }}
                >
                  <span
                    className="font-mono text-[13px] font-bold leading-none"
                    style={{ color: techColor }}
                  >
                    {activeTech}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[18px] font-semibold text-[var(--text-primary)] truncate leading-snug">
                    {antenna.name}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className="font-mono text-[11px] font-medium px-2 py-0.5 rounded-[var(--radius-full)]"
                      style={{
                        color: techColor,
                        background: `color-mix(in srgb, ${techColor} 14%, transparent)`,
                        border: `1px solid color-mix(in srgb, ${techColor} 28%, transparent)`,
                      }}
                    >
                      {activeTech}
                    </span>
                    <SeverityBadge severity={overallSev} />
                  </div>
                </div>
              </div>

              {/* Row 3: Tabs */}
              <div className="flex gap-0 px-5">
                {(['overview', ...(canAck || canInc ? ['alarms', 'incidents'] : [])] as Tab[]).map(t => {
                  const label =
                    t === 'alarms'    ? `Alarms (${alarmTabCount})` :
                    t === 'incidents' ? `Incidents (${incidentTabCount})` :
                    'Overview'
                  const isActive = tab === t
                  return (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className="
                        px-4 py-2.5 text-[13px] font-medium cursor-pointer
                        border-b-2 transition-colors duration-150
                      "
                      style={{
                        color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                        borderBottomColor: isActive ? 'var(--accent)' : 'transparent',
                      }}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* ── Cell switcher bar ──────────────────────────────────── */}
            <div className="shrink-0 flex gap-1.5 px-4 py-2 bg-[var(--glass-bg)]">
              {TECHS.map(t => {
                const c = antenna.cells.find(cell => cell.technology === t)
                const isActive   = activeTech === t
                const isDisabled = !c
                const tColor     = `var(${techColorVar[t]})`
                const sevVar     = c ? sevColorVar[c.status] : null

                return (
                  <button
                    key={t}
                    disabled={isDisabled}
                    onClick={() => {
                      if (!isDisabled) {
                        setActiveTech(t)
                        setTab('overview')
                        setAcknowledged(false)
                      }
                    }}
                    className="relative flex-1 flex flex-col items-center py-2 px-1 rounded-[var(--radius-md)] transition-all duration-150 cursor-pointer"
                    style={{
                      opacity: isDisabled ? 0.3 : 1,
                      cursor: isDisabled ? 'not-allowed' : 'pointer',
                      background:    isActive ? `color-mix(in srgb, ${tColor} 18%, transparent)` : 'var(--glass-bg)',
                      border:        isActive
                        ? `1px solid color-mix(in srgb, ${tColor} 33%, transparent)`
                        : '1px solid var(--glass-border)',
                    }}
                  >
                    {sevVar && (
                      <span
                        aria-hidden
                        className="absolute top-1 right-1 w-[5px] h-[5px] rounded-full"
                        style={{
                          background: `var(${sevVar})`,
                          boxShadow:  `0 0 6px var(${sevVar})`,
                        }}
                      />
                    )}
                    <span
                      className="font-mono text-[11px] font-medium leading-none"
                      style={{ color: isActive ? tColor : 'var(--text-secondary)' }}
                    >
                      {t}
                    </span>
                    <span className="font-mono text-[8px] uppercase tracking-widest text-[var(--text-muted)] mt-0.5 leading-none">
                      {isDisabled ? 'N/A' : c?.status === 'ok' ? 'OK' : c?.status?.toUpperCase()}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* ── Scrollable body ───────────────────────────────────── */}
            <div key={`${activeTech}-${tab}`} className="flex-1 overflow-y-auto px-6 py-5 pb-8">
              {tab === 'overview' && (
                <OverviewTab
                  antenna={antenna}
                  cell={cell}
                  activeTech={activeTech}
                  alarmHistory={alarmHistory}
                  incidents={incidents}
                  loading={loadingAlarms}
                />
              )}
              {tab === 'alarms' && (
                <AlarmsTab
                  loading={loadingAlarms}
                  filteredAlarms={filteredAlarms}
                  sevFilter={sevFilter}
                  setSevFilter={setSevFilter}
                />
              )}
              {tab === 'incidents' && (
                <IncidentsTab
                  loading={loadingIncidents}
                  filteredIncidents={filteredIncidents}
                  incFilter={incFilter}
                  setIncFilter={setIncFilter}
                  profile={profile}
                  canAssign={canAssign}
                  onUpdateAssignees={handleUpdateAssignees}
                />
              )}
            </div>

            {/* ── Footer ───────────────────────────────────────────── */}
            {(canAck || canInc) && (
              <div className="shrink-0 flex gap-2 px-6 py-3 border-t border-[var(--glass-border)] bg-[var(--glass-bg)]">
                {canAck && (
                  <Button
                    onClick={handleAcknowledge}
                    className={`
                      flex-1 justify-center gap-1.5 text-[13px] font-medium
                      rounded-[var(--radius-md)] transition-all duration-200
                      ${acknowledged
                        ? 'bg-[var(--alarm-ok)] hover:bg-[var(--alarm-ok)] text-[var(--text-inverse)]'
                        : 'bg-[var(--accent)] hover:bg-[var(--accent-bright)] text-white shadow-[var(--shadow-glow)]'}
                    `}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {acknowledged ? 'Acknowledged' : 'Acknowledge'}
                  </Button>
                )}
                {canInc && (
                  <Button
                    variant="outline"
                    disabled={!cell?.currentAlarm || creatingIncident || !!incidentCreated}
                    onClick={handleCreateIncident}
                    className="
                      text-[13px] rounded-[var(--radius-md)]
                      bg-[var(--glass-bg)] hover:bg-[var(--glass-hover)]
                      border-[var(--glass-border)] hover:border-[var(--border-strong)]
                      text-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed
                    "
                  >
                    {incidentCreated
                      ? `Created ${incidentCreated}`
                      : creatingIncident
                        ? 'Creating…'
                        : 'Create incident'}
                  </Button>
                )}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

/* ─────────────────────── Sub-components ─────────────────────── */

function SectionLabel({ left, right }: { left: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-2.5 text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--text-secondary)]">
      <span>{left}</span>
      {right != null && (
        <span className="font-mono text-[10px] tracking-[0.08em] text-[var(--text-muted)]">{right}</span>
      )}
    </div>
  )
}

/* ─── PanelAlarmCard ─── */
interface PanelAlarmCardProps {
  alarm: Alarm
  resolved?: boolean
}

function PanelAlarmCard({ alarm, resolved = false }: PanelAlarmCardProps) {
  const p = severityPalette[alarm.severity]
  const isActive = !resolved && !alarm.resolved

  return (
    <div
      className="rounded-[var(--radius-md)] p-3"
      style={{
        background: 'var(--glass-bg)',
        border: `1px solid var(--glass-border)`,
        borderLeft: `2px solid ${p.text}`,
      }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <SeverityBadge severity={alarm.severity} />
        <span className="font-mono text-[10px] text-[var(--text-muted)]">#{alarm.alarmNumber}</span>
        {(alarm.resolved || resolved) && (
          <span
            style={{
              background: 'rgba(52,211,153,0.12)',
              border: '1px solid rgba(52,211,153,0.3)',
              color: 'var(--alarm-ok)',
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              fontWeight: 500,
              letterSpacing: '0.06em',
              padding: '1px 6px',
              borderRadius: 'var(--radius-full)',
              textTransform: 'uppercase' as const,
            }}
          >
            RESOLVED
          </span>
        )}
      </div>
      <p
        className="text-[13px] leading-snug mb-2"
        style={{ color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)' }}
      >
        {alarm.text}
      </p>
      <div className="flex items-center gap-3 text-[11px] font-mono text-[var(--text-muted)]">
        <span>{relTime(alarm.alarmTime)}</span>
        <span>{new Date(alarm.alarmTime).toISOString().replace('T', ' ').slice(0, 19)} UTC</span>
        {alarm.durationMs != null ? (
          <span>Duration: {formatDuration(alarm.durationMs)}</span>
        ) : isActive ? (
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ background: 'var(--alarm-critical)' }}
            />
            Active
          </span>
        ) : null}
      </div>
    </div>
  )
}

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ${minutes % 60}m`
  return `${Math.floor(hours / 24)}d ${hours % 24}h`
}

/* ─── Overview Tab ─── */
interface OverviewTabProps {
  antenna: Antenna
  cell: Cell | null
  activeTech: Technology
  alarmHistory: Alarm[]
  incidents: Incident[]
  loading: boolean
}

function OverviewTab({ antenna, cell, activeTech, alarmHistory, incidents, loading }: OverviewTabProps) {
  const openIncidents  = incidents.filter(i => i.status !== 'CLOSED' && i.status !== 'RESOLVED').length
  const past7d         = alarmHistory.filter(a => {
    const ms = MODULE_NOW_MS - new Date(a.alarmTime).getTime()
    return ms <= 7 * 24 * 60 * 60 * 1000
  }).length
  const activeCount = cell?.currentAlarm ? 1 : 0

  return (
    <div className="flex flex-col gap-5">
      {/* Current alarm */}
      <div>
        <SectionLabel left="Current alarm" />
        {loading ? (
          <LoadingRow />
        ) : cell?.currentAlarm ? (
          <PanelAlarmCard alarm={cell.currentAlarm} />
        ) : (
          <NominalState tech={activeTech} />
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Active alarms" value={activeCount} color="var(--alarm-critical)" />
        <StatCard label="Past 7d alarms" value={past7d} color="var(--alarm-warning)" />
        <StatCard label="Open incidents" value={openIncidents} color="var(--accent)" />
      </div>

      {/* Metadata */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 pt-4 border-t border-[var(--glass-border)]">
        <MetaItem k="Technology"  v={activeTech} />
        <MetaItem k="Status"      v={cell?.status ?? 'N/A'} mono={false} />
        
        <div className="col-span-2 pt-2">
          <a 
            href={`https://www.google.com/maps/search/?api=1&query=${antenna.latitude},${antenna.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-[var(--radius-md)] bg-[var(--accent)] text-white hover:bg-[var(--accent-bright)] transition-all shadow-[var(--shadow-glow)] text-[11px] font-bold uppercase tracking-widest"
          >
            <MapPin className="size-4" />
            Google Maps
          </a>
        </div>

        <MetaItem k="Site ID"     v={antenna.siteId} />
        <MetaItem k="Provider"    v={antenna.provider} mono={false} />
      </div>
    </div>
  )
}

/* ─── Alarms Tab ─── */
const SEV_FILTERS: SevFilter[] = ['ALL', 'critical', 'major', 'minor', 'warning']

interface AlarmsTabProps {
  loading: boolean
  filteredAlarms: Alarm[]
  sevFilter: SevFilter
  setSevFilter: (f: SevFilter) => void
}

function AlarmsTab({ loading, filteredAlarms, sevFilter, setSevFilter }: AlarmsTabProps) {
  const filteredActive   = filteredAlarms.filter(a => !a.resolved)
  const filteredResolved = filteredAlarms.filter(a => a.resolved)

  return (
    <div className="flex flex-col gap-4">
      {/* Filter row */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-1.5 flex-wrap">
          {SEV_FILTERS.map(f => {
            const isActive = sevFilter === f
            const p = f !== 'ALL' ? severityPalette[f] : null
            return (
              <motion.button
                key={f}
                whileTap={{ scale: 0.96 }}
                onClick={() => setSevFilter(f)}
                className="text-[11px] font-medium uppercase tracking-widest px-3 py-1.5 rounded-[var(--radius-md)] border transition-all duration-150 cursor-pointer"
                style={
                  isActive && p
                    ? { background: p.bg, borderColor: p.border, color: p.text }
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
        <span className="font-mono text-[11px] text-[var(--text-muted)] shrink-0">
          {filteredAlarms.length} alarm{filteredAlarms.length !== 1 ? 's' : ''}
        </span>
      </div>

      {loading && <LoadingRow />}

      {!loading && (
        <>
          {/* Active */}
          {filteredActive.length > 0 && (
            <div>
              <SectionLabel left="Active" right="now" />
              <div className="flex flex-col gap-2">
                {filteredActive.map(a => <PanelAlarmCard key={a.id} alarm={a} />)}
              </div>
            </div>
          )}

          {/* History */}
          {filteredResolved.length > 0 && (
            <div>
              <SectionLabel left="History" right={`${filteredResolved.length} resolved`} />
              <div className="relative pl-4">
                <div className="absolute left-[3px] top-2 bottom-2 w-px bg-[var(--glass-border)]" />
                <div className="flex flex-col gap-3">
                  {filteredResolved.map(a => {
                    const p = severityPalette[a.severity]
                    return (
                      <div key={a.id} className="flex gap-3 items-start">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0 mt-3"
                          style={{
                            background: p.text,
                            boxShadow: `0 0 6px ${p.text}`,
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <PanelAlarmCard alarm={a} resolved />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {filteredAlarms.length === 0 && (
            <EmptyDashed text={sevFilter === 'ALL' ? 'No alarms for this cell.' : `No ${sevFilter} alarms.`} />
          )}
        </>
      )}
    </div>
  )
}

/* ─── Incidents Tab ─── */
const STATUS_FILTERS: IncFilter[] = ['ALL', 'IN PROGRESS', 'ASSIGNED', 'RESOLVED', 'CLOSED']

interface IncidentsTabProps {
  loading: boolean
  filteredIncidents: Incident[]
  incFilter: IncFilter
  setIncFilter: (f: IncFilter) => void
  profile: UserProfile | null
  canAssign: boolean
  onUpdateAssignees: (incidentNumber: string, assignees: IncidentAssignee[]) => Promise<void>
}

function IncidentsTab({
  loading, filteredIncidents, incFilter, setIncFilter,
  profile, canAssign, onUpdateAssignees,
}: IncidentsTabProps) {
  const isEngineerOrAdmin = profile?.role === 'engineer' || profile?.role === 'admin'
  const [assigningInc, setAssigningInc] = useState<Incident | null>(null)

  const allFilters: IncFilter[] = isEngineerOrAdmin
    ? ['ALL', 'MINE', ...STATUS_FILTERS.slice(1)]
    : STATUS_FILTERS

  return (
    <>
      <div className="flex flex-col gap-4">
        {/* Filter row */}
        <div className="flex gap-1.5 flex-wrap">
          {allFilters.map(f => {
            const isActive = incFilter === f
            const color    = INC_STATUS_COLOR[f]
            const isMine   = f === 'MINE'
            return (
              <motion.button
                key={f}
                whileTap={{ scale: 0.96 }}
                onClick={() => setIncFilter(f)}
                className="text-[11px] font-medium uppercase tracking-widest px-3 py-1.5 rounded-[var(--radius-md)] border transition-all duration-150 cursor-pointer"
                style={
                  isActive && isMine
                    ? { background: 'var(--accent-dim)', borderColor: 'var(--border-accent)', color: 'var(--accent-bright)' }
                    : isActive && color
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

        {loading && <LoadingRow />}

        {!loading && filteredIncidents.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <span className="text-[28px] text-[var(--alarm-ok)]">✓</span>
            <span className="text-[14px] text-[var(--text-secondary)]">No incidents</span>
            {incFilter !== 'ALL' && (
              <span className="text-[12px] text-[var(--text-muted)]">Try changing the filter above</span>
            )}
          </div>
        )}

        {!loading && filteredIncidents.length > 0 && (
          <div className="flex flex-col gap-2.5">
            {filteredIncidents.map(inc => {
              const assignees     = inc.assignees ?? []
              const displayStatus = (inc.status === 'ASSIGNED' && assignees.length === 0) ? 'UNASSIGNED' : inc.status
              const statusColor   = displayStatus === 'UNASSIGNED'
                ? 'var(--text-muted)'
                : (INC_STATUS_COLOR[inc.status] ?? 'var(--text-muted)')
              const priorityColor = INC_PRIO_COLOR[inc.priority] ?? 'var(--text-secondary)'
              const iAmAssigned   = assignees.some(a => a.uid === profile?.uid)

              return (
                <div
                  key={inc.incidentNumber}
                  className="rounded-[var(--radius-md)] overflow-hidden"
                  style={{
                    background:  'var(--glass-bg)',
                    border:      '1px solid var(--glass-border)',
                    borderLeft:  `2px solid ${statusColor}`,
                  }}
                >
                  <div className="p-3">
                    {/* Top row */}
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-[12px] font-bold text-[var(--text-primary)]">
                          {inc.incidentNumber}
                        </span>
                        {iAmAssigned && (
                          <span
                            className="font-mono text-[8px] font-semibold uppercase tracking-widest px-1.5 py-0.5 rounded-[var(--radius-full)]"
                            style={{ color: 'var(--accent-bright)', background: 'var(--accent-dim)', border: '1px solid var(--border-accent)' }}
                          >
                            You
                          </span>
                        )}
                      </div>
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
                    </div>

                    <p className="text-[13px] text-[var(--text-secondary)] mb-2 leading-snug">
                      {inc.impact}
                    </p>

                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      {(inc.siteIds?.length ? inc.siteIds : [inc.siteId]).map(s => (
                        <span key={s} className="font-mono text-[9px] text-[var(--text-muted)] px-1.5 py-0.5 rounded-[var(--radius-full)] border border-[var(--glass-border)] bg-[var(--bg-subtle)]">{s}</span>
                      ))}
                      {(inc.technologies?.length ? inc.technologies : [inc.technology]).map(t => (
                        <span key={t} className="font-mono text-[9px] font-semibold uppercase tracking-widest px-1.5 py-0.5 rounded-[var(--radius-full)]" style={{ color: 'var(--accent-bright)', background: 'var(--accent-dim)', border: '1px solid var(--border-accent)' }}>{t}</span>
                      ))}
                    </div>

                    <div className="flex items-center gap-3 text-[11px] font-mono">
                      <span className="text-[var(--text-muted)]">{relTime(inc.submitDate)}</span>
                      <span style={{ color: priorityColor }}>{inc.priority}</span>
                    </div>

                    {/* Assignee strip */}
                    <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-[var(--glass-border)]">
                      <div className="flex items-center gap-1 flex-1 min-w-0">
                        {assignees.length === 0 ? (
                          <span className="text-[10px] font-mono text-[var(--text-muted)] italic">
                            No engineers assigned
                          </span>
                        ) : (
                          <div className="flex items-center -space-x-1.5">
                            {assignees.slice(0, 4).map((a, i) => {
                              const isMe     = a.uid === profile?.uid
                              const label    = a.displayName ?? a.email.split('@')[0]
                              const initials = label.slice(0, 2).toUpperCase()
                              return (
                                <div
                                  key={a.uid}
                                  title={isMe ? `${a.email} (you)` : a.email}
                                  className="w-6 h-6 rounded-full flex items-center justify-center font-mono text-[9px] font-bold ring-2 ring-[var(--bg-overlay)]"
                                  style={{
                                    background: isMe
                                      ? 'color-mix(in srgb, var(--accent) 22%, var(--bg-subtle))'
                                      : 'color-mix(in srgb, var(--alarm-ok) 15%, var(--bg-subtle))',
                                    color:  isMe ? 'var(--accent-bright)' : 'var(--alarm-ok)',
                                    border: `1px solid ${isMe ? 'var(--border-accent)' : 'rgba(52,211,153,0.3)'}`,
                                    zIndex: assignees.length - i,
                                  }}
                                >
                                  {initials}
                                </div>
                              )
                            })}
                            {assignees.length > 4 && (
                              <div
                                className="w-6 h-6 rounded-full flex items-center justify-center font-mono text-[8px] font-bold ring-2 ring-[var(--bg-overlay)]"
                                style={{ background: 'var(--bg-subtle)', color: 'var(--text-muted)', border: '1px solid var(--glass-border)' }}
                              >
                                +{assignees.length - 4}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {canAssign && (
                        <motion.button
                          whileTap={{ scale: 0.95 }}
                          onClick={() => setAssigningInc(inc)}
                          className="
                            shrink-0 flex items-center gap-1.5
                            text-[10px] font-medium uppercase tracking-widest px-2.5 py-1
                            rounded-[var(--radius-md)] border transition-colors duration-150 cursor-pointer ml-2
                            border-[var(--glass-border)] bg-[var(--glass-bg)]
                            text-[var(--text-secondary)] hover:text-[var(--text-primary)]
                            hover:bg-[var(--glass-hover)] hover:border-[var(--border-strong)]
                          "
                        >
                          <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                            <circle cx="4.5" cy="2.5" r="1.8" stroke="currentColor" strokeWidth="1.1" />
                            <path d="M1 8c0-1.9 1.6-3.5 3.5-3.5S8 6.1 8 8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
                          </svg>
                          Assign
                        </motion.button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <AssignEngineersModal
        incident={assigningInc}
        open={assigningInc !== null}
        onClose={() => setAssigningInc(null)}
        onSave={onUpdateAssignees}
      />
    </>
  )
}

/* ─── Shared small components ─── */

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      className="rounded-[var(--radius-md)] p-3 flex flex-col gap-1"
      style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}
    >
      <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--text-muted)] leading-none">
        {label}
      </span>
      <span className="text-[22px] font-semibold leading-none mt-1" style={{ color }}>
        {value}
      </span>
    </div>
  )
}

function MetaItem({ k, v, mono = true }: { k: string; v: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--text-muted)] mb-0.5">
        {k}
      </div>
      <div className={`text-[12px] text-[var(--text-primary)] ${mono ? 'font-mono' : ''}`}>{v}</div>
    </div>
  )
}

function NominalState({ tech }: { tech: Technology }) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg)]">
      <span
        aria-hidden
        className="w-2 h-2 rounded-full shrink-0"
        style={{ background: 'var(--alarm-ok)', boxShadow: '0 0 8px var(--alarm-ok)' }}
      />
      <span className="text-[13px] text-[var(--text-secondary)]">
        {tech} cell nominal — no active alarm
      </span>
    </div>
  )
}

function EmptyDashed({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center py-8 rounded-[var(--radius-md)] border border-dashed border-[var(--glass-border)] text-[13px] text-[var(--text-muted)]">
      {text}
    </div>
  )
}

function LoadingRow() {
  return (
    <div className="flex items-center gap-2 text-[13px] text-[var(--text-muted)] animate-pulse py-4">
      <span className="w-2 h-2 rounded-full bg-[var(--text-muted)] animate-pulse" />
      Loading…
    </div>
  )
}
