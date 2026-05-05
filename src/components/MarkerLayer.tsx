'use client'

import { useState, useMemo, useRef, useEffect, Fragment } from 'react'
import { CircleMarker, Tooltip, useMap } from 'react-leaflet'
import type React from 'react'
import { useTheme } from '@/hooks/useTheme'
import type { Antenna, Technology, AlarmSeverity } from '@/types'
import { cityForAntenna } from '@/lib/weather-cities'

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
    '6G': style.getPropertyValue('--tech-6g').trim(),
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

const WEATHER_RING_COLOR = '#f97316'

interface MarkerLayerProps {
  antennas: Antenna[]
  selectedId?: string | null
  activeFilters?: {
    technologies?: Technology[]
    severities?: AlarmSeverity[]
  }
  weatherRisk?: Record<string, boolean>
  onAntennaClick: (antenna: Antenna, anchorEl: Element) => void
  markerPathsRef?: React.RefObject<Map<string, SVGElement>>
}

export function MarkerLayer({ antennas, selectedId, activeFilters, weatherRisk, onAntennaClick, markerPathsRef }: MarkerLayerProps) {
  const { theme } = useTheme()
  const map = useMap()
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const internalRef = useRef(new Map<string, SVGElement>())
  const markerPaths = markerPathsRef ?? internalRef

  // Keep refs so zoom handlers can read current values without stale closures
  const selectedIdRef = useRef(selectedId)
  const hoveredIdRef  = useRef(hoveredId)
  useEffect(() => { selectedIdRef.current = selectedId }, [selectedId])
  useEffect(() => { hoveredIdRef.current  = hoveredId  }, [hoveredId])

  // Pure-DOM zoom handlers — no setState, no re-render, no compounding transforms
  useEffect(() => {
    const clearTransforms = () => {
      markerPaths.current.forEach(path => {
        path.style.transition = 'none'
        path.style.transform  = 'scale(1)'
        path.style.filter     = ''
      })
    }
    const restoreTransforms = () => {
      markerPaths.current.forEach((path, id) => {
        path.style.transition = 'transform 220ms cubic-bezier(0.34,1.56,0.64,1), filter 220ms ease'
        if (id === selectedIdRef.current) {
          path.style.transform = 'scale(1.72)'
          path.style.filter    = 'drop-shadow(0 0 5px rgba(124,111,247,0.6))'
        } else if (id === hoveredIdRef.current) {
          path.style.transform = 'scale(1.45)'
          path.style.filter    = ''
        }
      })
    }
    map.on('zoomstart', clearTransforms)
    map.on('zoomend',   restoreTransforms)
    return () => { map.off('zoomstart', clearTransforms); map.off('zoomend', restoreTransforms) }
  }, [map])

  const antennaMarkers = useMemo(() => {
    return antennas.map(antenna => {
      const { technology, status } = worstCell(antenna)
      const colors = getMarkerColor(technology, status)
      const city = cityForAntenna(antenna.latitude, antenna.longitude)
      const isWeatherRisk = !!(weatherRisk?.[city])
      return { ...antenna, worstTech: technology, worstStatus: status, colors, city, isWeatherRisk }
    })
  }, [antennas, theme, weatherRisk])

  // Apply CSS scale transforms on selection/hover change
  useEffect(() => {
    markerPaths.current.forEach((path, id) => {
      if (id === selectedId) {
        path.style.transform = 'scale(1.72)'
        path.style.filter    = 'drop-shadow(0 0 5px rgba(124,111,247,0.6))'
      } else if (id === hoveredId) {
        path.style.transform = 'scale(1.45)'
        path.style.filter    = ''
      } else {
        path.style.transform = 'scale(1)'
        path.style.filter    = ''
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
            {/* Weather risk pulse ring */}
            {marker.isWeatherRisk && (
              <CircleMarker
                center={[marker.latitude, marker.longitude]}
                radius={14}
                pathOptions={{
                  fillColor: 'transparent',
                  fillOpacity: 0,
                  color: WEATHER_RING_COLOR,
                  weight: 2,
                  dashArray: '4 3',
                }}
                eventHandlers={{
                  add: (e) => {
                    const path = (e.target as unknown as { _path?: SVGElement })._path
                    if (path) {
                      path.style.transformBox = 'fill-box'
                      path.style.transformOrigin = 'center'
                      path.style.animation = 'weather-pulse 2s ease-in-out infinite'
                      path.style.pointerEvents = 'none'
                    }
                  },
                }}
              />
            )}
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
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
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
                    {marker.isWeatherRisk && (
                      <span
                        className="text-[10px] font-mono px-2 py-0.5 rounded-full border"
                        style={{
                          backgroundColor: `${WEATHER_RING_COLOR}22`,
                          borderColor: `${WEATHER_RING_COLOR}66`,
                          color: WEATHER_RING_COLOR,
                        }}
                      >
                        ⚠ weather
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
