'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type { Antenna, Technology, AlarmSeverity } from '@/types'
import { MarkerLayer } from './MarkerLayer'
import { MapSearch } from './MapSearch'
import { WeatherOverlayToggle } from './WeatherOverlayToggle'
import { WeatherOverlay } from './WeatherOverlay'
import { useWeatherOverlay } from '@/hooks/useWeatherOverlay'
import { useTheme } from '@/hooks/useTheme'
import type { CityWeatherDetail } from '@/app/api/weather/route'

/**
 * Leaflet child component that tells the map to recalculate its container size
 * on window resize. Without this, tiles do not fill the container after layout shifts.
 */
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

/**
 * Animates the map viewport to a new lat/lon whenever `target` changes.
 * Used by the search bar to pan to a selected antenna.
 */
function FlyController({ target }: { target: FlyTarget | null }) {
  const map = useMap()
  useEffect(() => {
    if (!target) return
    map.flyTo([target.lat, target.lon], 14, { duration: 1.4 })
  }, [target, map])
  return null
}

interface FocusControllerProps {
  antenna: Antenna | null
  markerPathsRef: RefObject<Map<string, SVGElement>>
  searchOpenTimerRef: RefObject<ReturnType<typeof setTimeout> | null>
  onAntennaClick: (antenna: Antenna, anchorEl: Element) => void
}

/**
 * Flies to an antenna driven by the `focusAntennaId` prop (e.g. from a deep-link
 * or notification click) and then opens its popup after the fly animation settles.
 * `focusedIdRef` prevents re-triggering if the same id is received again.
 */
function FocusController({ antenna, markerPathsRef, searchOpenTimerRef, onAntennaClick }: FocusControllerProps) {
  const map = useMap()
  const focusedIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!antenna || antenna.id === focusedIdRef.current) return

    focusedIdRef.current = antenna.id
    map.flyTo([antenna.latitude, antenna.longitude], 14, { duration: 1.4 })

    // Delay opening the popup until the fly animation has finished (~1.4 s)
    if (searchOpenTimerRef.current) clearTimeout(searchOpenTimerRef.current)
    searchOpenTimerRef.current = setTimeout(() => {
      const el = markerPathsRef.current.get(antenna.id)
      if (el) onAntennaClick(antenna, el)
    }, 1600)
  }, [antenna, map, markerPathsRef, searchOpenTimerRef, onAntennaClick])

  return null
}

interface MapClientProps {
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

/**
 * Full Leaflet map with marker layer, search, weather overlay, and focus/fly
 * behaviour. Rendered client-side only (dynamic import in the page).
 *
 * @param antennas - All antenna records to display as circle markers.
 * @param selectedId - ID of the antenna whose popup is currently open (drives marker scale).
 * @param focusAntennaId - When set, flies the map to this antenna and opens its popup.
 * @param activeFilters - Technology and severity filters applied to the marker layer.
 * @param weatherRisk - Map of city name → boolean risk flag from the weather API.
 * @param weatherDetails - Full weather detail objects for the overlay cards.
 * @param onAntennaClick - Called when a marker or search result is selected.
 */
export default function MapClient({ antennas, selectedId, focusAntennaId, activeFilters, weatherRisk, weatherDetails, onAntennaClick }: MapClientProps) {
  const { enabled: weatherOverlayOn, toggle: toggleWeatherOverlay } = useWeatherOverlay()
  const { theme } = useTheme()
  const [flyTarget, setFlyTarget] = useState<FlyTarget | null>(null)
  // Shared ref for all SVG marker paths — populated by MarkerLayer's add event handler
  const markerPathsRef = useRef(new Map<string, SVGElement>())
  // Single timer ref so concurrent search/focus actions don't stack popup timers
  const searchOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Resolve the focused antenna object from its id for FocusController
  const focusAntenna = focusAntennaId
    ? antennas.find(a => a.id === focusAntennaId) ?? null
    : null

  // Clean up any pending popup timer when the component unmounts
  useEffect(() => {
    return () => {
      if (searchOpenTimerRef.current) clearTimeout(searchOpenTimerRef.current)
    }
  }, [])

  /** Flies the map to a search result and opens its popup after the animation. */
  function handleSearchSelect(antenna: Antenna) {
    setFlyTarget({ lat: antenna.latitude, lon: antenna.longitude })
    if (searchOpenTimerRef.current) clearTimeout(searchOpenTimerRef.current)
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
        style={{ width: '100%', height: '100%', background: 'var(--bg-subtle)' }}
      >
        {/* key={theme} forces a full tile re-render when the user switches light/dark */}
        <TileLayer
          key={theme}
          url={theme === 'dark'
            ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
            : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
          }
          subdomains="abcd"
          maxZoom={20}
          keepBuffer={6}
          updateWhenIdle={false}
        />
        <MarkerLayer
          antennas={antennas}
          selectedId={selectedId}
          activeFilters={activeFilters}
          // Only pass weather risk data when the overlay is toggled on
          weatherRisk={weatherOverlayOn ? weatherRisk : undefined}
          onAntennaClick={onAntennaClick}
          markerPathsRef={markerPathsRef}
        />
        <FlyController target={flyTarget} />
        <FocusController
          antenna={focusAntenna}
          markerPathsRef={markerPathsRef}
          searchOpenTimerRef={searchOpenTimerRef}
          onAntennaClick={onAntennaClick}
        />
        <ResizeHandler />
        <WeatherOverlay enabled={weatherOverlayOn} details={weatherDetails ?? []} />
      </MapContainer>

      <MapSearch antennas={antennas} onSelect={handleSearchSelect} />

      <WeatherOverlayToggle enabled={weatherOverlayOn} onToggle={toggleWeatherOverlay} />
    </div>
  )
}
