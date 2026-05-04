'use client'

const EASE: [number, number, number, number] = [0.4, 0, 0.2, 1]

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { motion } from 'motion/react'
import { subscribeToAntennas } from '@/lib/firestore'
import { useAuth } from '@/components/AuthProvider'
import { useFilters, FilterSeverity } from '@/components/FilterProvider'
import type { Antenna, AlarmSeverity, Technology } from '@/types'
import { AntennaPopup } from '@/components/antenna/AntennaPopup'
import { AntennaDetailsPanel } from '@/components/antenna/AntennaDetailsPanel'

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
  const [popupAntenna, setPopupAntenna] = useState<Antenna | null>(null)
  const [popupAnchor, setPopupAnchor] = useState<Element | null>(null)
  const [detailsAntenna, setDetailsAntenna] = useState<Antenna | null>(null)
  const [detailsTech, setDetailsTech] = useState<Technology | null>(null)

  useEffect(() => {
    if (!user) return

    const unsubscribe = subscribeToAntennas((data) => {
      setAntennas(data)
      
      const newCounts: Record<FilterSeverity, number> = {
        all: 0,
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
        // 'all' now only shows sites with alarms
        if (status !== 'ok') {
          newCounts.all++
        }
      })
      
      setCounts(newCounts)
    })
    return () => unsubscribe()
  }, [user, setCounts])

  const handleAntennaClick = (antenna: Antenna, anchorEl: Element) => {
    const isDeselecting = selectedId === antenna.id
    setSelectedId(isDeselecting ? null : antenna.id)
    if (isDeselecting) {
      setPopupAntenna(null)
      setPopupAnchor(null)
    } else {
      setPopupAntenna(antenna)
      setPopupAnchor(anchorEl)
    }
  }

  const handlePopupClose = () => {
    setSelectedId(null)
    setPopupAntenna(null)
    setPopupAnchor(null)
  }

  const handleOpenDetails = (antenna: Antenna, tech: Technology) => {
    setDetailsAntenna(antenna)
    setDetailsTech(tech)
    setPopupAntenna(null)
    setPopupAnchor(null)
  }

  const handleDetailsClose = () => {
    setDetailsAntenna(null)
    setDetailsTech(null)
    setSelectedId(null)
  }

  if (authLoading) return null

  const activeFilters = {
    severities: selectedSeverity === 'all' 
      ? ['critical', 'major', 'minor', 'warning'] as AlarmSeverity[]
      : [selectedSeverity as AlarmSeverity]
  }

  return (
    <div className="flex h-screen bg-[var(--bg-base)] overflow-hidden transition-colors duration-300">

      {/* Map Area */}
      <motion.div
        className="flex-1 relative min-w-0"
        initial={{ opacity: 0, filter: 'blur(4px)' }}
        animate={{ opacity: 1, filter: 'blur(0px)' }}
        transition={{ duration: 0.45, ease: EASE }}
      >
        <MapClient
          antennas={antennas}
          selectedId={selectedId}
          activeFilters={activeFilters}
          onAntennaClick={handleAntennaClick}
        />

      </motion.div>

      {popupAntenna && (
        <AntennaPopup
          antenna={popupAntenna}
          anchor={popupAnchor}
          open={!!popupAntenna}
          onClose={handlePopupClose}
          onOpenDetails={handleOpenDetails}
        />
      )}

      <AntennaDetailsPanel
        antenna={detailsAntenna ?? { id: '', name: '', siteId: '', provider: '', latitude: 0, longitude: 0, cells: [] }}
        initialTech={detailsTech ?? '4G'}
        open={!!detailsAntenna}
        onClose={handleDetailsClose}
      />
    </div>
  )
}
