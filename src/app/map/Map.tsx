'use client'

import dynamic from 'next/dynamic'
import type { Antenna } from '@/types'

export interface MapProps {
  antennas: Antenna[]
  onAntennaClick: (antenna: Antenna) => void
}

const MapWithNoSSR = dynamic(() => import('../../components/MapClient'), {
  ssr: false,
  loading: () => (
    <div
      className="w-full h-full flex items-center justify-center"
      style={{ background: 'var(--bg-primary)' }}
    >
      <span
        className="text-sm"
        style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}
      >
        Loading map…
      </span>
    </div>
  ),
})

export default function Map({ antennas, onAntennaClick }: MapProps) {
  return <MapWithNoSSR antennas={antennas} onAntennaClick={onAntennaClick} />
}
