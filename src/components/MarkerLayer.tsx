'use client'

import { CircleMarker } from 'react-leaflet'
import type { Antenna, Technology, AlarmSeverity } from '@/types'

export function getMarkerColor(
  tech: Technology,
  severity: AlarmSeverity,
): { fill: string; stroke: string } {
  const techColors: Record<Technology, string> = {
    '5G':  '#7F77DD',
    '4G':  '#1D9E75',
    '3G':  '#EF9F27',
    '2G':  '#85B7EB',
    'B2B': '#D85A30',
  }
  const severityStrokes: Record<AlarmSeverity, string> = {
    critical: '#E24B4A',
    major:    '#EF9F27',
    minor:    '#FAC775',
    warning:  '#85B7EB',
    ok:       '#5DCAA5',
  }
  return {
    fill:   techColors[tech],
    stroke: severityStrokes[severity],
  }
}

interface MarkerLayerProps {
  antennas: Antenna[]
  onAntennaClick: (antenna: Antenna) => void
}

export function MarkerLayer({ antennas, onAntennaClick }: MarkerLayerProps) {
  return (
    <>
      {antennas.map((antenna) => {
        const { fill, stroke } = getMarkerColor(antenna.technology, antenna.status)
        return (
          <CircleMarker
            key={antenna.id}
            center={[antenna.latitude, antenna.longitude]}
            radius={8}
            pathOptions={{
              fillColor:   fill,
              fillOpacity: 0.85,
              color:       stroke,
              weight:      2,
            }}
            eventHandlers={{
              click: () => onAntennaClick(antenna),
            }}
          />
        )
      })}
    </>
  )
}
