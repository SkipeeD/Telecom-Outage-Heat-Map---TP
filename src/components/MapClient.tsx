'use client'

import { useEffect, useRef, useState, Suspense } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type { Antenna, Technology, AlarmSeverity } from '@/types'
import { MarkerLayer } from './MarkerLayer'
import { MapSearch } from './MapSearch'
import { WeatherOverlayToggle } from './WeatherOverlayToggle'
import { WeatherOverlay } from './WeatherOverlay'
import { useWeatherOverlay } from '@/hooks/useWeatherOverlay'
import type { CityWeatherDetail } from '@/app/api/weather/route'
import { useSearchParams } from 'next/navigation'

function ResizeHandler() {
  const map = useMap()
  useEffect(() => {
    const handleResize = () => map.invalidateSize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [map])
  return null
}

interface FlyTarget { lat: number; lon: number }

function FlyController({ target }: { target: FlyTarget | null }) {
  const map = useMap()
  useEffect(() => {
    if (!target) return
    map.flyTo([target.lat, target.lon], 14, { duration: 1.4 })
  }, [target, map])
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
  weatherDetails?: CityWeatherDetail[]
  onAntennaClick: (antenna: Antenna, anchorEl: Element) => void
}

function MapClientContent({ antennas, selectedId, activeFilters, weatherRisk, weatherDetails, onAntennaClick }: MapClientProps) {
  const { enabled: weatherOverlayOn, toggle: toggleWeatherOverlay } = useWeatherOverlay()
  const [flyTarget, setFlyTarget] = useState<FlyTarget | null>(null)
  const markerPathsRef = useRef(new Map<string, SVGElement>())
  const searchOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasInitialSelectedRef = useRef(false)
  const searchParams = useSearchParams()

  useEffect(() => {
    return () => {
      if (searchOpenTimerRef.current) clearTimeout(searchOpenTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (hasInitialSelectedRef.current || antennas.length === 0) return

    const siteId = searchParams.get('selectSite')
    const lat = searchParams.get('lat')
    const lon = searchParams.get('lon')

    if (siteId && lat && lon) {
      const antenna = antennas.find(a => a.id === siteId)
      if (antenna) {
        hasInitialSelectedRef.current = true
        handleSearchSelect(antenna)
      }
    }
  }, [antennas, searchParams])

  function handleSearchSelect(antenna: Antenna) {
    setFlyTarget({ lat: antenna.latitude, lon: antenna.longitude })
    if (searchOpenTimerRef.current) clearTimeout(searchOpenTimerRef.current)
    // flyTo duration is 1.4s — wait for it to finish then open popup
    searchOpenTimerRef.current = setTimeout(() => {
      const el = markerPathsRef.current.get(antenna.id)
      if (el) onAntennaClick(antenna, el)
    }, 1600)
  }

  return (
    <div className="absolute inset-0">
      <MapContainer
        center={[45.9, 24.9]}
        zoom={7}
        zoomControl={false}
        attributionControl={false}
        style={{ width: '100%', height: '100%', background: '#1a1a2e' }}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
          maxZoom={20}
          keepBuffer={6}
          updateWhenIdle={false}
        />
        <MarkerLayer
          antennas={antennas}
          selectedId={selectedId}
          activeFilters={activeFilters}
          weatherRisk={weatherOverlayOn ? weatherRisk : undefined}
          onAntennaClick={onAntennaClick}
          markerPathsRef={markerPathsRef}
        />
        <FlyController target={flyTarget} />
        <ResizeHandler />
        <WeatherOverlay enabled={weatherOverlayOn} details={weatherDetails ?? []} />
      </MapContainer>

      <MapSearch antennas={antennas} onSelect={handleSearchSelect} />

      <WeatherOverlayToggle enabled={weatherOverlayOn} onToggle={toggleWeatherOverlay} />
    </div>
  )
}

export default function MapClient(props: MapClientProps) {
  return (
    <Suspense fallback={null}>
      <MapClientContent {...props} />
    </Suspense>
  )
}
