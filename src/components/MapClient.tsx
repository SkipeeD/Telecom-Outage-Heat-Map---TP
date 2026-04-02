'use client'

import { useEffect } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type { Antenna } from '@/types'
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
  onAntennaClick: (antenna: Antenna) => void
}

export default function MapClient({ antennas, onAntennaClick }: MapClientProps) {
  return (
    <MapContainer
      center={[45.9, 24.9]}
      zoom={7}
      style={{ width: '100%', height: '100%' }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        minZoom={0}
        maxZoom={19}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      <MarkerLayer antennas={antennas} onAntennaClick={onAntennaClick} />
      <ResizeHandler />
    </MapContainer>
  )
}
