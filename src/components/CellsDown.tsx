'use client'

import { useMemo } from 'react'
import { motion } from 'motion/react'
import type { Antenna, AlarmSeverity, Technology } from '@/types'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const severityRank: Record<AlarmSeverity, number> = {
  critical: 5,
  major: 4,
  minor: 3,
  warning: 2,
  ok: 1,
}

const severityConfig = {
  critical: { bg: 'rgba(240,79,79,0.12)',   border: 'rgba(240,79,79,0.3)',   text: 'var(--alarm-critical)' },
  major:    { bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.3)',  text: 'var(--alarm-major)' },
  minor:    { bg: 'rgba(251,191,36,0.12)',  border: 'rgba(251,191,36,0.3)',  text: 'var(--alarm-minor)' },
  warning:  { bg: 'rgba(96,165,250,0.12)',  border: 'rgba(96,165,250,0.3)',  text: 'var(--alarm-warning)' },
  ok:       { bg: 'rgba(52,211,153,0.12)',  border: 'rgba(52,211,153,0.3)',  text: 'var(--alarm-ok)' },
}

function getWorstStatus(antenna: Antenna): { technology: Technology, status: AlarmSeverity } {
  if (!antenna.cells || antenna.cells.length === 0) return { technology: '4G', status: 'ok' }
  const worst = antenna.cells.reduce((prev, curr) => 
    severityRank[curr.status] > severityRank[prev.status] ? curr : prev
  )
  return { technology: worst.technology, status: worst.status }
}

interface CellsDownProps {
  antennas: Antenna[]
  selectedId: string | null
  onSelect: (antenna: Antenna) => void
}

export function CellsDown({ antennas, selectedId, onSelect }: CellsDownProps) {
  // Focus only on Critical and Major outages for this high-level widget
  const criticalSites = useMemo(() => {
    return antennas
      .map(antenna => ({
        ...antenna,
        worst: getWorstStatus(antenna)
      }))
      .filter(site => site.worst.status === 'critical' || site.worst.status === 'major')
      .sort((a, b) => severityRank[b.worst.status] - severityRank[a.worst.status])
  }, [antennas])

  const itemVariants = {
    hidden: { opacity: 0, y: 10, filter: 'blur(4px)' },
    visible: { opacity: 1, y: 0, filter: 'blur(0px)' }
  }

  return (
    <Card className="bg-[var(--glass-bg)] backdrop-blur-xl border border-[var(--glass-border)] rounded-[var(--radius-lg)] shadow-[var(--shadow-md)]">
      <CardHeader className="pb-3 border-b border-[var(--glass-border)]">
        <div className="flex items-center justify-between">
          <CardTitle className="text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-widest font-sans">
            Critical Cells Down
          </CardTitle>
          <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-[var(--accent-dim)] text-[var(--accent)] border border-[var(--border-accent)]">
            {criticalSites.length} SITES
          </span>
        </div>
      </CardHeader>
      
      <CardContent className="p-0 max-h-[400px] overflow-y-auto">
        {criticalSites.length === 0 ? (
          <div className="p-8 text-center">
            <span className="text-[12px] text-[var(--text-muted)] italic">
              All systems nominal. No critical outages.
            </span>
          </div>
        ) : (
          <motion.div 
            initial="hidden"
            animate="visible"
            transition={{ staggerChildren: 0.05 }}
            className="flex flex-col"
          >
            {criticalSites.map((site) => {
              const config = severityConfig[site.worst.status]
              const isSelected = selectedId === site.id

              return (
                <motion.div
                  key={site.id}
                  variants={itemVariants}
                  onClick={() => onSelect(site)}
                  className={cn(
                    "group flex items-center justify-between p-3 border-b border-[var(--glass-border)] last:border-0 cursor-pointer transition-all duration-200",
                    isSelected ? "bg-[var(--glass-hover)]" : "hover:bg-[var(--glass-hover)]"
                  )}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[11px] font-mono text-[var(--text-muted)] tracking-tighter">
                      {site.siteId}
                    </span>
                    <span className="text-[13px] font-medium text-[var(--text-primary)] leading-tight">
                      {site.name}
                    </span>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] font-mono text-[var(--text-secondary)]">
                        {site.worst.technology}
                      </span>
                      <div className="w-1 h-1 rounded-full bg-[var(--text-muted)] opacity-30" />
                      <span className="text-[10px] font-mono text-[var(--text-secondary)] uppercase">
                        {site.provider}
                      </span>
                    </div>
                  </div>

                  <div 
                    className="px-2.5 py-1 rounded-full border flex flex-col items-center min-w-[70px] transition-transform group-hover:scale-105"
                    style={{ 
                      backgroundColor: config.bg, 
                      borderColor: config.border,
                      color: config.text
                    }}
                  >
                    <span className="text-[9px] font-bold uppercase tracking-widest leading-none mb-0.5">
                      {site.worst.status}
                    </span>
                    <span className="text-[10px] font-mono opacity-80 leading-none">
                      DOWN
                    </span>
                  </div>
                </motion.div>
              )
            })}
          </motion.div>
        )}
      </CardContent>
    </Card>
  )
}
