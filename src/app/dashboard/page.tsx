'use client'

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { motion } from 'motion/react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area
} from 'recharts'
import { getAntennas } from '@/lib/firestore'
import { canViewDashboard, homeRouteForRole } from '@/lib/roles'
import { useAuth } from '@/components/AuthProvider'
import { useTheme } from '@/hooks/useTheme'
import { useLiveSnapshot } from '@/hooks/useLiveSnapshot'
import type { Antenna, AlarmSeverity, Technology, Alarm, DashboardSummary } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useRouter } from 'next/navigation'
import {
  Activity, ShieldAlert, CheckCircle2, Zap, Globe, Download, History, Wrench,
  ArrowRight, Cloud, CloudRain, Sun, Wind, Thermometer, LucideIcon, MapPin, Users, RefreshCw
} from 'lucide-react'
import { TECHS, sevColorVar, techColorVar, relTime } from '@/lib/antenna-helpers'
import { cn } from '@/lib/utils'
import { cityForAntenna } from '@/lib/weather-cities'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import type { CityWeatherDetail } from '@/app/api/weather/route'

const EASE: [number, number, number, number] = [0.4, 0, 0.2, 1]

const weatherIcons: Record<string, LucideIcon> = {
  sunny: Sun,
  rainy: CloudRain,
  cloudy: Cloud,
  stormy: Zap,
  windy: Wind,
}

const riskColors: Record<string, string> = {
  low:    'var(--alarm-ok)',
  medium: 'var(--alarm-warning)',
  high:   'var(--alarm-critical)',
}

const riskRank: Record<string, number> = { high: 3, medium: 2, low: 1 }

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 }
  }
}

const itemVariants = {
  hidden: { opacity: 0, y: 16, filter: 'blur(8px)' },
  visible: { 
    opacity: 1, y: 0, filter: 'blur(0px)',
    transition: { duration: 0.45, ease: EASE }
  }
}

