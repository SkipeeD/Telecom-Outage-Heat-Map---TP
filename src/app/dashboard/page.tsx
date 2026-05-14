'use client'

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { motion } from 'motion/react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area
} from 'recharts'
import { incidentMatchesAlarm, subscribeToAntennas } from '@/lib/firestore'
import { useAuth } from '@/components/AuthProvider'
import { useTheme } from '@/hooks/useTheme'
import type { Antenna, AlarmSeverity, Technology, Alarm, DashboardSummary, Incident } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useRouter } from 'next/navigation'
import {
  Activity, ShieldAlert, CheckCircle2, Zap, Globe, Download, Clock, History,
  ArrowRight, Cloud, CloudRain, Sun, Wind, Thermometer, LucideIcon, MapPin, Users, RefreshCw
} from 'lucide-react'
import { TECHS, sevColorVar, techColorVar, relTime, formatDuration } from '@/lib/antenna-helpers'
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
  const { user, loading: authLoading } = useAuth()
  const { theme } = useTheme()
  const router = useRouter()
  const [antennas, setAntennas] = useState<Antenna[]>([])
  const [resolvedAlarms, setResolvedAlarms] = useState<Alarm[]>([])
  const [longLivedAlarms, setLongLivedAlarms] = useState<Alarm[]>([])
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [timeRange, setTimeRange] = useState<'30d' | '3m' | '6m' | '1y'>('30d')
  
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

  useEffect(() => {
    if (!user) return
    const unsubAntennas = subscribeToAntennas(setAntennas)
    return () => unsubAntennas()
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
        setLongLivedAlarms(summary.longLivedAlarms)
        setIncidents(summary.incidents)
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

    antennas.forEach(a => {
      const status = getWorstStatus(a)
      severityCount[status]++
      if (status === 'ok') ok++
      else alarms++

      // Count worst tech for alarms
      if (status !== 'ok' && a.cells.length > 0) {
        const worstCell = a.cells.reduce((prev, curr) => 
          severityRank[curr.status] > severityRank[prev.status] ? curr : prev
        )
        techCount[worstCell.technology]++
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

    const dailyStats: Record<string, { ts: number; created: number; resolved: number }> = {}
    incidents.forEach(i => {
      const submitTs = new Date(i.submitDate).getTime()
      if (submitTs < cutoff) return
      const label = dateLabel(i.submitDate)
      if (!dailyStats[label]) dailyStats[label] = { ts: submitTs, created: 0, resolved: 0 }
      dailyStats[label].created++
      if ((i.status === 'RESOLVED' || i.status === 'CLOSED') && (i.resolvedDate || i.closedDate)) {
        const resLabel = dateLabel(i.resolvedDate || i.closedDate!)
        if (!dailyStats[resLabel]) dailyStats[resLabel] = { ts: new Date(i.resolvedDate || i.closedDate!).getTime(), created: 0, resolved: 0 }
        dailyStats[resLabel].resolved++
      }
    })

    const resolvedChartData = Object.entries(dailyStats)
      .map(([date, { ts, created, resolved }]) => ({ date, ts, created, resolved }))
      .sort((a, b) => a.ts - b.ts)
      .map(({ date, created, resolved }) => ({ date, created, resolved }))

    return { total, alarms, ok, pieData, barData, resolvedChartData }
  }, [antennas, incidents, timeRange])

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

  const longestActive = useMemo(() => {
    let oldest: (Alarm & { antennaName: string }) | null = null
    for (const a of antennas) {
      for (const c of a.cells || []) {
        if (!c.currentAlarm || c.currentAlarm.resolved) continue
        if (!oldest || new Date(c.currentAlarm.alarmTime) < new Date(oldest.alarmTime)) {
          oldest = { ...c.currentAlarm, antennaName: a.name }
        }
      }
    }
    return oldest
  }, [antennas])

  if (authLoading) return null

  const activeAlerts = antennas
    .flatMap(a => (a.cells || [])
      .filter(c => c.currentAlarm && !c.currentAlarm.resolved)
      .map(c => {
        const alarm = c.currentAlarm!
        const incident = incidents.find(i => incidentMatchesAlarm(i, alarm))
        return { ...alarm, antennaName: a.name, incident }
      })
    )
    .sort((a, b) => new Date(b.alarmTime).getTime() - new Date(a.alarmTime).getTime())
    .slice(0, 8)

  return (
    <div className="min-h-full bg-[var(--bg-base)] p-6 md:p-8 transition-colors duration-300">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="max-w-7xl mx-auto space-y-8"
      >
        {/* Header */}
        <motion.div variants={itemVariants} className="flex flex-col gap-1">
          <h1 className="text-[28px] font-semibold text-[var(--text-primary)]">
            Network Operations Center
          </h1>
          <p className="text-[14px] text-[var(--text-secondary)]">
            Real-time infrastructure health and outage monitoring dashboard.
          </p>
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
                        color: '#ffffff',
                        fontSize: '12px',
                        fontFamily: 'var(--font-mono)',
                      }}
                      itemStyle={{ color: '#ffffff' }}
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
                        color: '#ffffff',
                        fontSize: '12px',
                        fontFamily: 'var(--font-mono)',
                      }}
                      itemStyle={{ color: '#ffffff' }}
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
                  <Tooltip
                    contentStyle={{
                      background: getCSSVar('--bg-overlay'),
                      border: `1px solid ${getCSSVar('--glass-border')}`,
                      borderRadius: 'var(--radius-md)',
                      color: '#ffffff',
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                    }}
                    itemStyle={{ color: '#ffffff' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="created"
                    stroke={getCSSVar('--alarm-major')}
                    fillOpacity={1}
                    fill="url(#colorCreated)"
                    strokeWidth={2}
                    name="Incidents"
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
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>

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
                                  <div key={i} className="flex flex-col gap-1.5 p-3 rounded-[var(--radius-sm)] bg-black/20 border border-[var(--glass-border)]">
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

        {/* Chronic Alarms */}
        <motion.div variants={itemVariants}>
          <Card className="bg-[var(--glass-bg)] backdrop-blur-xl border-[var(--glass-border)] shadow-[var(--shadow-md)]">
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="flex flex-col gap-1">
                <CardTitle className="text-[13px] font-medium text-[var(--text-primary)] uppercase tracking-widest flex items-center gap-2">
                  <Clock className="size-4 text-[var(--alarm-major)]" />
                  Chronic Alarms
                </CardTitle>
                <p className="text-[10px] text-[var(--text-muted)]">Resolved alarms active for more than 24 hours</p>
              </div>
            </CardHeader>
            <CardContent>
              {longestActive && (
                <div
                  className="flex items-center gap-3 rounded-[var(--radius-md)] px-4 py-3 mb-4 text-[12px]"
                  style={{
                    background: 'rgba(240,79,79,0.08)',
                    border: '1px solid rgba(240,79,79,0.25)',
                  }}
                >
                  <div className="size-2 rounded-full animate-pulse bg-[var(--alarm-critical)]" />
                  <span className="text-[var(--alarm-critical)] font-semibold">{longestActive.antennaName}</span>
                  <span className="text-[var(--text-muted)] font-mono text-[10px]">{longestActive.siteId} · {longestActive.technology}</span>
                  <span className="text-[var(--text-secondary)] ml-auto font-mono text-[10px]">
                    Active since {relTime(longestActive.alarmTime)}
                  </span>
                </div>
              )}
              {longLivedAlarms.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px] font-mono">
                    <thead>
                      <tr className="text-[var(--text-muted)] uppercase tracking-widest text-[9px] border-b border-[var(--glass-border)]">
                        <th className="text-left pb-2 pr-4">Site</th>
                        <th className="text-left pb-2 pr-4">Tech</th>
                        <th className="text-left pb-2 pr-4">Severity</th>
                        <th className="text-left pb-2 pr-4">Alarm</th>
                        <th className="text-right pb-2">Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {longLivedAlarms.map((alarm) => {
                        const ms = alarm.durationMs ?? 0
                        const durationColor =
                          ms >= 3 * 24 * 60 * 60_000
                            ? 'var(--alarm-critical)'
                            : ms >= 1 * 24 * 60 * 60_000
                            ? 'var(--alarm-major)'
                            : 'var(--text-secondary)'
                        return (
                          <tr
                            key={alarm.id}
                            className="border-b border-[var(--glass-border)] last:border-0 hover:bg-[var(--glass-hover)] transition-colors"
                          >
                            <td className="py-2.5 pr-4 text-[var(--text-primary)]">{alarm.siteId}</td>
                            <td className="py-2.5 pr-4 text-[var(--text-secondary)]">{alarm.technology}</td>
                            <td className="py-2.5 pr-4">
                              <span
                                className="px-1.5 py-0.5 rounded text-[9px] uppercase tracking-widest font-bold"
                                style={{
                                  color: getCSSVar(sevColorVar[alarm.severity]),
                                  background: `${getCSSVar(sevColorVar[alarm.severity])}22`,
                                }}
                              >
                                {alarm.severity}
                              </span>
                            </td>
                            <td className="py-2.5 pr-4 text-[var(--text-muted)] max-w-[280px] truncate">{alarm.text}</td>
                            <td className="py-2.5 text-right font-bold" style={{ color: durationColor }}>
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
                    No chronic alarms in the last 24h
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
        

        {/* System Logs / Recent Alerts */}
        <motion.div variants={itemVariants}>
          <Card className="bg-[var(--glass-bg)] backdrop-blur-xl border-[var(--glass-border)] shadow-[var(--shadow-md)]">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-[13px] font-medium text-[var(--text-primary)] uppercase tracking-widest">
                Live Network Alerts
              </CardTitle>
              <Activity className="size-4 text-[var(--alarm-critical)] animate-pulse" />
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {activeAlerts.map((alarm) => {
                  const assignees = alarm.incident?.assignees ?? []
                  const alarmAntenna = antennas.find(a =>
                    (a.cells || []).some(c => c.currentAlarm?.id === alarm.id)
                  )
                  const alarmCity = alarmAntenna
                    ? cityForAntenna(alarmAntenna.latitude, alarmAntenna.longitude)
                    : null
                  const cityWeather = alarmCity
                    ? weatherDetails.find(w => w.city === alarmCity)
                    : null

                  return (
                   <div key={alarm.id} className="flex items-center justify-between py-3 border-b border-[var(--glass-border)] last:border-0 hover:bg-[var(--glass-hover)] transition-colors px-2 rounded-[var(--radius-md)] group">
                      <div className="flex items-center gap-4">
                        <div
                          className="size-2 rounded-full animate-pulse"
                          style={{ backgroundColor: getCSSVar(sevColorVar[alarm.severity]) }}
                        />
                        <div className="flex flex-col">
                          <span className="text-[12px] font-semibold text-[var(--text-primary)]">{alarm.antennaName}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono text-[var(--text-muted)]">{alarm.siteId}</span>
                            <span className="text-[10px] text-[var(--text-muted)]">•</span>
                            <span className="text-[10px] font-mono text-[var(--text-muted)]">{alarm.technology}</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-6">
                        {/* Weather Widget */}
                        {cityWeather && (
                          <div className="hidden lg:flex items-center gap-2 px-2 py-1 rounded-md bg-[var(--accent-dim)] border border-[var(--border-accent)]">
                            {(() => {
                              const Icon = weatherIcons[cityWeather.condition] ?? Cloud
                              return (
                                <>
                                  <Icon className="size-3 text-[var(--accent-bright)]" />
                                  <span className="text-[9px] font-mono font-medium text-[var(--accent-bright)]">{cityWeather.temp}°C</span>
                                </>
                              )
                            })()}
                          </div>
                        )}

                        <div className="hidden md:flex flex-col items-end">
                          <span className="text-[11px] text-[var(--text-primary)] max-w-[250px] truncate text-right">
                            {alarm.text}
                          </span>
                          <div className="flex items-center gap-1.5 mt-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                            <Clock className="size-3 text-[var(--text-muted)]" />
                            <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-tighter">
                              Started {relTime(alarm.alarmTime)}
                            </span>
                          </div>
                          <div className="flex items-center justify-end gap-2 mt-1">
                            <Users className="size-3 text-[var(--alarm-ok)]" />
                            {assignees.length === 0 ? (
                              <span className="text-[10px] font-mono text-[var(--text-muted)] italic">
                                No engineers assigned
                              </span>
                            ) : (
                              <div className="flex items-center -space-x-1.5">
                                {assignees.slice(0, 4).map((assignee, index) => {
                                  const label = assignee.displayName ?? assignee.email.split('@')[0]
                                  const initials = label.slice(0, 2).toUpperCase()

                                  return (
                                    <div
                                      key={assignee.uid}
                                      title={assignee.email}
                                      className="w-6 h-6 rounded-full flex items-center justify-center font-mono text-[9px] font-bold ring-2 ring-[var(--bg-base)]"
                                      style={{
                                        background: 'color-mix(in srgb, var(--alarm-ok) 15%, var(--bg-subtle))',
                                        color: 'var(--alarm-ok)',
                                        border: '1px solid rgba(52,211,153,0.3)',
                                        zIndex: assignees.length - index,
                                      }}
                                    >
                                      {initials}
                                    </div>
                                  )
                                })}
                                {assignees.length > 4 && (
                                  <div
                                    className="w-6 h-6 rounded-full flex items-center justify-center font-mono text-[8px] font-bold ring-2 ring-[var(--bg-base)]"
                                    style={{
                                      background: 'var(--bg-subtle)',
                                      color: 'var(--text-muted)',
                                      border: '1px solid var(--glass-border)',
                                    }}
                                  >
                                    +{assignees.length - 4}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        
                        <div 
                          className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest min-w-[80px] text-center"
                          style={{ 
                            backgroundColor: `${getCSSVar(sevColorVar[alarm.severity])}22`,
                            color: getCSSVar(sevColorVar[alarm.severity]),
                            border: `1px solid ${getCSSVar(sevColorVar[alarm.severity])}44`
                          }}
                        >
                          {alarm.severity}
                        </div>
                      </div>
                   </div>
                  )
                })}
                {activeAlerts.length === 0 && (
                  <div className="py-12 text-center">
                    <CheckCircle2 className="size-10 text-[var(--alarm-ok)] mx-auto mb-3 opacity-20" />
                    <p className="text-[13px] text-[var(--text-muted)] font-mono uppercase tracking-widest">
                      Network status: All systems nominal
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </div>
  )
}
