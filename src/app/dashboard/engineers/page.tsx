'use client'

import React, { useState, useEffect, useMemo, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'motion/react'
import { useAuth } from '@/components/AuthProvider'
import type { Incident, IncidentAssignee } from '@/types'
import { ArrowLeft, Clock, Users, Search, Filter, Calendar, ChevronDown } from 'lucide-react'
import { relTime } from '@/lib/antenna-helpers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'

import { getAllIncidents } from '@/lib/firestore'

const EASE: [number, number, number, number] = [0.4, 0, 0.2, 1]

const normalize = (str: string) => 
  str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()

function EngineerContent() {
  const router = useRouter()
  const { user, profile, loading: authLoading } = useAuth()
  
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!authLoading && profile && profile.role !== 'admin') {
      router.replace('/dashboard')
    }
  }, [profile, authLoading, router])
  const [search, setSearch] = useState('')
  const [selectedEngineer, setSelectedEngineer] = useState<string | 'ALL'>('ALL')
  const [timeRange, setTimeRange] = useState<'30d' | '3m' | '6m' | '1y'>('30d')
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)

  /* 
   * Real-time Sync Fix:
   * Replaced the manual /api/dashboard/summary fetch with a direct Firestore subscription.
   * This fixes the bug where assignments wouldn't show up until a manual refresh or 5-min cache expiry.
   */
  useEffect(() => {
    if (!user) return
    let cancelled = false

    const fetchIncidents = async () => {
      try {
        const data = await getAllIncidents()
        if (cancelled) return
        setIncidents(data)
        setLoading(false)
      } catch { /* retry on next interval */ }
    }

    void fetchIncidents()
    const id = setInterval(() => void fetchIncidents(), 10_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [user])

  const engineers = useMemo(() => {
    const map = new Map<string, IncidentAssignee>()
    incidents.forEach(i => {
      (i.assignees || []).forEach(a => {
        map.set(a.uid, a)
      })
    })
    return Array.from(map.values()).sort((a, b) => 
      (a.displayName || a.email).localeCompare(b.displayName || b.email)
    )
  }, [incidents])

  const filteredIncidents = useMemo(() => {
    const normalizedSearch = normalize(search)
    const now = new Date()
    const days = timeRange === '30d' ? 30 : timeRange === '3m' ? 90 : timeRange === '6m' ? 180 : 365
    const threshold = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)

    return incidents.filter(i => {
      const siteList = i.siteIds || [i.siteId]
      const matchesSearch = !search || 
        normalize(i.incidentNumber).includes(normalizedSearch) ||
        normalize(i.impact).includes(normalizedSearch) ||
        normalize(siteList.join(' ')).includes(normalizedSearch)
      
      const matchesEngineer = selectedEngineer === 'ALL' || 
        (i.assignees || []).some(a => a.uid === selectedEngineer)

      const matchesTime = new Date(i.submitDate) >= threshold
      
      return matchesSearch && matchesEngineer && matchesTime
    }).sort((a, b) => new Date(b.submitDate).getTime() - new Date(a.submitDate).getTime())
  }, [incidents, search, selectedEngineer, timeRange])

  const exportToCSV = () => {
    if (filteredIncidents.length === 0) return
    const headers = ['Incident Number', 'Site IDs', 'Technologies', 'Priority', 'Status', 'Assignees (Names)', 'Created At', 'Resolved At']
    const rows = filteredIncidents.map(i => [
      i.incidentNumber,
      (i.siteIds || [i.siteId || 'N/A']).join('; '),
      (i.technologies || [i.technology || 'N/A']).join('; '),
      i.priority,
      i.status,
      `"${(i.assignees || []).map(a => a.displayName || a.email).join(', ').replace(/"/g, '""')}"`,
      i.submitDate,
      i.resolvedDate || i.closedDate || ''
    ])
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n")
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.setAttribute("href", url)
    const fileName = `engineer_incidents_${selectedEngineer === 'ALL' ? 'all' : selectedEngineer}_${timeRange}.csv`
    link.setAttribute("download", fileName)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  if (authLoading || (profile && profile.role !== 'admin')) {
    return (
      <div className="flex h-[60vh] w-full items-center justify-center text-[var(--text-muted)] font-mono text-xs uppercase tracking-widest animate-pulse">
        Checking clearance...
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <header className="space-y-6">
        <div className="flex items-center justify-between">
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
                Engineer Incident Assignments
              </h1>
              <p className="text-sm text-[var(--text-muted)] font-mono uppercase tracking-tighter">
                {loading ? 'Fetching records...' : `Showing ${filteredIncidents.length} Linked ${filteredIncidents.length === 1 ? 'Incident' : 'Incidents'}`}
              </p>
            </div>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={exportToCSV}
            className="h-9 bg-[var(--glass-bg)] border-[var(--glass-border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-[10px] uppercase tracking-widest gap-2"
          >
            <Calendar className="size-3.5" />
            Export CSV
          </Button>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--text-muted)]" />
              <Input 
                placeholder="Search by incident #, site, or impact..."
                className="pl-9 bg-[var(--glass-bg)] border-[var(--glass-border)] h-11"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            
            <div className="relative shrink-0">
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="flex items-center justify-between w-full md:w-64 px-4 h-11 bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-[var(--radius-lg)] text-[11px] font-medium uppercase tracking-widest transition-all hover:bg-[var(--glass-hover)]"
              >
                <span className="flex items-center gap-2">
                  <Users className="size-4 text-[var(--accent)]" />
                  {selectedEngineer === 'ALL' ? 'All Engineers' : engineers.find(e => e.uid === selectedEngineer)?.displayName || engineers.find(e => e.uid === selectedEngineer)?.email.split('@')[0] || 'Unknown'}
                </span>
                <ChevronDown className={cn("size-4 transition-transform duration-200", isDropdownOpen && "rotate-180")} />
              </button>

              <AnimatePresence>
                {isDropdownOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-10" 
                      onClick={() => setIsDropdownOpen(false)} 
                    />
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.95 }}
                      transition={{ duration: 0.15, ease: 'easeOut' }}
                      className="absolute left-0 right-0 md:right-auto md:w-64 mt-2 py-2 bg-[var(--bg-surface)] backdrop-blur-xl border border-[var(--glass-border)] rounded-[var(--radius-lg)] shadow-2xl z-20 overflow-hidden max-h-[300px] overflow-y-auto"
                    >
                      <button
                        onClick={() => {
                          setSelectedEngineer('ALL')
                          setIsDropdownOpen(false)
                        }}
                        className={cn(
                          "w-full text-left px-4 py-3 text-[11px] font-medium uppercase tracking-widest transition-colors",
                          selectedEngineer === 'ALL'
                            ? "bg-[var(--accent)] text-white"
                            : "text-[var(--text-secondary)] hover:bg-[var(--glass-hover)] hover:text-[var(--text-primary)]"
                        )}
                      >
                        All Engineers
                      </button>
                      {engineers.map(eng => {
                        const isActive = selectedEngineer === eng.uid
                        const label = eng.displayName || eng.email.split('@')[0]
                        return (
                          <button
                            key={eng.uid}
                            onClick={() => {
                              setSelectedEngineer(eng.uid)
                              setIsDropdownOpen(false)
                            }}
                            className={cn(
                              "w-full text-left px-4 py-3 text-[11px] font-medium uppercase tracking-widest transition-colors",
                              isActive
                                ? "bg-[var(--alarm-ok)] text-white"
                                : "text-[var(--text-secondary)] hover:bg-[var(--glass-hover)] hover:text-[var(--text-primary)]"
                            )}
                          >
                            {label}
                          </button>
                        )
                      })}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mr-2">Time Range:</span>
            {(['30d', '3m', '6m', '1y'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setTimeRange(r)}
                className={cn(
                  "px-3 py-1 rounded-[var(--radius-md)] text-[10px] font-bold uppercase tracking-widest transition-all",
                  timeRange === r 
                    ? "bg-[var(--accent)] text-white shadow-[0_0_10px_var(--accent)]" 
                    : "bg-[var(--glass-bg)] text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--glass-border)]"
                )}
              >
                {r === '30d' ? '30 Days' : r === '3m' ? '3 Months' : r === '6m' ? '6 Months' : '1 Year'}
              </button>
            ))}
          </div>
        </div>
      </header>

      {loading ? (
        <div className="grid gap-4">
          {[1,2,3].map(i => (
            <div key={i} className="h-32 bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-[var(--radius-lg)] animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredIncidents.map((incident, idx) => (
            <motion.div
              key={incident.incidentNumber}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(idx * 0.05, 0.4), duration: 0.35, ease: EASE }}
              className="group"
            >
              <Card className="bg-[var(--glass-bg)] border-[var(--glass-border)] overflow-hidden hover:shadow-lg transition-all">
                <CardContent className="p-0">
                  <div className="p-5 flex flex-col md:flex-row md:items-center gap-6">
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center gap-3">
                         <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border
                          ${incident.status === 'RESOLVED' ? 'border-[var(--alarm-ok)] text-[var(--alarm-ok)] bg-[var(--alarm-ok)]/10' : 'border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/10'}
                        `}>
                          {incident.status}
                        </span>
                        <span className="font-mono text-[11px] font-bold text-[var(--accent)] uppercase tracking-widest">
                          {incident.incidentNumber}
                        </span>
                        <span className="text-[10px] text-[var(--text-muted)] font-mono">•</span>
                        <span className="text-[11px] font-mono text-[var(--text-secondary)]">
                          {(incident.siteIds || [incident.siteId]).join(', ')}
                        </span>
                      </div>
                      
                      <h3 className="text-[16px] font-semibold text-[var(--text-primary)] leading-tight">
                        {incident.impact}
                      </h3>

                      <div className="flex flex-wrap items-center gap-4 text-[11px] font-mono text-[var(--text-muted)] uppercase tracking-tight">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="size-3" />
                          Opened {new Date(incident.submitDate).toLocaleDateString()}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Clock className="size-3" />
                          {incident.status === 'RESOLVED' ? `Resolved ${relTime(incident.resolvedDate || incident.closedDate || incident.submitDate)}` : `Active ${relTime(incident.submitDate)}`}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Filter className="size-3" />
                          Priority {incident.priority}
                        </div>
                      </div>
                    </div>

                    <div className="md:w-64 shrink-0 flex flex-col gap-4">
                      <div className="bg-[var(--bg-subtle)] rounded-[var(--radius-md)] p-4 border border-[var(--glass-border)] group-hover:border-[var(--accent)]/30 transition-colors">
                        <div className="flex items-center justify-between mb-3">
                           <div className="flex items-center gap-2">
                            <Users className="size-3.5 text-[var(--alarm-ok)]" />
                            <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">
                              Assigned Team
                            </span>
                          </div>
                          <span className="text-[10px] font-mono text-[var(--text-muted)]">
                            {(incident.assignees || []).length} Eng
                          </span>
                        </div>

                        <div className="space-y-2">
                          {(incident.assignees || []).length === 0 ? (
                            <div className="text-[11px] text-[var(--text-muted)] italic py-1">
                              No engineers assigned
                            </div>
                          ) : (
                            <div className="flex flex-col gap-2">
                              {(incident.assignees || []).map((assignee) => (
                                <div key={assignee.uid} className="flex items-center gap-2">
                                  <div className="w-6 h-6 rounded-full bg-[var(--alarm-ok)]/10 border border-[var(--alarm-ok)]/30 flex items-center justify-center text-[9px] font-bold text-[var(--alarm-ok)]">
                                    {(assignee.displayName || assignee.email).slice(0, 2).toUpperCase()}
                                  </div>
                                  <div className="flex flex-col">
                                    <span className="text-[11px] text-[var(--text-primary)] font-medium leading-none">
                                      {assignee.displayName || assignee.email.split('@')[0]}
                                    </span>
                                    <span className="text-[9px] text-[var(--text-muted)] truncate max-w-[140px]">
                                      {assignee.email}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
          
          {filteredIncidents.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center py-32 text-center space-y-4 border border-dashed border-[var(--glass-border)] rounded-[var(--radius-xl)]">
              <Users className="size-12 text-[var(--text-muted)] opacity-20" />
              <p className="text-[var(--text-muted)] font-mono uppercase tracking-widest text-sm">
                No matching incidents found for this filter.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function EngineersPage() {
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
        <EngineerContent />
      </Suspense>
    </div>
  )
}
