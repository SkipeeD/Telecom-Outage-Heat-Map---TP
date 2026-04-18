'use client'

import { useEffect } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
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
  onAntennaClick: (antenna: Antenna, anchorEl: Element) => void
}

export default function MapClient({ antennas, selectedId, activeFilters, onAntennaClick }: MapClientProps) {
  return (
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
        onAntennaClick={onAntennaClick} 
      />
      <ResizeHandler />
    </MapContainer>
  )
}
