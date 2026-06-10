'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import { resolveIncident, closeIncident, acknowledgeAssignedIncidents } from '@/lib/firestore'
import { useLiveSnapshot } from '@/hooks/useLiveSnapshot'
import { homeRouteForRole } from '@/lib/roles'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { HardHat, MessageSquare, MapPin, Play, CheckCircle2, History, Wrench } from 'lucide-react'
import { IncidentTimeline } from '@/components/incident/IncidentTimeline'
import { IncidentChat } from '@/components/incident/IncidentChat'
import type { Incident } from '@/types'
import { cn } from '@/lib/utils'

const EASE: [number, number, number, number] = [0.4, 0, 0.2, 1]

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
  '1-Critical': 'Critical', '2-High': 'Major', '3-Medium': 'Minor', '4-Low': 'Warning',
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

type View = 'jobs' | 'chat'

export default function TechnicianPage() {
  const { profile, loading: authLoading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const incidentFromUrl = searchParams.get('incident')

  const [view, setView] = useState<View>('jobs')
  const [selectedIncidentNumber, setSelectedIncidentNumber] = useState<string | null>(incidentFromUrl)
  const [busy, setBusy] = useState<string | null>(null)

  // Field technicians only — everyone else is sent to their own home.
  useEffect(() => {
    if (authLoading) return
    if (profile && profile.role !== 'technician') {
      router.replace(homeRouteForRole(profile.role))
    }
  }, [authLoading, profile, router])

  // When a notification deep-links a specific incident, focus it. Deferred to a
  // microtask so we don't call setState synchronously inside the effect body.
  useEffect(() => {
    if (!incidentFromUrl) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setView('jobs')
      setSelectedIncidentNumber(incidentFromUrl)
      router.replace('/technician', { scroll: false })
    })
    return () => { cancelled = true }
  }, [incidentFromUrl, router])

  const enableSnapshot = !authLoading && profile?.role === 'technician'
  const { openIncidents, loading: snapshotLoading } = useLiveSnapshot(enableSnapshot)
  const loading = enableSnapshot && snapshotLoading

  // Jobs dispatched to me — incidents whose technician crew includes my uid.
  const myJobs = useMemo<Incident[]>(() => {
    if (!profile) return []
    return openIncidents.filter(i => (i.technicians ?? []).some(t => t.uid === profile.uid))
  }, [openIncidents, profile])

  const selectedIncident =
    myJobs.find(i => i.incidentNumber === selectedIncidentNumber) ?? myJobs[0] ?? null

  async function runAction(fn: () => Promise<void>, incidentNumber: string) {
    setBusy(incidentNumber)
    try {
      await fn()
    } catch (err) {
      console.error('[technician] action failed', err)
    } finally {
      setBusy(null)
    }
  }

  if (authLoading || profile?.role !== 'technician') return null

  const displayName = profile.displayName ?? profile.email?.split('@')[0] ?? 'Technician'
  const firstName   = profile.displayName?.split(' ')[0] ?? profile.email?.split('@')[0] ?? 'Technician'

  const stats = {
    open:       myJobs.length,
    inProgress: myJobs.filter(i => i.status === 'IN PROGRESS').length,
    assigned:   myJobs.filter(i => i.status === 'ASSIGNED').length,
  }

  const dispatchedBy = selectedIncident?.assignees ?? []

  return (
    <div className="flex h-full bg-[var(--bg-base)] overflow-hidden">

      {/* Sidebar */}
      <aside className="w-[230px] flex-shrink-0 flex flex-col border-r border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-xl">
        <div className="px-5 pt-6 pb-5 border-b border-[var(--glass-border)]">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-[var(--radius-md)] bg-[var(--alarm-warning)] text-white">
              <HardHat className="size-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-[13px] font-semibold text-[var(--text-primary)] leading-tight">Field Console</span>
              <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-widest">{firstName}</span>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
          {([
            { id: 'jobs', label: 'My Jobs',   icon: <Wrench className="size-4" />,          badge: stats.open },
            { id: 'chat', label: 'Team Chat', icon: <MessageSquare className="size-4" /> },
          ] as { id: View; label: string; icon: React.ReactNode; badge?: number }[]).map(item => {
            const isActive = view === item.id
            return (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-md)] text-[13px] font-medium transition-colors duration-150',
                  isActive
                    ? 'bg-[var(--accent-dim)] text-[var(--text-primary)] border border-[var(--border-accent)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-hover)] border border-transparent'
                )}
              >
                <span className={isActive ? 'text-[var(--accent-bright)]' : 'text-[var(--text-muted)]'}>{item.icon}</span>
                <span className="flex-1 text-left">{item.label}</span>
                {item.badge ? (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-[var(--bg-subtle)] text-[var(--text-primary)]">
                    {item.badge}
                  </span>
                ) : null}
              </button>
            )
          })}
        </nav>

        <div className="px-5 py-4 border-t border-[var(--glass-border)] grid grid-cols-2 gap-3">
          <div className="flex flex-col">
            <span className="text-[18px] font-semibold text-[var(--accent)] leading-none">{stats.inProgress}</span>
            <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-widest mt-1">Active</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[18px] font-semibold text-[var(--alarm-warning)] leading-none">{stats.assigned}</span>
            <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-widest mt-1">Queued</span>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-hidden flex flex-col min-w-0">
        <AnimatePresence mode="wait">
          {view === 'chat' ? (
            <motion.div key="chat" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.2, ease: EASE }} className="flex-1 overflow-hidden">
              <IncidentChat
                incidents={myJobs}
                loading={loading}
                currentUid={profile.uid}
                currentName={displayName}
              />
            </motion.div>
          ) : (
            <motion.div key="jobs" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }} transition={{ duration: 0.2, ease: EASE }} className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-4">

                {/* Job list */}
                <Card className="bg-[var(--glass-bg)] backdrop-blur-xl border-[var(--glass-border)] shadow-[var(--shadow-md)] overflow-hidden">
                  <CardHeader className="border-b border-[var(--glass-border)] pb-3">
                    <CardTitle className="text-[13px] font-medium text-[var(--text-primary)] uppercase tracking-widest">Dispatched to Me</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {loading ? (
                      <div className="px-4 py-8 text-[12px] text-[var(--text-muted)] animate-pulse font-mono">Loading jobs…</div>
                    ) : myJobs.length === 0 ? (
                      <div className="px-4 py-12 text-center">
                        <HardHat className="size-7 text-[var(--text-muted)] mx-auto mb-3" />
                        <div className="text-[13px] text-[var(--text-secondary)]">No jobs dispatched to you.</div>
                        <div className="mt-1 text-[11px] font-mono text-[var(--text-muted)]">An engineer will dispatch incidents here.</div>
                      </div>
                    ) : (
                      myJobs.map(inc => {
                        const isSelected = selectedIncident?.incidentNumber === inc.incidentNumber
                        const statusColor = INC_STATUS_COLOR[inc.status] ?? 'var(--text-muted)'
                        const prioColor   = INC_PRIO_COLOR[inc.priority] ?? 'var(--text-muted)'
                        return (
                          <button
                            key={inc.incidentNumber}
                            onClick={() => setSelectedIncidentNumber(inc.incidentNumber)}
                            className={cn(
                              'w-full text-left px-4 py-3.5 border-b border-[var(--glass-border)] last:border-0 transition-colors duration-150',
                              isSelected ? 'bg-[var(--accent-dim)]' : 'hover:bg-[var(--glass-hover)]'
                            )}
                            style={{ borderLeft: `2px solid ${isSelected ? 'var(--accent-bright)' : statusColor}` }}
                          >
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className="font-mono text-[12px] font-bold text-[var(--text-primary)] truncate">{inc.incidentNumber}</span>
                              <span
                                className="font-mono text-[9px] font-semibold uppercase tracking-widest px-1.5 py-0.5 rounded-full shrink-0"
                                style={{ color: statusColor, background: `color-mix(in srgb, ${statusColor} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${statusColor} 25%, transparent)` }}
                              >
                                {inc.status}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[10px] text-[var(--text-muted)] truncate">{incSites(inc)} · {incTechs(inc)}</span>
                              <span className="ml-auto font-mono text-[9px] font-semibold uppercase tracking-widest shrink-0" style={{ color: prioColor }}>
                                {INC_PRIO_LABEL[inc.priority] ?? inc.priority}
                              </span>
                            </div>
                          </button>
                        )
                      })
                    )}
                  </CardContent>
                </Card>

                {/* Job detail */}
                <div className="flex flex-col gap-4">
                  <Card className="bg-[var(--glass-bg)] backdrop-blur-xl border-[var(--glass-border)] shadow-[var(--shadow-md)] overflow-hidden">
                    <CardHeader className="border-b border-[var(--glass-border)] pb-3">
                      <CardTitle className="text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-widest">Job Detail</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      {!selectedIncident ? (
                        <div className="px-4 py-8 text-center text-[12px] text-[var(--text-muted)] font-mono">Select a job to view details.</div>
                      ) : (
                        <div>
                          <div className="px-4 py-3 border-b border-[var(--glass-border)]">
                            <div className="font-mono text-[13px] font-bold text-[var(--text-primary)]">{selectedIncident.incidentNumber}</div>
                            <div className="mt-1 text-[11px] font-mono text-[var(--text-muted)]">{incSites(selectedIncident)} · {incTechs(selectedIncident)}</div>
                          </div>

                          {/* Dispatched by — the owning engineers */}
                          <div className="px-4 py-3 border-b border-[var(--glass-border)]">
                            <div className="text-[10px] font-medium uppercase tracking-widest text-[var(--text-muted)] mb-2">Dispatched by</div>
                            {dispatchedBy.length === 0 ? (
                              <div className="text-[11px] font-mono text-[var(--text-muted)]">—</div>
                            ) : (
                              <div className="flex flex-col gap-1.5">
                                {dispatchedBy.map(eng => (
                                  <div key={eng.uid} className="flex items-center gap-2">
                                    <span className="w-6 h-6 rounded-full flex items-center justify-center font-mono text-[10px] font-bold shrink-0" style={{ background: 'color-mix(in srgb, var(--alarm-ok) 12%, var(--bg-subtle))', color: 'var(--alarm-ok)', border: '1px solid rgba(52,211,153,0.25)' }}>
                                      {(eng.displayName ?? eng.email).slice(0, 2).toUpperCase()}
                                    </span>
                                    <span className="text-[12px] text-[var(--text-primary)] truncate">{eng.displayName ?? eng.email.split('@')[0]}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="px-4 py-3 flex flex-wrap gap-2">
                            <button
                              onClick={() => router.push(`/map?antennaId=${incMapAntennaId(selectedIncident)}`)}
                              className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-widest px-3 py-1.5 rounded-[var(--radius-md)] border border-[var(--glass-border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-hover)] transition-colors duration-150"
                            >
                              <MapPin className="size-3.5" /> Map
                            </button>
                            {selectedIncident.status === 'ASSIGNED' && (
                              <button
                                disabled={busy === selectedIncident.incidentNumber}
                                onClick={() => runAction(() => acknowledgeAssignedIncidents([selectedIncident.incidentNumber]).then(() => undefined), selectedIncident.incidentNumber)}
                                className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-widest px-3 py-1.5 rounded-[var(--radius-md)] bg-[var(--accent)] hover:bg-[var(--accent-bright)] text-white shadow-[var(--shadow-glow)] disabled:opacity-50 transition-all duration-150"
                              >
                                <Play className="size-3.5" /> Start
                              </button>
                            )}
                            {selectedIncident.status === 'IN PROGRESS' && (
                              <button
                                disabled={busy === selectedIncident.incidentNumber}
                                onClick={() => runAction(() => resolveIncident(selectedIncident.incidentNumber), selectedIncident.incidentNumber)}
                                className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-widest px-3 py-1.5 rounded-[var(--radius-md)] text-white shadow-[var(--shadow-glow)] disabled:opacity-50 transition-all duration-150"
                                style={{ background: 'var(--alarm-ok)' }}
                              >
                                <CheckCircle2 className="size-3.5" /> Resolve
                              </button>
                            )}
                            {selectedIncident.status === 'RESOLVED' && (
                              <button
                                disabled={busy === selectedIncident.incidentNumber}
                                onClick={() => runAction(() => closeIncident(selectedIncident.incidentNumber), selectedIncident.incidentNumber)}
                                className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-widest px-3 py-1.5 rounded-[var(--radius-md)] border border-[var(--glass-border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-hover)] disabled:opacity-50 transition-colors duration-150"
                              >
                                Close
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Activity */}
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
                          currentUid={profile.uid}
                          currentName={displayName}
                          allowNotes={true}
                        />
                      </CardContent>
                    </Card>
                  )}
                </div>

              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

    </div>
  )
}
