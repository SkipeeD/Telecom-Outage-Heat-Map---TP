'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { motion } from 'motion/react'
import { subscribeToAntennas } from '@/lib/firestore'
import { useAuth } from '@/components/AuthProvider'
import { useFilters, FilterSeverity } from '@/components/FilterProvider'
import type { Antenna, AlarmSeverity } from '@/types'

const MapClient = dynamic(() => import('@/app/map/Map'), { 
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[var(--bg-base)]">
      <span className="text-[var(--text-muted)] font-mono text-sm animate-pulse">
        Initializing map…
      </span>
    </div>
  )
})

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

export default function MapPage() {
  const { user, loading: authLoading } = useAuth()
  const { selectedSeverity, setCounts } = useFilters()
  const [antennas, setAntennas] = useState<Antenna[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return

    const unsubscribe = subscribeToAntennas((data) => {
      setAntennas(data)
      
      const newCounts: Record<FilterSeverity, number> = {
        all: data.length,
        critical: 0,
        major: 0,
        minor: 0,
        warning: 0,
        ok: 0
      }
      
      data.forEach(antenna => {
        const status = getWorstStatus(antenna)
        if (newCounts[status] !== undefined) {
          newCounts[status]++
        }
      })
      
      setCounts(newCounts)
    })
    return () => unsubscribe()
  }, [user, setCounts])

  const handleAntennaClick = (antenna: Antenna) => {
    setSelectedId(prev => (prev === antenna.id ? null : antenna.id))
  }

  if (authLoading) return null

  const activeFilters = {
    severities: selectedSeverity === 'all' ? [] : [selectedSeverity as AlarmSeverity]
  }

  return (
    <div className="flex h-screen bg-[var(--bg-base)] overflow-hidden transition-colors duration-300">
      
      {/* Map Area */}
      <div className="flex-1 relative min-w-0">
        <MapClient 
          antennas={antennas} 
          selectedId={selectedId}
          activeFilters={activeFilters}
          onAntennaClick={handleAntennaClick} 
        />
      </div>
    </div>
  )
}