function getCSSVar(name: string) {
  if (typeof window === 'undefined') return ''
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

const severityRank: Record<AlarmSeverity, number> = {
  critical: 5,
  major: 4,
  minor: 3,
  warning: 2,
  ok: 1,
}

function getWorstStatus(antenna: Antenna): AlarmSeverity {
  if (!antenna.cells || antenna.cells.length === 0) return 'ok'
  return antenna.cells.reduce((prev, curr) => 
    severityRank[curr.status] > severityRank[prev.status] ? curr : prev
  ).status
}

export default function DashboardPage() {
  const { user, profile, loading: authLoading } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const isEngineer = profile?.role === 'engineer'
  const { theme } = useTheme()
  const router = useRouter()

  // The dashboard is an engineer/admin ops view. Technicians and normal users
  // are redirected to their own home.
  const dashboardAllowed = canViewDashboard(profile?.role)
  useEffect(() => {
    if (!authLoading && profile && !dashboardAllowed) {
      router.replace(homeRouteForRole(profile.role))
    }
  }, [authLoading, profile, dashboardAllowed, router])
  const [antennas, setAntennas] = useState<Antenna[]>([])
  const [resolvedAlarms, setResolvedAlarms] = useState<Alarm[]>([])
  const [timeRange, setTimeRange] = useState<'30d' | '3m' | '6m' | '1y'>('30d')

  // Live state via meta/liveSnapshot — replaces the 30s antenna polling and
  // 10s incident polling that previously ran on this page.
  const { snapshot, openIncidents } = useLiveSnapshot(!!user)
  const antennaSeverity = snapshot?.antennaSeverity
  const activeAlarms = useMemo(() => snapshot?.activeAlarms ?? [], [snapshot])

  // Chart data needs historical resolved incidents too — comes from the
  // 5-min-cached dashboard summary endpoint.
  const [historicalIncidents, setHistoricalIncidents] = useState<DashboardSummary['incidents']>([])
  const incidents = useMemo(() => {
    const merged = new Map<string, DashboardSummary['incidents'][number]>()
    for (const i of historicalIncidents) merged.set(i.incidentNumber, i)
    for (const i of openIncidents)       merged.set(i.incidentNumber, i)
    return Array.from(merged.values())
  }, [historicalIncidents, openIncidents])
  
  const [weatherDetails, setWeatherDetails] = useState<CityWeatherDetail[]>([])
  const [selectedCity, setSelectedCity] = useState<CityWeatherDetail | null>(null)
  const [aiPrediction, setAiPrediction] = useState<{
    outlook: string
    riskZones: { city: string; reason: string; severity: string; conditions?: string }[]
    recommendation: string
  } | null>(null)
  const [loadingAi, setLoadingAi] = useState(false)
  const [aiError, setAiError] = useState(false)
  const [isAutoScrolling, setIsAutoScrolling] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isAutoScrolling || !scrollRef.current) return

    const interval = setInterval(() => {
      if (scrollRef.current) {
        const { scrollLeft, scrollWidth } = scrollRef.current
        const halfWidth = (scrollWidth - 16) / 2 // 16 is gap/padding compensation if any, but simpler:
        
        // Use a more robust check for infinite loop
        if (scrollLeft >= halfWidth) {
          scrollRef.current.scrollLeft = 0
        } else {
          scrollRef.current.scrollBy({ left: 1, behavior: 'auto' })
        }
      }
    }, 30)

    return () => clearInterval(interval)
  }, [isAutoScrolling])

  // One-shot topology fetch on mount. Positions are static; live cell status
  // is sourced from snapshot.antennaSeverity below.
  useEffect(() => {
    if (!user) return
    let cancelled = false
    void (async () => {
      try {
        const { antennas: data } = await getAntennas()
        if (!cancelled) setAntennas(data)
      } catch { /* keep stale */ }
    })()
    return () => { cancelled = true }
  }, [user])

  useEffect(() => {
    if (!user) return
    let cancelled = false

    const fetchDashboardSummary = async () => {
      try {
        const idToken = await user.getIdToken()
        const res = await fetch('/api/dashboard/summary', {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        })
        if (!res.ok || cancelled) return

        const summary = await res.json() as DashboardSummary
        if (cancelled) return

        setResolvedAlarms(summary.resolvedAlarms)
        setHistoricalIncidents(summary.incidents)
      } catch {
        // dashboard history is non-critical; live topology stays active
      }
    }

    void fetchDashboardSummary()
    const id = window.setInterval(() => void fetchDashboardSummary(), 5 * 60 * 1000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [user])

  const fetchAiPrediction = useCallback(async (details: CityWeatherDetail[]) => {
    if (details.length === 0 || loadingAi) return
    setLoadingAi(true)
    setAiError(false)
    try {
      const res = await fetch('/api/weather/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weatherDetails: details })
      })
      if (res.ok) {
        const data = await res.json()
        setAiPrediction(data)
      } else {
        setAiError(true)
      }
    } catch (err) {
      console.error('AI Prediction fetch failed', err)
      setAiError(true)
    } finally {
      setLoadingAi(false)
    }
  }, [loadingAi])

  const fetchWeather = useCallback(async () => {
    try {
      const res = await fetch('/api/weather')
      if (!res.ok) return
      const { weatherDetails: details } = await res.json()
      if (Array.isArray(details)) {
        const sorted = [...details].sort((a, b) => riskRank[b.risk] - riskRank[a.risk])
        setWeatherDetails(sorted)
        
        if (!aiPrediction) {
          void fetchAiPrediction(details)
        }
      }
    } catch {
      // non-critical — weather data stays empty on failure
    }
  }, [aiPrediction, fetchAiPrediction])

  useEffect(() => {
    if (!user) return
    const timeoutId = window.setTimeout(() => {
      void fetchWeather()
    }, 0)
    const id = setInterval(fetchWeather, 30 * 60 * 1000)
    return () => {
      window.clearTimeout(timeoutId)
      clearInterval(id)
    }
  }, [user, fetchWeather])

  // Periodic AI refresh (every 60 mins)
  useEffect(() => {
    if (!user || weatherDetails.length === 0) return
    const id = setInterval(() => {
      void fetchAiPrediction(weatherDetails)
    }, 60 * 60 * 1000)
    return () => clearInterval(id)
  }, [user, weatherDetails, fetchAiPrediction])

  const stats = useMemo(() => {
    const total = antennas.length
    let alarms = 0
    let ok = 0
    const severityCount: Record<AlarmSeverity, number> = {
      critical: 0,
      major: 0,
      minor: 0,
      warning: 0,
      ok: 0
    }
    const techCount: Record<Technology, number> = {
      '2G': 0, '3G': 0, '4G': 0, '5G': 0, '6G': 0
    }

    const severityMap = antennaSeverity ?? {}
    const worstActiveAlarmByAntenna = new Map<string, Alarm>()
    for (const alarm of activeAlarms) {
      if (alarm.resolved) continue
      const cur = worstActiveAlarmByAntenna.get(alarm.antennaId)
      if (!cur || severityRank[alarm.severity] > severityRank[cur.severity]) {
        worstActiveAlarmByAntenna.set(alarm.antennaId, alarm)
      }
    }

    antennas.forEach(a => {
      // Live snapshot is the source of truth — absence from antennaSeverity means
      // ok. (Do NOT fall back to the static topology cells; that double-counts
      // stale seed alarms and inflated this number well above the real count.)
      const status: AlarmSeverity = severityMap[a.id] ?? 'ok'
      severityCount[status]++
      if (status === 'ok') ok++
      else alarms++

      if (status !== 'ok') {
        const worstAlarm = worstActiveAlarmByAntenna.get(a.id)
        const tech: Technology = worstAlarm?.technology ?? a.cells[0]?.technology ?? '4G'
        techCount[tech]++
      }
    })

    const pieData = [
      { name: 'Critical', value: severityCount.critical, color: '--alarm-critical' },
      { name: 'Major',    value: severityCount.major,    color: '--alarm-major' },
      { name: 'Minor',    value: severityCount.minor,    color: '--alarm-minor' },
      { name: 'Warning',  value: severityCount.warning,  color: '--alarm-warning' },
    ].filter(d => d.value > 0)

    const barData = TECHS.map(t => ({
      name: t,
      value: techCount[t],
      color: techColorVar[t]
    }))

    // Build date label for an ISO date string based on timeRange
    const cutoff = (() => {
      const d = new Date()
      if (timeRange === '30d') d.setDate(d.getDate() - 30)
      else if (timeRange === '3m') d.setMonth(d.getMonth() - 3)
      else if (timeRange === '6m') d.setMonth(d.getMonth() - 6)
      else d.setFullYear(d.getFullYear() - 1)
      return d.getTime()
    })()

    const dateLabel = (iso: string) => {
      const d = new Date(iso)
      if (timeRange === '30d' || timeRange === '3m') return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      if (timeRange === '6m') {
        const firstDay = new Date(d.getFullYear(), 0, 1)
        const week = Math.ceil(((d.getTime() - firstDay.getTime()) / 86400000 + firstDay.getDay() + 1) / 7)
        return `Wk ${week}`
      }
      return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    }

    const dailyStats: Record<string, { ts: number; created: number; resolved: number; mttrSumMs: number; resolvedCount: number }> = {}
    
    // Track engineer workload for utilization chart (Active incidents per engineer)
    const engineerWorkload: Record<string, { name: string; count: number }> = {}

    incidents.forEach(i => {
      // First, ensure all assignees exist in our workload map (even with 0 count)
      (i.assignees || []).forEach(a => {
        const name = a.displayName || a.email.split('@')[0]
        if (!engineerWorkload[a.uid]) {
          engineerWorkload[a.uid] = { name, count: 0 }
        }
      })

      // 1. Creation Stats: Only count if submitDate is within the selected timeRange
      const submitTs = new Date(i.submitDate).getTime()
      if (submitTs >= cutoff) {
        const label = dateLabel(i.submitDate)
        if (!dailyStats[label]) {
          dailyStats[label] = { ts: submitTs, created: 0, resolved: 0, mttrSumMs: 0, resolvedCount: 0 }
        }
        dailyStats[label].created++
      }
      
      // 2. Engineer Utilization: Count active incidents for each assigned engineer
      if (i.status === 'ASSIGNED' || i.status === 'IN PROGRESS') {
        (i.assignees || []).forEach(a => {
          engineerWorkload[a.uid].count++
        })
      }

      // 3. Resolution Stats & MTTR Logic:
      // We check if the incident was resolved WITHIN the selected timeRange, 
      // regardless of when it was originally created.
      if ((i.status === 'RESOLVED' || i.status === 'CLOSED') && (i.resolvedDate || i.closedDate)) {
        const resDate = i.resolvedDate || i.closedDate!
        const resTs = new Date(resDate).getTime()
        
        if (resTs >= cutoff) {
          const resLabel = dateLabel(resDate)
          if (!dailyStats[resLabel]) {
            dailyStats[resLabel] = { ts: resTs, created: 0, resolved: 0, mttrSumMs: 0, resolvedCount: 0 }
          }
          dailyStats[resLabel].resolved++
          
          // Only calculate MTTR if we have a valid submission date to compare against
          if (i.submitDate) {
            const mttrMs = resTs - submitTs
            dailyStats[resLabel].mttrSumMs += mttrMs
            dailyStats[resLabel].resolvedCount++
          }
        }
      }
    })

    // Format the combined performance data for AreaChart
    const resolvedChartData = Object.entries(dailyStats)
      .map(([date, { ts, created, resolved, mttrSumMs, resolvedCount }]) => ({ 
        date, 
        ts, 
        created, 
        resolved,
        // Mean Time To Resolve in hours (Average)
        mttrHours: resolvedCount > 0 ? Number((mttrSumMs / resolvedCount / 3600000).toFixed(1)) : 0
      }))
      .sort((a, b) => a.ts - b.ts)
      .map(({ date, created, resolved, mttrHours }) => ({ date, created, resolved, mttrHours }))

    // Format engineer utilization for BarChart
    const utilizationData = Object.values(engineerWorkload)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10) // Show top 10 busy engineers

    // Log the calculated data for debugging in development
    if (process.env.NODE_ENV === 'development') {
       console.debug('Utilization Debug:', { incidentsCount: incidents.length, workload: engineerWorkload })
    }

    return { total, alarms, ok, pieData, barData, resolvedChartData, utilizationData }
  }, [activeAlarms, antennaSeverity, antennas, incidents, timeRange])

  const myIncidents = useMemo(() => {
    if (!profile || profile.role !== 'engineer') return []
    const now = new Date().getTime()
    // Stale Threshold: 12 hours (in milliseconds)
    const STALE_MS = 12 * 60 * 60 * 1000

    return incidents.filter(i => 
      (i.assignees || []).some(a => a.uid === profile.uid)
    )
    .map(i => {
      // Logic for "Stale" alerts: If an incident has been IN PROGRESS 
      // for more than 12 hours, mark it for high visibility.
      const isStale = i.status === 'IN PROGRESS' && (now - new Date(i.submitDate).getTime() > STALE_MS)
      return { ...i, isStale }
    })
    .sort((a, b) => {
      // Sort stale tasks to the top so engineers address them immediately
      if (a.isStale && !b.isStale) return -1
      if (!a.isStale && b.isStale) return 1
      return new Date(b.submitDate).getTime() - new Date(a.submitDate).getTime()
    })
  }, [incidents, profile])

  const exportResolvedToExcel = () => {
    if (resolvedAlarms.length === 0) return
    const headers = ['Site ID', 'Technology', 'Severity', 'Alarm Text', 'Triggered At', 'Resolved At']
    const rows = resolvedAlarms.map(a => [
      a.siteId,
      a.technology,
      a.severity,
      `"${a.text.replace(/"/g, '""')}"`,
      a.alarmTime,
      a.cancelTime || ''
    ])
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n")
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.setAttribute("href", url)
    link.setAttribute("download", `resolved_alarms_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  if (authLoading) return null
  if (profile && !dashboardAllowed) return null

  return (
    <div className="min-h-full bg-[var(--bg-base)] p-6 md:p-8 transition-colors duration-300">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="max-w-7xl mx-auto space-y-8"
      >
        {/* Header */}
        <motion.div variants={itemVariants} className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-[28px] font-semibold text-[var(--text-primary)]">
              Network Operations Center
            </h1>
            <p className="text-[14px] text-[var(--text-secondary)]">
              Real-time infrastructure health and outage monitoring dashboard.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isAdmin && (
              <Button
                variant="outline"
                onClick={() => router.push('/dashboard/engineers')}
                className="
                  flex items-center gap-2
                  bg-[var(--glass-bg)] hover:bg-[var(--glass-hover)]
                  border-[var(--glass-border)] hover:border-[var(--border-strong)]
                  text-[var(--text-primary)] text-[13px] font-medium
                  rounded-[var(--radius-md)]
                  transition-all duration-200
                "
              >
                <Users className="size-4" />
                Performance
              </Button>
            )}
            <Button
              onClick={() => router.push('/dashboard/alarms')}
              className="
                flex items-center gap-2
                bg-[var(--accent)] hover:bg-[var(--accent-bright)]
                text-white text-[13px] font-medium
                rounded-[var(--radius-md)]
                shadow-[var(--shadow-glow)]
                transition-all duration-200
              "
            >
              <ShieldAlert className="size-4" />
              View All Alarms
            </Button>
          </div>
        </motion.div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <motion.div variants={itemVariants}>
            <Card className="bg-[var(--glass-bg)] backdrop-blur-xl border-[var(--glass-border)] shadow-[var(--shadow-md)]">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-widest">
                  Total Sites
                </CardTitle>
                <Globe className="size-4 text-[var(--text-muted)]" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-[var(--text-primary)] font-mono">{stats.total}</div>
                <p className="text-[10px] text-[var(--text-muted)] mt-1">Global infrastructure</p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={itemVariants}>
            <Card className="bg-[var(--glass-bg)] backdrop-blur-xl border-[var(--glass-border)] shadow-[var(--shadow-md)]">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-widest">
                  Active Alarms
                </CardTitle>
                <ShieldAlert className="size-4 text-[var(--alarm-critical)]" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-[var(--alarm-critical)] font-mono">{stats.alarms}</div>
                <p className="text-[10px] text-[var(--text-muted)] mt-1">Requiring immediate attention</p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={itemVariants}>
            <Card className="bg-[var(--glass-bg)] backdrop-blur-xl border-[var(--glass-border)] shadow-[var(--shadow-md)]">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-widest">
                  Sites Operational
                </CardTitle>
                <CheckCircle2 className="size-4 text-[var(--alarm-ok)]" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-[var(--alarm-ok)] font-mono">{stats.ok}</div>
                <p className="text-[10px] text-[var(--text-muted)] mt-1">Healthy site status</p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={itemVariants}>
            <Card className="bg-[var(--glass-bg)] backdrop-blur-xl border-[var(--glass-border)] shadow-[var(--shadow-md)]">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-widest">
                  System Health
                </CardTitle>
                <Activity className="size-4 text-[var(--accent)]" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-[var(--text-primary)] font-mono">
                  {stats.total > 0 ? Math.round((stats.ok / stats.total) * 100) : 0}%
                </div>
                <div className="w-full bg-[var(--bg-muted)] h-1 rounded-full mt-2 overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${stats.total > 0 ? (stats.ok / stats.total) * 100 : 0}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    className="bg-[var(--accent)] h-full"
                  />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <motion.div variants={itemVariants}>
            <Card className="bg-[var(--glass-bg)] backdrop-blur-xl border-[var(--glass-border)] shadow-[var(--shadow-md)] overflow-hidden">
              <CardHeader 
                className="cursor-pointer hover:bg-[var(--glass-hover)] transition-colors group"
                onClick={() => router.push('/dashboard/distribution')}
              >
                <CardTitle className="text-[13px] font-medium text-[var(--text-primary)] uppercase tracking-widest flex items-center justify-between">
                  Alarm Severity Distribution
                  <ArrowRight className="size-4 text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-colors" />
                </CardTitle>
              </CardHeader>
              <CardContent className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart key={theme}>
                    <Pie
                      data={stats.pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                      stroke="none"
                      className="cursor-pointer outline-none"
                      onClick={(data) => {
                        if (data && data.name) {
                          router.push(`/dashboard/distribution?severity=${data.name.toLowerCase()}`)
                        }
                      }}
                    >
                      {stats.pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={getCSSVar(entry.color)} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: getCSSVar('--bg-overlay'),
                        border: `1px solid ${getCSSVar('--glass-border')}`,
                        borderRadius: 'var(--radius-md)',
                        color: getCSSVar('--text-primary'),
                        fontSize: '12px',
                        fontFamily: 'var(--font-mono)',
                      }}
                      itemStyle={{ color: getCSSVar('--text-primary') }}
                    />
                    <Legend 
                      verticalAlign="bottom" 
                      height={36}
                      formatter={(value) => <span className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)] font-mono">{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={itemVariants}>
            <Card className="bg-[var(--glass-bg)] backdrop-blur-xl border-[var(--glass-border)] shadow-[var(--shadow-md)]">
              <CardHeader
                className="cursor-pointer hover:bg-[var(--glass-hover)] transition-colors group"
                onClick={() => router.push('/dashboard/distribution?mode=technology')}
              >
                <CardTitle className="text-[13px] font-medium text-[var(--text-primary)] uppercase tracking-widest flex items-center justify-between">
                  Affected Sites by Technology
                  <ArrowRight className="size-4 text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-colors" />
                </CardTitle>
              </CardHeader>
              <CardContent className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.barData} key={theme} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={getCSSVar('--border')} />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: getCSSVar('--text-muted'), fontSize: 10, fontFamily: 'var(--font-mono)' }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: getCSSVar('--text-muted'), fontSize: 10, fontFamily: 'var(--font-mono)' }}
                    />
                    <Tooltip
                      cursor={{ fill: 'var(--glass-hover)' }}
                      contentStyle={{
                        background: getCSSVar('--bg-overlay'),
                        border: `1px solid ${getCSSVar('--glass-border')}`,
                        borderRadius: 'var(--radius-md)',
                        color: getCSSVar('--text-primary'),
                        fontSize: '12px',
                        fontFamily: 'var(--font-mono)',
                      }}
                      itemStyle={{ color: getCSSVar('--text-primary') }}
                    />
                    <Bar 
                      dataKey="value" 
                      radius={[4, 4, 0, 0]}
                      className="cursor-pointer outline-none"
                      onClick={(data) => {
                        if (data && data.name) {
                          router.push(`/dashboard/distribution?mode=technology&tech=${data.name}`)
                        }
                      }}
                    >
                      {stats.barData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={getCSSVar(entry.color)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </motion.div>        </div>

        {/* Resolution Performance Chart & Export */}
        {isAdmin && (
          <motion.div variants={itemVariants}>
            <Card className="bg-[var(--glass-bg)] backdrop-blur-xl border-[var(--glass-border)] shadow-[var(--shadow-md)]">
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="flex flex-col gap-1">
                  <CardTitle className="text-[13px] font-medium text-[var(--text-primary)] uppercase tracking-widest flex items-center gap-2">
                    <History className="size-4 text-[var(--alarm-ok)]" />
                    Resolution Performance
                  </CardTitle>
                  <div className="flex items-center gap-2 mt-1">
                    {(['30d', '3m', '6m', '1y'] as const).map((r) => (
                      <button
                        key={r}
                        onClick={() => setTimeRange(r)}
                        className={cn(
                          "px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-tighter transition-all",
                          timeRange === r
                            ? "bg-[var(--accent)] text-white shadow-[0_0_8px_var(--accent)]"
                            : "bg-[var(--glass-bg)] text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--glass-border)]"
                        )}
                      >
                        {r === '30d' ? '30 Days' : r === '3m' ? '3 Months' : r === '6m' ? '6 Months' : '1 Year'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.push('/dashboard/engineers')}
                    className="h-8 text-[var(--accent)] hover:text-[var(--accent)] hover:bg-[var(--accent)]/10 text-[10px] uppercase tracking-widest gap-2 font-bold"
                  >
                    <Users className="size-3.5" />
                    Engineer Details
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={exportResolvedToExcel}
                    className="h-8 bg-[var(--glass-bg)] border-[var(--glass-border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-[10px] uppercase tracking-widest gap-2"
                  >
                    <Download className="size-3.5" />
                    Export Report (CSV)
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stats.resolvedChartData} key={`${theme}-resolved`} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorResolved" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={getCSSVar('--alarm-ok')} stopOpacity={0.3}/>
                        <stop offset="95%" stopColor={getCSSVar('--alarm-ok')} stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorCreated" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={getCSSVar('--alarm-major')} stopOpacity={0.1}/>
                        <stop offset="95%" stopColor={getCSSVar('--alarm-major')} stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={getCSSVar('--border')} />
                    <XAxis
                      dataKey="date"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: getCSSVar('--text-muted'), fontSize: 9, fontFamily: 'var(--font-mono)' }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: getCSSVar('--text-muted'), fontSize: 9, fontFamily: 'var(--font-mono)' }}
                    />
                    {/* Secondary Y-Axis for MTTR (Hours) */}
                    <YAxis 
                      yAxisId="right" 
                      orientation="right" 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: 'var(--accent)', fontSize: 9, fontFamily: 'var(--font-mono)' }}
                      unit="h"
                    />
                    <Tooltip
                      contentStyle={{
                        background: getCSSVar('--bg-overlay'),
                        border: `1px solid ${getCSSVar('--glass-border')}`,
                        borderRadius: 'var(--radius-md)',
                        color: getCSSVar('--text-primary'),
                        fontSize: '11px',
                        fontFamily: 'var(--font-mono)',
                      }}
                      itemStyle={{ color: getCSSVar('--text-primary') }}
                    />
                    <Area
                      type="monotone"
                      dataKey="created"
                      stroke={getCSSVar('--alarm-major')}
                      fillOpacity={1}
                      fill="url(#colorCreated)"
                      strokeWidth={2}
                      name="New"
                    />
                    <Area
                      type="monotone"
                      dataKey="resolved"
                      stroke={getCSSVar('--alarm-ok')}
                      fillOpacity={1}
                      fill="url(#colorResolved)"
                      strokeWidth={2}
                      name="Resolved"
                    />
                    {/* MTTR Trend Line: Shows average time to resolve incidents in hours */}
                    <Area
                      yAxisId="right"
                      type="monotone"
                      dataKey="mttrHours"
                      stroke="var(--accent)"
                      fill="transparent"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      name="Avg MTTR (Hrs)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Engineer Utilization (Admin Only) */}
        {isAdmin && (
          <motion.div variants={itemVariants}>
            <Card className="bg-[var(--glass-bg)] backdrop-blur-xl border-[var(--glass-border)] shadow-[var(--shadow-md)]">
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="flex flex-col gap-1">
                  <CardTitle className="text-[13px] font-medium text-[var(--text-primary)] uppercase tracking-widest flex items-center gap-2">
                    <Users className="size-4 text-[var(--accent)]" />
                    Engineer Utilization
                  </CardTitle>
                  <p className="text-[10px] text-[var(--text-muted)]">Active incidents currently assigned per engineer</p>
                </div>
              </CardHeader>
              <CardContent className="h-[240px]">
                {stats.utilizationData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart 
                      layout="vertical" 
                      data={stats.utilizationData} 
                      margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke={getCSSVar('--border')} />
                      <XAxis 
                        type="number" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: getCSSVar('--text-muted'), fontSize: 9, fontFamily: 'var(--font-mono)' }}
                        allowDecimals={false}
                      />
                      <YAxis 
                        dataKey="name" 
                        type="category" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: getCSSVar('--text-primary'), fontSize: 10, fontWeight: 'bold' }}
                        width={80}
                      />
                      <Tooltip
                        cursor={{ fill: 'var(--glass-hover)' }}
                        contentStyle={{
                          background: getCSSVar('--bg-overlay'),
                          border: `1px solid ${getCSSVar('--glass-border')}`,
                          borderRadius: 'var(--radius-md)',
                          fontSize: '11px',
                          fontFamily: 'var(--font-mono)',
                        }}
                      />
                      <Bar 
                        dataKey="count" 
                        fill="var(--accent)" 
                        radius={[0, 4, 4, 0]} 
                        barSize={12} 
                        name="Active Incidents"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center opacity-40">
                    <Users className="size-8 mb-2" />
                    <p className="text-[11px] uppercase tracking-widest font-mono">No active assignments found</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* My Active Assignments (Engineer Only) */}
        {isEngineer && (
          <motion.div variants={itemVariants}>
            <Card className="bg-[var(--glass-bg)] backdrop-blur-xl border-[var(--glass-border)] shadow-[var(--shadow-md)]">
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="flex flex-col gap-1">
                  <CardTitle className="text-[13px] font-medium text-[var(--text-primary)] uppercase tracking-widest flex items-center gap-2">
                    <Wrench className="size-4 text-[var(--accent)]" />
                    My Active Assignments
                  </CardTitle>
                  <p className="text-[10px] text-[var(--text-muted)]">Incidents currently assigned to you for resolution</p>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => router.push('/engineer')}
                  className="h-8 text-[var(--accent)] hover:text-[var(--accent)] hover:bg-[var(--accent)]/10 text-[10px] uppercase tracking-widest gap-2 font-bold"
                >
                  <ArrowRight className="size-3.5" />
                  My Workroom
                </Button>
              </CardHeader>
              <CardContent>
                {myIncidents.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {myIncidents.slice(0, 4).map(inc => (
                      <div 
                        key={inc.incidentNumber}
                        className={cn(
                          "p-3 rounded-[var(--radius-md)] bg-[var(--glass-hover)] border transition-all cursor-pointer flex flex-col gap-2 relative overflow-hidden group",
                          // Apply distinct visual style for STALE incidents (>12h)
                          inc.isStale 
                            ? "border-[var(--alarm-major)]/50 shadow-[0_0_12px_var(--alarm-major)]/10" 
                            : "border-[var(--glass-border)] hover:border-[var(--accent)]"
                        )}
                        onClick={() => router.push(`/engineer?incident=${inc.incidentNumber}`)}
                      >
                        {/* Stale Badge overlay */}
                        {inc.isStale && (
                          <div className="absolute top-0 right-0 px-2 py-0.5 bg-[var(--alarm-major)] text-white text-[8px] font-bold uppercase tracking-tighter rounded-bl-md z-10 animate-pulse">
                            Stale Task
                          </div>
                        )}

                        <div className="flex items-center justify-between">
                          <span className="text-[12px] font-bold text-[var(--text-primary)]">{inc.incidentNumber}</span>
                          <span className={cn(
                            "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest",
                            inc.priority.includes('1') || inc.priority.includes('2') 
                              ? "bg-[var(--alarm-critical)]/20 text-[var(--alarm-critical)]" 
                              : "bg-[var(--accent)]/20 text-[var(--accent)]"
                          )}>
                            {inc.priority.split('-')[1] || inc.priority}
                          </span>
                        </div>
                        <div className="text-[11px] text-[var(--text-secondary)] line-clamp-1">{inc.impact}</div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-[10px] font-mono text-[var(--text-muted)]">{(inc.siteIds || [inc.siteId]).slice(0, 3).join(', ')}{ (inc.siteIds?.length > 3) ? '...' : ''}</span>
                          <span className={cn(
                            "text-[10px] font-medium",
                            inc.isStale ? "text-[var(--alarm-major)]" : "text-[var(--text-muted)]"
                          )}>
                            {relTime(inc.submitDate)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center">
                    <CheckCircle2 className="size-8 text-[var(--alarm-ok)] mx-auto mb-2 opacity-20" />
                    <p className="text-[11px] text-[var(--text-muted)] uppercase tracking-widest font-mono">No active assignments</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Weather Impact Analysis */}
        <motion.div variants={itemVariants}>
          <Card className="bg-[var(--glass-bg)] backdrop-blur-xl border-[var(--glass-border)] shadow-[var(--shadow-md)]">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="flex flex-col gap-1">
                <CardTitle className="text-[13px] font-medium text-[var(--text-primary)] uppercase tracking-widest flex items-center gap-2">
                  <Cloud className="size-4 text-[var(--accent)]" />
                  Regional Weather Impact
                </CardTitle>
                <p className="text-[10px] text-[var(--text-muted)]">Live weather influence on network reliability across Romania</p>
              </div>
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--bg-muted)] border border-[var(--glass-border)]">
                <Thermometer className="size-3 text-[var(--text-muted)]" />
                <span className="text-[10px] font-mono text-[var(--text-secondary)]">
                  {weatherDetails.length > 0
                    ? `AVG ${Math.round(weatherDetails.reduce((s, w) => s + w.temp, 0) / weatherDetails.length)}°C`
                    : 'Loading…'}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <div 
                ref={scrollRef}
                className="flex gap-4 mt-2 overflow-x-auto pb-4 scrollbar-hide select-none active:cursor-grabbing"
                onMouseEnter={() => setIsAutoScrolling(false)}
                onMouseLeave={() => setIsAutoScrolling(true)}
                onTouchStart={() => setIsAutoScrolling(false)}
              >
                {weatherDetails.length === 0 ? (
                  <div className="flex items-center gap-2 py-6 px-2 text-[11px] font-mono text-[var(--text-muted)] animate-pulse uppercase tracking-widest">
                    Loading weather data…
                  </div>
                ) : [...weatherDetails, ...weatherDetails].map((w, idx) => {
                  const Icon = weatherIcons[w.condition] ?? Cloud
                  return (
                    <div
                      key={`${w.city}-${idx}`}
                      onClick={() => setSelectedCity(w)}
                      className="min-w-[240px] p-3 rounded-[var(--radius-md)] bg-[var(--glass-hover)] border border-[var(--glass-border)] flex flex-col gap-3 group hover:border-[var(--accent)] transition-all cursor-pointer"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                          <span className="text-[12px] font-bold text-[var(--text-primary)]">{w.city}</span>
                          <span className="text-[9px] text-[var(--text-muted)] uppercase tracking-tighter">{w.region}</span>
                        </div>
                        <Icon className="size-5 text-[var(--text-secondary)] group-hover:text-[var(--accent)] transition-colors" />
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <span className="text-[14px] font-mono font-bold text-[var(--text-primary)]">{w.temp}°C</span>
                        <div 
                          className="px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-widest"
                          style={{ 
                            backgroundColor: `${riskColors[w.risk]}22`,
                            color: riskColors[w.risk],
                            border: `1px solid ${riskColors[w.risk]}44`
                          }}
                        >
                          {w.risk} risk
                        </div>
                      </div>
                      
                      <p className="text-[9px] text-[var(--text-muted)] leading-tight">
                        {w.description}
                      </p>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* City Sites Popup */}
        <Dialog open={!!selectedCity} onOpenChange={(open) => !open && setSelectedCity(null)}>
          <DialogContent className="max-w-2xl bg-[var(--bg-overlay)] border-[var(--glass-border)] backdrop-blur-2xl">
            <DialogHeader>
              <DialogTitle className="text-[18px] font-bold text-[var(--text-primary)] flex items-center gap-2">
                <MapPin className="size-5 text-[var(--accent)]" />
                Infrastructure Status: {selectedCity?.city}
              </DialogTitle>
              <DialogDescription className="text-[12px] text-[var(--text-muted)]">
                Network health and site distribution in the {selectedCity?.region} region.
              </DialogDescription>
            </DialogHeader>
            
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-[var(--radius-md)] bg-[var(--bg-muted)] border border-[var(--glass-border)]">
                  <span className="block text-[9px] text-[var(--text-muted)] uppercase tracking-widest mb-1">Temperature</span>
                  <span className="text-lg font-mono font-bold text-[var(--text-primary)]">{selectedCity?.temp}°C</span>
                </div>
                <div className="p-3 rounded-[var(--radius-md)] bg-[var(--bg-muted)] border border-[var(--glass-border)]">
                  <span className="block text-[9px] text-[var(--text-muted)] uppercase tracking-widest mb-1">Impact Risk</span>
                  <span 
                    className="text-lg font-bold uppercase tracking-tight"
                    style={{ color: selectedCity ? riskColors[selectedCity.risk] : '' }}
                  >
                    {selectedCity?.risk}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">Regional Sites</h3>
                <div className="max-h-[300px] overflow-y-auto pr-2 space-y-2 scrollbar-hide">
                  {antennas
                    .filter(a => {
                      if (!selectedCity) return false;
                      return cityForAntenna(a.latitude, a.longitude) === selectedCity.city
                    })
                    .map(a => {
                      const status = getWorstStatus(a);
                      return (
                        <div key={a.id} className="flex items-center justify-between p-3 rounded-[var(--radius-md)] bg-[var(--glass-hover)] border border-[var(--glass-border)] group hover:border-[var(--accent)] transition-all">
                          <div className="flex items-center gap-3">
                            <div 
                              className="size-2 rounded-full animate-pulse"
                              style={{ backgroundColor: getCSSVar(sevColorVar[status]) }}
                            />
                            <div className="flex flex-col">
                              <span className="text-[12px] font-semibold text-[var(--text-primary)]">{a.name}</span>
                              <span className="text-[10px] font-mono text-[var(--text-muted)]">{a.siteId}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="flex -space-x-1">
                              {a.cells.map((c, idx) => (
                                <div 
                                  key={idx}
                                  className="size-3 rounded-full border border-[var(--bg-base)]"
                                  style={{ backgroundColor: getCSSVar(techColorVar[c.technology]) }}
                                  title={c.technology}
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  
                  {selectedCity && antennas.filter(a =>
                    cityForAntenna(a.latitude, a.longitude) === selectedCity.city
                  ).length === 0 && (
                    <div className="py-8 text-center border border-dashed border-[var(--glass-border)] rounded-[var(--radius-md)]">
                      <p className="text-[11px] text-[var(--text-muted)] font-mono uppercase tracking-widest">
                        No active sites tracked in this sector
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        {/* AI Intelligence Report */}
        {(weatherDetails.length > 0 || aiPrediction || loadingAi) && (
            <motion.div variants={itemVariants}>
              <Card className="bg-[var(--glass-bg)] backdrop-blur-xl border-[var(--border-accent)] shadow-[var(--shadow-glow)] overflow-hidden relative min-h-[180px]">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[var(--accent)] to-transparent opacity-50" />
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <div className="flex flex-col gap-1">
                    <CardTitle className="text-[13px] font-medium text-[var(--accent-bright)] uppercase tracking-widest flex items-center gap-2">
                      <Zap className="size-4 animate-pulse" />
                      AI Network Intelligence
                    </CardTitle>
                    <p className="text-[10px] text-[var(--text-muted)] font-mono">Gemini · Predictive Outage Analysis</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {loadingAi ? (
                        <div className="flex items-center gap-2 text-[10px] text-[var(--accent-bright)] font-mono animate-pulse">
                          <Activity className="size-3" />
                          ANALYZING...
                        </div>
                    ) : (
                      <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={() => fetchAiPrediction(weatherDetails)}
                        className="flex items-center gap-2 px-2.5 py-1 rounded-[var(--radius-md)] border border-[var(--border-accent)] bg-[var(--accent-dim)] text-[var(--accent-bright)] text-[10px] font-bold uppercase tracking-widest hover:bg-[var(--accent)] hover:text-white transition-all cursor-pointer"
                      >
                        <RefreshCw className="size-3" />
                        Retry
                      </motion.button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {aiError && !loadingAi && !aiPrediction ? (
                      <div className="py-10 flex flex-col items-center justify-center gap-3">
                        <ShieldAlert className="size-6 text-[var(--alarm-major)]" />
                        <p className="text-[12px] font-mono text-[var(--text-muted)] text-center">
                          AI analysis unavailable. Check your API key or network connection.
                        </p>
                      </div>
                  ) : loadingAi && !aiPrediction ? (
                      <div className="py-12 flex flex-col items-center justify-center gap-4">
                        <div className="flex items-center gap-1.5">
                          {[1,2,3,4].map(i => (
                              <motion.div
                                  key={i}
                                  animate={{ opacity: [0.3, 1, 0.3], scale: [0.9, 1.1, 0.9] }}
                                  transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
                                  className="size-1.5 bg-[var(--accent-bright)] rounded-full shadow-[0_0_8px_var(--accent)]"
                              />
                          ))}
                        </div>
                        <span className="text-[11px] font-mono text-[var(--text-muted)] uppercase tracking-widest animate-pulse">Consulting Gemini Expert...</span>
                      </div>
                  ) : aiPrediction && (
                      <div className="space-y-5">
                        <div className="bg-[var(--accent-dim)] p-4 rounded-[var(--radius-md)] border border-[var(--border-accent)]/30">
                          <p className="text-[14px] text-[var(--text-primary)] leading-relaxed italic">
                            {aiPrediction.outlook}
                          </p>
                        </div>

                        {aiPrediction.riskZones.length > 0 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {aiPrediction.riskZones.map((zone, i) => (
                                  <div key={i} className="flex flex-col gap-1.5 p-3 rounded-[var(--radius-sm)] bg-[var(--bg-subtle)] border border-[var(--glass-border)]">
                                    <div className="flex items-center justify-between">
                                      <span className="text-[12px] font-bold text-[var(--text-primary)]">{zone.city}</span>
                                      <span className="text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded bg-[var(--alarm-critical)]/20 text-[var(--alarm-critical)] border border-[var(--alarm-critical)]/30">
                                {zone.severity}
                              </span>
                                    </div>
                                    <p className="text-[11px] text-[var(--text-secondary)] leading-snug">
                                      {zone.reason}
                                    </p>
                                  </div>
                              ))}
                            </div>
                        )}

                        <div className="flex items-start gap-3 pt-2 border-t border-[var(--glass-border)]">
                          <ShieldAlert className="size-4 text-[var(--alarm-major)] shrink-0 mt-0.5" />
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-bold text-[var(--alarm-major)] uppercase tracking-widest">NOC Recommendation</span>
                            <p className="text-[12px] text-[var(--text-primary)]">{aiPrediction.recommendation}</p>
                          </div>
                        </div>
                      </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
        )}

      </motion.div>
    </div>
  )
}
