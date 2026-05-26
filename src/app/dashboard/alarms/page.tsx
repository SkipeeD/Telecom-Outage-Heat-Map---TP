'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { incidentMatchesAlarm, getAntennas } from '@/lib/firestore'
import { useAuth } from '@/components/AuthProvider'
import type { Antenna, AlarmSeverity, Alarm, DashboardSummary, Incident } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import {
  Activity, ShieldAlert, CheckCircle2, Clock, ArrowLeft, Map,
  Clock3, Users, ChevronDown, ChevronUp, RefreshCw,
} from 'lucide-react'
import { sevColorVar, relTime, formatDuration } from '@/lib/antenna-helpers'
import { cn } from '@/lib/utils'
import { cityForAntenna } from '@/lib/weather-cities'

const EASE: [number, number, number, number] = [0.4, 0, 0.2, 1]

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.07, delayChildren: 0.05 },
  },
}
const itemVariants = {
  hidden: { opacity: 0, y: 14, filter: 'blur(6px)' },
  visible: {
    opacity: 1, y: 0, filter: 'blur(0px)',
    transition: { duration: 0.4, ease: EASE },
  },
}

function getCSSVar(name: string) {
  if (typeof window === 'undefined') return ''
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

const severityRank: Record<AlarmSeverity, number> = {
  critical: 5, major: 4, minor: 3, warning: 2, ok: 1,
}

type SeverityFilter = 'all' | AlarmSeverity

export default function AlarmsPage() {
  const { user } = useAuth()
  const router = useRouter()

  const [antennas, setAntennas] = useState<Antenna[]>([])
  const [longLivedAlarms, setLongLivedAlarms] = useState<Alarm[]>([])
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const [chronicFilter, setChronicFilter] = useState<SeverityFilter>('all')
  const [liveFilter, setLiveFilter] = useState<SeverityFilter>('all')
  const [chronicExpanded, setChronicExpanded] = useState(true)
  const [liveExpanded, setLiveExpanded] = useState(true)

  useEffect(() => {
    if (!user) return
    let cancelled = false

    const fetchData = async () => {
      try {
        const [{ antennas: antennasData }, idToken] = await Promise.all([
          getAntennas(),
          user.getIdToken(),
        ])
        if (cancelled) return
        setAntennas(antennasData)

        const res = await fetch('/api/dashboard/summary', {
          headers: { Authorization: `Bearer ${idToken}` },
        })
        if (!res.ok || cancelled) return
        const summary = await res.json() as DashboardSummary
        if (cancelled) return
        setLongLivedAlarms(summary.longLivedAlarms)
        setIncidents(summary.incidents)
        setLastUpdated(new Date())
      } catch {
        // keep stale data on error
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void fetchData()
    const id = setInterval(() => { void fetchData() }, 30_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [user, refreshKey])

  /* ── Live alerts (all active) ── */
  const allActiveAlerts = useMemo(() =>
    antennas
      .flatMap(a => (a.cells || [])
        .filter(c => c.currentAlarm && !c.currentAlarm.resolved)
        .map(c => {
          const alarm = c.currentAlarm!
          const incident = incidents.find(i => incidentMatchesAlarm(i, alarm))
          const city = cityForAntenna(a.latitude, a.longitude)
          return { ...alarm, antennaName: a.name, incident, city }
        })
      )
      .sort((a, b) =>
        severityRank[b.severity] - severityRank[a.severity] ||
        new Date(b.alarmTime).getTime() - new Date(a.alarmTime).getTime()
      ),
  [antennas, incidents])

  const filteredLive = useMemo(() =>
    liveFilter === 'all' ? allActiveAlerts : allActiveAlerts.filter(a => a.severity === liveFilter),
  [allActiveAlerts, liveFilter])

  const filteredChronic = useMemo(() =>
    chronicFilter === 'all' ? longLivedAlarms : longLivedAlarms.filter(a => a.severity === chronicFilter),
  [longLivedAlarms, chronicFilter])

  const liveCounts = useMemo(() => {
    const c: Record<SeverityFilter, number> = { all: allActiveAlerts.length, critical: 0, major: 0, minor: 0, warning: 0, ok: 0 }
    allActiveAlerts.forEach(a => { c[a.severity]++ })
    return c
  }, [allActiveAlerts])

  const chronicCounts = useMemo(() => {
    const c: Record<SeverityFilter, number> = { all: longLivedAlarms.length, critical: 0, major: 0, minor: 0, warning: 0, ok: 0 }
    longLivedAlarms.forEach(a => { c[a.severity as SeverityFilter]++ })
    return c
  }, [longLivedAlarms])

  const severityFilters: SeverityFilter[] = ['all', 'critical', 'major', 'minor', 'warning']

  return (
    <div className="min-h-full bg-[var(--bg-base)] p-6 md:p-8 transition-colors duration-300">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="max-w-7xl mx-auto space-y-8"
      >
        {/* ── Header ── */}
        <motion.div variants={itemVariants} className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3 mb-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push('/dashboard')}
                className="h-8 gap-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-hover)] text-[12px] rounded-[var(--radius-md)]"
              >
                <ArrowLeft className="size-3.5" />
                Dashboard
              </Button>
            </div>
            <h1 className="text-[28px] font-semibold text-[var(--text-primary)]">Alarm Centre</h1>
            <p className="text-[14px] text-[var(--text-secondary)]">
              Chronic alarms &amp; live network alerts — full view.
            </p>
          </div>

          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {lastUpdated && (
              <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-widest">
                Updated {relTime(lastUpdated.toISOString())}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setLoading(true); setRefreshKey(k => k + 1) }}
              className="h-8 gap-1.5 bg-[var(--glass-bg)] border-[var(--glass-border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-[11px] rounded-[var(--radius-md)] uppercase tracking-widest"
            >
              <RefreshCw className="size-3" />
              Refresh
            </Button>
            <Button
              onClick={() => router.push('/map')}
              className="h-8 gap-1.5 flex items-center bg-[var(--accent)] hover:bg-[var(--accent-bright)] text-white text-[12px] font-medium rounded-[var(--radius-md)] shadow-[var(--shadow-glow)] transition-all duration-200 uppercase tracking-widest"
            >
              <Map className="size-3.5" />
              Go to Map
            </Button>
          </div>
        </motion.div>

        {/* ── Summary pills ── */}
        <motion.div variants={itemVariants} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Live Alerts',  value: allActiveAlerts.length,                                           color: '--alarm-critical', icon: Activity    },
            { label: 'Chronic',      value: longLivedAlarms.length,                                           color: '--alarm-major',    icon: Clock3      },
            { label: 'Critical',     value: allActiveAlerts.filter(a => a.severity === 'critical').length,    color: '--alarm-critical', icon: ShieldAlert },
            { label: 'Major',        value: allActiveAlerts.filter(a => a.severity === 'major').length,       color: '--alarm-major',    icon: ShieldAlert },
          ].map(({ label, value, color, icon: Icon }) => (
            <Card key={label} className="bg-[var(--glass-bg)] backdrop-blur-xl border-[var(--glass-border)] shadow-[var(--shadow-md)]">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-medium text-[var(--text-secondary)] uppercase tracking-widest">{label}</span>
                  <Icon className="size-3.5" style={{ color: `var(${color})` }} />
                </div>
                <div className="text-2xl font-bold font-mono" style={{ color: value > 0 ? `var(${color})` : 'var(--text-muted)' }}>
                  {loading ? '–' : value}
                </div>
              </CardContent>
            </Card>
          ))}
        </motion.div>

        {/* ── Chronic Alarms ── */}
        <motion.div variants={itemVariants}>
          <Card className="bg-[var(--glass-bg)] backdrop-blur-xl border-[var(--glass-border)] shadow-[var(--shadow-md)]">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div className="flex flex-col gap-1">
                <CardTitle className="text-[13px] font-medium text-[var(--text-primary)] uppercase tracking-widest flex items-center gap-2">
                  <Clock className="size-4 text-[var(--alarm-major)]" />
                  Chronic Alarms
                  {!loading && (
                    <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-[rgba(245,158,11,0.12)] text-[var(--alarm-major)] border border-[rgba(245,158,11,0.3)]">
                      {filteredChronic.length}
                    </span>
                  )}
                </CardTitle>
                <p className="text-[10px] text-[var(--text-muted)]">Resolved alarms active for more than 24 hours</p>
              </div>
              <button
                onClick={() => setChronicExpanded(v => !v)}
                className="size-7 grid place-items-center rounded-[var(--radius-md)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-hover)] transition-colors"
              >
                {chronicExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
              </button>
            </CardHeader>

            <AnimatePresence initial={false}>
              {chronicExpanded && (
                <motion.div
                  key="chronic-body"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25, ease: EASE }}
                  className="overflow-hidden"
                >
                  <CardContent className="pt-0">
                    <div className="flex items-center gap-2 mb-4 flex-wrap">
                      {severityFilters.map(f => (
                        <motion.button
                          key={f}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => setChronicFilter(f)}
                          className={cn(
                            'text-[10px] font-medium uppercase tracking-widest px-2.5 py-1 rounded-[var(--radius-md)] border transition-all duration-150',
                            chronicFilter === f
                              ? 'bg-[var(--accent-dim)] border-[var(--border-accent)] text-[var(--accent-bright)]'
                              : 'bg-[var(--glass-bg)] border-[var(--glass-border)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]',
                          )}
                        >
                          {f === 'all' ? `All (${chronicCounts.all})` : `${f} (${chronicCounts[f]})`}
                        </motion.button>
                      ))}
                    </div>

                    {loading ? (
                      <div className="py-10 flex items-center justify-center gap-2 text-[11px] font-mono text-[var(--text-muted)] uppercase tracking-widest animate-pulse">
                        <Activity className="size-3.5" />
                        Loading alarms…
                      </div>
                    ) : filteredChronic.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-[11px] font-mono">
                          <thead>
                            <tr className="text-[var(--text-muted)] uppercase tracking-widest text-[9px] border-b border-[var(--glass-border)]">
                              <th className="text-left pb-2 pr-4">Site</th>
                              <th className="text-left pb-2 pr-4">Tech</th>
                              <th className="text-left pb-2 pr-4">Severity</th>
                              <th className="text-left pb-2 pr-4">Alarm</th>
                              <th className="text-left pb-2 pr-4">Started</th>
                              <th className="text-right pb-2">Duration</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredChronic.map((alarm) => {
                              const ms = alarm.durationMs ?? 0
                              const durationColor =
                                ms >= 3 * 24 * 60 * 60_000 ? 'var(--alarm-critical)'
                                : ms >= 24 * 60 * 60_000    ? 'var(--alarm-major)'
                                : 'var(--text-secondary)'
                              return (
                                <tr key={alarm.id} className="border-b border-[var(--glass-border)] last:border-0 hover:bg-[var(--glass-hover)] transition-colors">
                                  <td className="py-2.5 pr-4 text-[var(--text-primary)]">{alarm.siteId}</td>
                                  <td className="py-2.5 pr-4 text-[var(--text-secondary)]">{alarm.technology}</td>
                                  <td className="py-2.5 pr-4">
                                    <span className="px-1.5 py-0.5 rounded text-[9px] uppercase tracking-widest font-bold"
                                      style={{ color: getCSSVar(sevColorVar[alarm.severity]), background: `${getCSSVar(sevColorVar[alarm.severity])}22` }}>
                                      {alarm.severity}
                                    </span>
                                  </td>
                                  <td className="py-2.5 pr-4 text-[var(--text-muted)] max-w-[300px] truncate">{alarm.text}</td>
                                  <td className="py-2.5 pr-4 text-[var(--text-muted)] whitespace-nowrap">{relTime(alarm.alarmTime)}</td>
                                  <td className="py-2.5 text-right font-bold whitespace-nowrap" style={{ color: durationColor }}>
                                    {formatDuration(ms)}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="py-10 text-center">
                        <CheckCircle2 className="size-8 text-[var(--alarm-ok)] mx-auto mb-3 opacity-20" />
                        <p className="text-[12px] text-[var(--text-muted)] font-mono uppercase tracking-widest">
                          {chronicFilter === 'all' ? 'No chronic alarms' : `No ${chronicFilter} chronic alarms`}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </motion.div>
              )}
            </AnimatePresence>
          </Card>
        </motion.div>

        {/* ── Live Network Alerts ── */}
        <motion.div variants={itemVariants}>
          <Card className="bg-[var(--glass-bg)] backdrop-blur-xl border-[var(--glass-border)] shadow-[var(--shadow-md)]">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div className="flex flex-col gap-1">
                <CardTitle className="text-[13px] font-medium text-[var(--text-primary)] uppercase tracking-widest flex items-center gap-2">
                  <Activity className="size-4 text-[var(--alarm-critical)] animate-pulse" />
                  Live Network Alerts
                  {!loading && (
                    <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-[rgba(240,79,79,0.12)] text-[var(--alarm-critical)] border border-[rgba(240,79,79,0.3)]">
                      {filteredLive.length}
                    </span>
                  )}
                </CardTitle>
                <p className="text-[10px] text-[var(--text-muted)]">All active unresolved alarms across the network</p>
              </div>
              <button
                onClick={() => setLiveExpanded(v => !v)}
                className="size-7 grid place-items-center rounded-[var(--radius-md)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-hover)] transition-colors"
              >
                {liveExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
              </button>
            </CardHeader>

            <AnimatePresence initial={false}>
              {liveExpanded && (
                <motion.div
                  key="live-body"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25, ease: EASE }}
                  className="overflow-hidden"
                >
                  <CardContent className="pt-0">
                    <div className="flex items-center gap-2 mb-4 flex-wrap">
                      {severityFilters.map(f => (
                        <motion.button
                          key={f}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => setLiveFilter(f)}
                          className={cn(
                            'text-[10px] font-medium uppercase tracking-widest px-2.5 py-1 rounded-[var(--radius-md)] border transition-all duration-150',
                            liveFilter === f
                              ? 'bg-[var(--accent-dim)] border-[var(--border-accent)] text-[var(--accent-bright)]'
                              : 'bg-[var(--glass-bg)] border-[var(--glass-border)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]',
                          )}
                        >
                          {f === 'all' ? `All (${liveCounts.all})` : `${f} (${liveCounts[f]})`}
                        </motion.button>
                      ))}
                    </div>

                    {loading ? (
                      <div className="py-10 flex items-center justify-center gap-2 text-[11px] font-mono text-[var(--text-muted)] uppercase tracking-widest animate-pulse">
                        <Activity className="size-3.5" />
                        Loading alerts…
                      </div>
                    ) : filteredLive.length > 0 ? (
                      <div className="space-y-2">
                        {filteredLive.map((alarm) => {
                          const assignees = alarm.incident?.assignees ?? []
                          return (
                            <div key={alarm.id} className="flex items-center justify-between py-3 px-3 rounded-[var(--radius-md)] border border-[var(--glass-border)] hover:border-[var(--border-strong)] hover:bg-[var(--glass-hover)] transition-all">
                              <div className="flex items-center gap-4 min-w-0">
                                <div className="size-2 rounded-full shrink-0 animate-pulse"
                                  style={{ backgroundColor: getCSSVar(sevColorVar[alarm.severity]) }} />
                                <div className="flex flex-col min-w-0">
                                  <span className="text-[13px] font-semibold text-[var(--text-primary)] truncate">{alarm.antennaName}</span>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[10px] font-mono text-[var(--text-muted)]">{alarm.siteId}</span>
                                    <span className="text-[10px] text-[var(--text-muted)]">·</span>
                                    <span className="text-[10px] font-mono text-[var(--text-muted)]">{alarm.technology}</span>
                                    {alarm.city && (
                                      <>
                                        <span className="text-[10px] text-[var(--text-muted)]">·</span>
                                        <span className="text-[10px] font-mono text-[var(--text-muted)]">{alarm.city}</span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-4 shrink-0 ml-4">
                                <div className="hidden lg:flex flex-col items-end max-w-[260px]">
                                  <span className="text-[11px] text-[var(--text-primary)] truncate text-right w-full">{alarm.text}</span>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <Clock3 className="size-3 text-[var(--text-muted)]" />
                                    <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-tighter">{relTime(alarm.alarmTime)}</span>
                                  </div>
                                </div>

                                <div className="hidden md:flex items-center gap-1.5">
                                  <Users className="size-3 text-[var(--alarm-ok)]" />
                                  {assignees.length === 0 ? (
                                    <span className="text-[10px] font-mono text-[var(--text-muted)] italic">Unassigned</span>
                                  ) : (
                                    <div className="flex items-center -space-x-1.5">
                                      {assignees.slice(0, 4).map((a, idx) => {
                                        const label = a.displayName ?? a.email.split('@')[0]
                                        const initials = label.slice(0, 2).toUpperCase()
                                        return (
                                          <div key={a.uid} title={a.email}
                                            className="w-6 h-6 rounded-full flex items-center justify-center font-mono text-[9px] font-bold ring-2 ring-[var(--bg-base)]"
                                            style={{ background: 'color-mix(in srgb, var(--alarm-ok) 15%, var(--bg-subtle))', color: 'var(--alarm-ok)', border: '1px solid rgba(52,211,153,0.3)', zIndex: assignees.length - idx }}>
                                            {initials}
                                          </div>
                                        )
                                      })}
                                      {assignees.length > 4 && (
                                        <div className="w-6 h-6 rounded-full flex items-center justify-center font-mono text-[8px] font-bold ring-2 ring-[var(--bg-base)]"
                                          style={{ background: 'var(--bg-subtle)', color: 'var(--text-muted)', border: '1px solid var(--glass-border)' }}>
                                          +{assignees.length - 4}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>

                                <div className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest min-w-[76px] text-center"
                                  style={{ backgroundColor: `${getCSSVar(sevColorVar[alarm.severity])}22`, color: getCSSVar(sevColorVar[alarm.severity]), border: `1px solid ${getCSSVar(sevColorVar[alarm.severity])}44` }}>
                                  {alarm.severity}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="py-12 text-center">
                        <CheckCircle2 className="size-10 text-[var(--alarm-ok)] mx-auto mb-3 opacity-20" />
                        <p className="text-[13px] text-[var(--text-muted)] font-mono uppercase tracking-widest">
                          {liveFilter === 'all' ? 'Network status: All systems nominal' : `No ${liveFilter} alerts active`}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </motion.div>
              )}
            </AnimatePresence>
          </Card>
        </motion.div>

        {/* ── Bottom Go to Map CTA ── */}
        <motion.div variants={itemVariants} className="flex justify-center pb-4">
          <Button
            onClick={() => router.push('/map')}
            className="gap-2 px-8 py-5 bg-[var(--accent)] hover:bg-[var(--accent-bright)] text-white text-[13px] font-medium rounded-[var(--radius-lg)] shadow-[var(--shadow-glow)] transition-all duration-200"
          >
            <Map className="size-4" />
            Open Full Map View
          </Button>
        </motion.div>
      </motion.div>
    </div>
  )
}
