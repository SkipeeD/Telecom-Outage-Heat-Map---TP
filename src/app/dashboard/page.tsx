'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { motion } from 'motion/react'
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, LineChart, Line, Legend, AreaChart, Area
} from 'recharts'
import { subscribeToAntennas, subscribeToResolvedAlarms } from '@/lib/firestore'
import { useAuth } from '@/components/AuthProvider'
import { useTheme } from '@/hooks/useTheme'
import type { Antenna, AlarmSeverity, Technology, Alarm } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Activity, ShieldAlert, CheckCircle2, Zap, SignalHigh, Globe, Download, Clock, History } from 'lucide-react'
import { TECHS, sevColorVar, techColorVar, relTime } from '@/lib/antenna-helpers'
import { Button } from '@/components/ui/button'

const EASE: [number, number, number, number] = [0.4, 0, 0.2, 1]

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
  const [antennas, setAntennas] = useState<Antenna[]>([])
  const [resolvedAlarms, setResolvedAlarms] = useState<Alarm[]>([])

  useEffect(() => {
    if (!user) return
    const unsubAntennas = subscribeToAntennas(setAntennas)
    const unsubResolved = subscribeToResolvedAlarms(setResolvedAlarms)
    return () => {
      unsubAntennas()
      unsubResolved()
    }
  }, [user])

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

    // Process resolved alarms for trend
    const resolvedByDate: Record<string, number> = {}
    resolvedAlarms.forEach(a => {
      if (a.cancelTime) {
        const date = new Date(a.cancelTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        resolvedByDate[date] = (resolvedByDate[date] || 0) + 1
      }
    })

    const resolvedChartData = Object.entries(resolvedByDate)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-10)

    return { total, alarms, ok, pieData, barData, resolvedChartData }
  }, [antennas, resolvedAlarms])

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

  const activeAlerts = antennas
    .flatMap(a => (a.cells || [])
      .filter(c => c.currentAlarm && !c.currentAlarm.resolved)
      .map(c => ({ ...c.currentAlarm!, antennaName: a.name }))
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
            <Card className="bg-[var(--glass-bg)] backdrop-blur-xl border-[var(--glass-border)] shadow-[var(--shadow-md)]">
              <CardHeader>
                <CardTitle className="text-[13px] font-medium text-[var(--text-primary)] uppercase tracking-widest">
                  Alarm Severity Distribution
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
              <CardHeader>
                <CardTitle className="text-[13px] font-medium text-[var(--text-primary)] uppercase tracking-widest">
                  Affected Sites by Technology
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
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {stats.barData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={getCSSVar(entry.color)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Resolution Performance Chart & Export */}
        <motion.div variants={itemVariants}>
          <Card className="bg-[var(--glass-bg)] backdrop-blur-xl border-[var(--glass-border)] shadow-[var(--shadow-md)]">
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="flex flex-col gap-1">
                <CardTitle className="text-[13px] font-medium text-[var(--text-primary)] uppercase tracking-widest flex items-center gap-2">
                  <History className="size-4 text-[var(--alarm-ok)]" />
                  Resolution Performance
                </CardTitle>
                <p className="text-[10px] text-[var(--text-muted)]">Alarms resolved per day</p>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={exportResolvedToExcel}
                className="h-8 bg-[var(--glass-bg)] border-[var(--glass-border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-[10px] uppercase tracking-widest gap-2"
              >
                <Download className="size-3.5" />
                Export Solved (CSV)
              </Button>
            </CardHeader>
            <CardContent className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.resolvedChartData} key={`${theme}-resolved`} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorResolved" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={getCSSVar('--alarm-ok')} stopOpacity={0.3}/>
                      <stop offset="95%" stopColor={getCSSVar('--alarm-ok')} stopOpacity={0}/>
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
                    dataKey="count" 
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
                {activeAlerts.map((alarm, i) => (
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
                ))}
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
