'use client'

import dynamic from 'next/dynamic'
import type { Antenna, Technology, AlarmSeverity } from '@/types'

export interface MapProps {
  antennas: Antenna[]
  selectedId?: string | null
  activeFilters?: {
    technologies?: Technology[]
    severities?: AlarmSeverity[]
  }
  weatherRisk?: Record<string, boolean>
  onAntennaClick: (antenna: Antenna, anchorEl: Element) => void
  onSearchSelect?: (antenna: Antenna) => void
}

const MapWithNoSSR = dynamic(() => import('../../components/MapClient'), {
  ssr: false,
  loading: () => (
    <div
      className="w-full h-full flex items-center justify-center bg-[var(--bg-base)]"
    >
      <span
        className="text-[var(--text-muted)] font-mono text-sm animate-pulse"
      >
        Loading map…
      </span>
    </div>
  ),
})

export default function Map({ antennas, selectedId, activeFilters, weatherRisk, onAntennaClick, onSearchSelect }: MapProps) {
  return (
    <MapWithNoSSR
      antennas={antennas}
      selectedId={selectedId}
      activeFilters={activeFilters}
      weatherRisk={weatherRisk}
      onAntennaClick={onAntennaClick}
      onSearchSelect={onSearchSelect}
    />
  )
}
