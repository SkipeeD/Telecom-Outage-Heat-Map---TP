'use client'

import React, { useState, useEffect, useMemo, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { motion } from 'motion/react'
import { incidentMatchesAlarm, getAntennas, getAllIncidents } from '@/lib/firestore'
import { useAuth } from '@/components/AuthProvider'
import type { Antenna, Alarm, AlarmSeverity, Incident, Technology } from '@/types'
import { ArrowLeft, Clock, Users, CheckCircle2, Search, MapPin } from 'lucide-react'
import { SeverityBadge } from '@/components/antenna/SeverityBadge'
import { relTime, techColorVar, severityPalette, TECHS } from '@/lib/antenna-helpers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const EASE: [number, number, number, number] = [0.4, 0, 0.2, 1]

const severityRank: Record<AlarmSeverity, number> = {
  critical: 5,
  major: 4,
  minor: 3,
  warning: 2,
  ok: 1,
}

const FILTERS: (AlarmSeverity | 'ALL')[] = ['ALL', 'critical', 'major', 'minor', 'warning']
const TECH_FILTERS: (Technology | 'ALL')[] = ['ALL', ...TECHS]

const normalize = (str: string) => 
  str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()

interface AlarmDisplayItem extends Alarm {
  antennaName: string
  antennaId: string
  latitude: number
  longitude: number
  incident?: Incident
}

function DistributionContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { user } = useAuth()
  
  const initialSeverity = (searchParams.get('severity') as AlarmSeverity | null) || 'ALL'
  const initialTech = (searchParams.get('tech') as Technology | null) || 'ALL'
  const mode = (searchParams.get('mode') as 'severity' | 'technology') || (searchParams.get('tech') ? 'technology' : 'severity')
  
  const [antennas, setAntennas] = useState<Antenna[]>([])
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [search, setSearch] = useState('')
  const [severityFilter, setSeverityFilter] = useState<AlarmSeverity | 'ALL'>(initialSeverity)
  const [techFilter, setTechFilter] = useState<Technology | 'ALL'>(initialTech)

  useEffect(() => {
    if (!user) return
    let cancelled = false

    const fetchAll = async () => {
      try {
        const [{ antennas: antennasData }, incidentsData] = await Promise.all([getAntennas(), getAllIncidents()])
        if (cancelled) return
        setAntennas(antennasData)
        setIncidents(incidentsData)
      } catch { /* retry on next interval */ }
    }

    void fetchAll()
    const id = setInterval(() => void fetchAll(), 30_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [user])

  const items = useMemo(() => {
    // 1. Flatten all active alarms from all antennas
    const allActive = antennas.flatMap(a => 
      (a.cells || [])
        .filter(c => c.currentAlarm && !c.currentAlarm.resolved)
        .map(c => {
          const alarm = c.currentAlarm!
          const incident = incidents.find(i => incidentMatchesAlarm(i, alarm))
          const item: AlarmDisplayItem = {
            ...alarm,
            antennaName: a.name,
            antennaId: a.id,
            latitude: a.latitude,
            longitude: a.longitude,
            incident
          }
          return item
        })
    )

    // 2. Filter logic
    const normalizedSearch = normalize(search)
    const filtered = allActive.filter(item => {
      const matchesSeverity = severityFilter === 'ALL' || item.severity === severityFilter
      const matchesTech = techFilter === 'ALL' || item.technology === techFilter
      const matchesSearch = !search || 
        normalize(item.antennaName).includes(normalizedSearch) ||
        normalize(item.siteId).includes(normalizedSearch)
      
      return matchesSeverity && matchesTech && matchesSearch
    })

    // 3. Sort logic
    return filtered.sort((a, b) => {
      // Secondary sort: severity rank (descending)
      const rankDiff = severityRank[b.severity] - severityRank[a.severity]
      if (rankDiff !== 0) return rankDiff
      
      // Tertiary sort: time (newest first)
      return new Date(b.alarmTime).getTime() - new Date(a.alarmTime).getTime()
    })
  }, [antennas, incidents, severityFilter, techFilter, search])

  const handleGoToMap = (item: AlarmDisplayItem) => {
    router.push(`/map?selectSite=${item.antennaId}&lat=${item.latitude}&lon=${item.longitude}`)
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <header className="space-y-6">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => router.back()}
            className="rounded-full hover:bg-[var(--glass-hover)]"
          >
            <ArrowLeft className="size-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">
              {mode === 'technology' ? (
                techFilter !== 'ALL'
                  ? `${techFilter} Technology Alarms Detail`
                  : 'Site Technology Distribution'
              ) : (
                severityFilter !== 'ALL' 
                  ? `${severityFilter.charAt(0).toUpperCase() + severityFilter.slice(1)} Alarms Detail` 
                  : 'Alarm Severity Distribution'
              )}
            </h1>
            <p className="text-sm text-[var(--text-muted)] font-mono uppercase tracking-tighter">
              Showing {items.length} Active {items.length === 1 ? 'Incident' : 'Incidents'}
            </p>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--text-muted)]" />
            <Input 
              placeholder="Search by site name or ID..."
              className="pl-9 bg-[var(--glass-bg)] border-[var(--glass-border)]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          
          <div className="flex gap-1.5 p-1 bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-[var(--radius-lg)] shrink-0 overflow-x-auto no-scrollbar">
            {mode === 'technology' ? (
              TECH_FILTERS.map(f => {
                const isActive = techFilter === f
                const techColor = f !== 'ALL' ? `var(${techColorVar[f]})` : null
                
                return (
                  <button
                    key={f}
                    onClick={() => setTechFilter(f)}
                    className={cn(
                      "px-3 py-1.5 rounded-[var(--radius-md)] text-[11px] font-medium uppercase tracking-widest transition-all duration-200 shrink-0",
                      isActive 
                        ? "text-white shadow-[var(--shadow-glow)]" 
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-hover)]"
                    )}
                    style={isActive ? {
                      backgroundColor: techColor || 'var(--accent)',
                      boxShadow: techColor ? `0 0 14px ${techColor}44` : '0 0 14px var(--accent)44'
                    } : {}}
                  >
                    {f}
                  </button>
                )
              })
            ) : (
              FILTERS.map(f => {
                const isActive = severityFilter === f
                const palette = f !== 'ALL' ? severityPalette[f] : null
                
                return (
                  <button
                    key={f}
                    onClick={() => setSeverityFilter(f)}
                    className={cn(
                      "px-3 py-1.5 rounded-[var(--radius-md)] text-[11px] font-medium uppercase tracking-widest transition-all duration-200 shrink-0",
                      isActive 
                        ? "text-white shadow-[var(--shadow-glow)]" 
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-hover)]"
                    )}
                    style={isActive ? {
                      backgroundColor: palette ? palette.text : 'var(--accent)',
                      boxShadow: palette ? `0 0 14px ${palette.text}44` : '0 0 14px var(--accent)44'
                    } : {}}
                  >
                    {f}
                  </button>
                )
              })
            )}
          </div>
        </div>
      </header>

      <div className="grid gap-4">
        {items.map((item, idx) => (
          <motion.div
            key={`${item.id}-${idx}`}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: Math.min(idx * 0.05, 0.4), duration: 0.35, ease: EASE }}
            className="bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-[var(--radius-lg)] overflow-hidden shadow-sm hover:shadow-md transition-all group relative"
          >
            <div className="p-5 flex flex-col md:flex-row md:items-center gap-6">
              {/* Left: Alarm Info */}
              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-3">
                  <SeverityBadge severity={item.severity} />
                  <span className="font-mono text-[10px] text-[var(--text-muted)] uppercase tracking-widest bg-white/5 px-2 py-0.5 rounded">
                    {item.siteId}
                  </span>
                  <span className="text-[13px] font-semibold text-[var(--text-primary)] truncate max-w-[240px]">
                    {item.antennaName}
                  </span>
                </div>
                
                <h3 className="text-[15px] font-medium text-[var(--text-primary)] leading-tight">
                  {item.text}
                </h3>

                <div className="flex items-center gap-4 text-[11px] font-mono text-[var(--text-muted)] uppercase tracking-tight">
                  <div className="flex items-center gap-1.5" style={{ color: `var(${techColorVar[item.technology]})` }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: `var(${techColorVar[item.technology]})` }} />
                    {item.technology}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="size-3" />
                    Started {relTime(item.alarmTime)}
                  </div>
                </div>
              </div>

              {/* Right: Actions and Incident Info */}
              <div className="md:w-72 shrink-0 flex flex-col gap-3">
                <Button
                  onClick={() => handleGoToMap(item)}
                  variant="ghost"
                  size="sm"
                  className="w-full bg-white/5 hover:bg-[var(--accent)] hover:text-white transition-all text-[10px] uppercase tracking-widest font-mono h-8 border-none"
                >
                  <MapPin className="size-3 mr-2" />
                  Go to Map
                </Button>

                {item.incident ? (
                  <div className="bg-[var(--bg-subtle)] rounded-[var(--radius-md)] p-3 border border-[var(--glass-border)] space-y-2 group-hover:border-[var(--accent)]/30 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-[var(--accent)] font-mono">{item.incident.incidentNumber}</span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase border
                        ${item.incident.status === 'RESOLVED' ? 'border-[var(--alarm-ok)] text-[var(--alarm-ok)] bg-[var(--alarm-ok)]/10' : 'border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/10'}
                      `}>
                        {item.incident.status}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <Users className="size-3 text-[var(--alarm-ok)] shrink-0" />
                        <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-widest">
                          Engineers
                        </span>
                      </div>

                      {(item.incident.assignees ?? []).length === 0 ? (
                        <span className="text-[10px] font-mono text-[var(--text-muted)] italic">
                          Unassigned
                        </span>
                      ) : (
                        <div className="flex items-center -space-x-1.5">
                          {(item.incident.assignees ?? []).slice(0, 4).map((assignee, index) => {
                            const label = assignee.displayName ?? assignee.email.split('@')[0]
                            const initials = label.slice(0, 2).toUpperCase()
                            const count = item.incident?.assignees?.length ?? 0

                            return (
                              <div
                                key={assignee.uid}
                                title={assignee.email}
                                className="w-6 h-6 rounded-full flex items-center justify-center font-mono text-[9px] font-bold ring-2 ring-[var(--bg-base)]"
                                style={{
                                  background: 'color-mix(in srgb, var(--alarm-ok) 15%, var(--bg-subtle))',
                                  color: 'var(--alarm-ok)',
                                  border: '1px solid rgba(52,211,153,0.3)',
                                  zIndex: count - index,
                                }}
                              >
                                {initials}
                              </div>
                            )
                          })}
                          {(item.incident.assignees ?? []).length > 4 && (
                            <div
                              className="w-6 h-6 rounded-full flex items-center justify-center font-mono text-[8px] font-bold ring-2 ring-[var(--bg-base)]"
                              style={{
                                background: 'var(--bg-subtle)',
                                color: 'var(--text-muted)',
                                border: '1px solid var(--glass-border)',
                              }}
                            >
                              +{(item.incident.assignees ?? []).length - 4}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)] leading-tight line-clamp-2">
                      {item.incident.impact}
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center py-4 border border-dashed border-[var(--glass-border)] rounded-[var(--radius-md)] opacity-40 italic">
                    <span className="text-[10px] uppercase font-mono text-[var(--text-muted)]">No Linked Incident</span>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        ))}
        
        {items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-32 text-center space-y-4">
            <CheckCircle2 className="size-12 text-[var(--alarm-ok)] opacity-20" />
            <p className="text-[var(--text-muted)] font-mono uppercase tracking-widest text-sm">
              No active alarms found.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default function DistributionDetailPage() {
  const { loading: authLoading } = useAuth()

  if (authLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--bg-base)]">
        <div className="animate-pulse text-[var(--text-muted)] font-mono uppercase tracking-widest text-sm">
          Loading Data...
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-[var(--bg-base)] p-6 md:p-8">
      <Suspense fallback={<div>Loading...</div>}>
        <DistributionContent />
      </Suspense>
    </div>
  )
}
