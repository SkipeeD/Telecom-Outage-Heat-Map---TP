'use client'

import dynamic from 'next/dynamic'
import type { Antenna, Technology, AlarmSeverity } from '@/types'
import type { CityWeatherDetail } from '@/app/api/weather/route'

/** Props forwarded to the underlying MapClient component. */
export interface MapProps {
  antennas: Antenna[]
  selectedId?: string | null
  focusAntennaId?: string | null
  activeFilters?: {
    technologies?: Technology[]
    severities?: AlarmSeverity[]
  }
  weatherRisk?: Record<string, boolean>
  weatherDetails?: CityWeatherDetail[]
  onAntennaClick: (antenna: Antenna, anchorEl: Element) => void
}

// MapClient uses Leaflet which accesses `window` — must be imported with ssr:false
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

/**
 * Thin wrapper that re-exports MapClient with SSR disabled.
 * Keeping this as a separate file lets `map/page.tsx` use `dynamic()` on it
 * without inlining a second dynamic import, and makes the SSR boundary explicit.
 */
export default function Map({ antennas, selectedId, focusAntennaId, activeFilters, weatherRisk, weatherDetails, onAntennaClick }: MapProps) {
  return (
    <MapWithNoSSR
      antennas={antennas}
      selectedId={selectedId}
      focusAntennaId={focusAntennaId}
      activeFilters={activeFilters}
      weatherRisk={weatherRisk}
      weatherDetails={weatherDetails}
      onAntennaClick={onAntennaClick}
    />
  )
}
