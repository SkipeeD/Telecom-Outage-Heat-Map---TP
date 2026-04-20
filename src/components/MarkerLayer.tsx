'use client'

import { useState, useMemo, useRef, useEffect, Fragment } from 'react'
import { CircleMarker, Tooltip } from 'react-leaflet'
import { useTheme } from '@/hooks/useTheme'
import type { Antenna, Technology, AlarmSeverity } from '@/types'

const severityRank: Record<AlarmSeverity, number> = {
  critical: 5,
  major: 4,
  minor: 3,
  warning: 2,
  ok: 1,
}

function worstCell(antenna: Antenna): { technology: Technology; status: AlarmSeverity } {
  if (!antenna.cells || antenna.cells.length === 0) {
    return { technology: '4G', status: 'ok' }
  }
  return antenna.cells.reduce((best, cell) =>
    severityRank[cell.status] > severityRank[best.status] ? cell : best
  )
}

export function getMarkerColor(tech: Technology, severity: AlarmSeverity) {
  if (typeof window === 'undefined') return { fill: '#6c5ff5', stroke: '#059669' }

  const root = document.documentElement
  const style = getComputedStyle(root)

  const techFill: Record<Technology, string> = {
    '5G':  style.getPropertyValue('--tech-5g').trim(),
    '4G':  style.getPropertyValue('--tech-4g').trim(),
    '3G':  style.getPropertyValue('--tech-3g').trim(),
    '2G':  style.getPropertyValue('--tech-2g').trim(),
    'B2B': style.getPropertyValue('--tech-b2b').trim(),
  }
  const severityStroke: Record<AlarmSeverity, string> = {
    critical: style.getPropertyValue('--alarm-critical').trim(),
    major:    style.getPropertyValue('--alarm-major').trim(),
    minor:    style.getPropertyValue('--alarm-minor').trim(),
    warning:  style.getPropertyValue('--alarm-warning').trim(),
    ok:       style.getPropertyValue('--alarm-ok').trim(),
  }

  return {
    fill: techFill[tech] || '#6c5ff5',
    stroke: severityStroke[severity] || '#059669',
  }
}

interface MarkerLayerProps {
  antennas: Antenna[]
  selectedId?: string | null
  activeFilters?: {
    technologies?: Technology[]
    severities?: AlarmSeverity[]
  }
  onAntennaClick: (antenna: Antenna, anchorEl: Element) => void
}

export function MarkerLayer({ antennas, selectedId, activeFilters, onAntennaClick }: MarkerLayerProps) {
  const { theme } = useTheme()
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  // Map from marker id → raw SVG path element captured on Leaflet's `add` event
  const markerPaths = useRef(new Map<string, SVGElement>())

  const antennaMarkers = useMemo(() => {
    return antennas.map(antenna => {
      const { technology, status } = worstCell(antenna)
      const colors = getMarkerColor(technology, status)
      return { ...antenna, worstTech: technology, worstStatus: status, colors }
    })
  }, [antennas, theme])

  // Apply CSS scale transforms whenever hover/selection changes
  useEffect(() => {
    markerPaths.current.forEach((path, id) => {
      if (id === selectedId) {
        path.style.transform = 'scale(1.72)'
        path.style.filter = 'drop-shadow(0 0 5px rgba(124,111,247,0.6))'
      } else if (id === hoveredId) {
        path.style.transform = 'scale(1.45)'
        path.style.filter = ''
      } else {
        path.style.transform = 'scale(1)'
        path.style.filter = ''
      }
    })
  }, [selectedId, hoveredId])

  return (
    <>
      {antennaMarkers.map((marker) => {
        const isSelected = selectedId === marker.id
        const extraAlarmCount = marker.cells.filter(c => c.currentAlarm && !c.currentAlarm.resolved).length - 1

        const matchesTech = !activeFilters?.technologies?.length || activeFilters.technologies.includes(marker.worstTech)
        const matchesSeverity = !activeFilters?.severities?.length || activeFilters.severities.includes(marker.worstStatus)
        if (!matchesTech || !matchesSeverity) return null

        const { fill, stroke } = marker.colors

        return (
          <Fragment key={`${marker.id}-${theme}`}>
            <CircleMarker
              center={[marker.latitude, marker.longitude]}
              radius={7}
              pathOptions={{
                fillColor: fill,
                fillOpacity: 1,
                color: isSelected ? stroke : stroke,
                weight: 2,
              }}
              eventHandlers={{
                add: (e) => {
                  const path = (e.target as unknown as { _path?: SVGElement })._path
                  if (path) {
                    markerPaths.current.set(marker.id, path)
                    path.style.transformBox = 'fill-box'
                    path.style.transformOrigin = 'center'
                    path.style.transition = 'transform 220ms cubic-bezier(0.34,1.56,0.64,1), filter 220ms ease'
                  }
                },
                remove: () => {
                  markerPaths.current.delete(marker.id)
                },
                click: (e) => onAntennaClick(marker, e.originalEvent.target as Element),
                mouseover: () => setHoveredId(marker.id),
                mouseout: () => setHoveredId(null),
              }}
            >
              <Tooltip
                className="
                  !bg-[var(--bg-overlay)] !border !border-[var(--glass-border)]
                  !rounded-[var(--radius-md)] !p-3 !shadow-[var(--shadow-lg)]
                  !backdrop-blur-xl !text-[var(--text-primary)]
                "
                sticky
              >
                <div className="flex flex-col gap-1 min-w-[140px]">
                  <span className="text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-widest font-sans">
                    {marker.siteId}
                  </span>
                  <span className="text-[15px] font-semibold text-[var(--text-primary)] font-sans">
                    {marker.name}
                  </span>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <span
                      className="text-[10px] font-mono px-2 py-0.5 rounded-full border"
                      style={{ backgroundColor: `${fill}2a`, borderColor: `${fill}6a`, color: fill }}
                    >
                      {marker.worstTech}
                    </span>
                    <span
                      className="text-[10px] font-mono px-2 py-0.5 rounded-full border"
                      style={{ backgroundColor: `${stroke}2a`, borderColor: `${stroke}6a`, color: stroke }}
                    >
                      {marker.worstStatus.toUpperCase()}
                    </span>
                    {extraAlarmCount > 0 && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-[rgba(255,255,255,0.25)] bg-[rgba(255,255,255,0.1)] text-[var(--text-primary)]">
                        +{extraAlarmCount} alarm{extraAlarmCount > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>
              </Tooltip>
            </CircleMarker>
          </Fragment>
        )
      })}
    </>
  )
}
