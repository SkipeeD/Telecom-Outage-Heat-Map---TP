'use client'

import { useEffect } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { CloudRain, CloudOff } from 'lucide-react'
import type { Antenna, Technology, AlarmSeverity } from '@/types'
import { MarkerLayer } from './MarkerLayer'

function ResizeHandler() {
  const map = useMap()
  useEffect(() => {
    const handleResize = () => map.invalidateSize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [map])
  return null
}

interface MapClientProps {
  antennas: Antenna[]
  selectedId?: string | null
  activeFilters?: {
    technologies?: Technology[]
    severities?: AlarmSeverity[]
  }
  weatherRisk?: Record<string, boolean>
  onAntennaClick: (antenna: Antenna, anchorEl: Element) => void
}

export default function MapClient({ antennas, selectedId, activeFilters, weatherRisk, onAntennaClick }: MapClientProps) {
  const atRiskCount = Object.values(weatherRisk ?? {}).filter(Boolean).length

  return (
    <div className="absolute inset-0">
      <MapContainer
        center={[45.9, 24.9]}
        zoom={7}
        zoomControl={false}
        style={{ width: '100%', height: '100%', background: '#1a1a2e' }}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          subdomains="abcd"
          maxZoom={20}
          keepBuffer={6}
          updateWhenIdle={false}
        />
        <MarkerLayer
          antennas={antennas}
          selectedId={selectedId}
          activeFilters={activeFilters}
          weatherRisk={weatherRisk}
          onAntennaClick={onAntennaClick}
        />
        <ResizeHandler />
      </MapContainer>

      {/* Weather legend — fixed position to bypass any stacking context issues */}
      <div
        className="fixed bottom-6 left-6 pointer-events-none flex items-center gap-2 px-3 py-2
          rounded-[var(--radius-md)] border shadow-[var(--shadow-lg)]
          bg-[var(--bg-overlay)] border-[var(--glass-border)] backdrop-blur-md"
        style={{ zIndex: 10000 }}
      >
        {atRiskCount > 0 ? (
          <>
            <CloudRain className="size-3.5 shrink-0" style={{ color: '#f97316' }} />
            <span className="text-[11px] font-mono uppercase tracking-widest text-[var(--text-secondary)]">
              {atRiskCount} {atRiskCount === 1 ? 'city' : 'cities'} at risk
            </span>
            <span className="size-1.5 rounded-full shrink-0 animate-pulse" style={{ backgroundColor: '#f97316' }} />
          </>
        ) : (
          <>
            <CloudOff className="size-3.5 shrink-0 text-[var(--alarm-ok)]" />
            <span className="text-[11px] font-mono uppercase tracking-widest text-[var(--text-secondary)]">
              Weather nominal
            </span>
          </>
        )}
      </div>
    </div>
  )
}
