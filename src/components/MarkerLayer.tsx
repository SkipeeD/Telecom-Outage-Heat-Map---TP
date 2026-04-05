'use client'

import { useState, useMemo, Fragment } from 'react'
import { CircleMarker, Tooltip } from 'react-leaflet'
import { useTheme } from '@/hooks/useTheme'
import type { Antenna, Technology, AlarmSeverity } from '@/types'

/**
 * Utility to determine the "worst" cell status for an antenna.
 * Higher rank = more critical.
 */
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

/**
 * Returns fill (technology) and stroke (severity) colors as resolved strings.
 * Resolve them using getComputedStyle as mandated by DESIGN_SYSTEM.md to respect themes.
 * @export
 */
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
    stroke: severityStroke[severity] || '#059669' 
  }
}

interface MarkerLayerProps {
  antennas: Antenna[]
  selectedId?: string | null
  activeFilters?: {
    technologies?: Technology[]
    severities?: AlarmSeverity[]
  }
  onAntennaClick: (antenna: Antenna) => void
}

/**
 * MarkerLayer Component
 * Renders antennas as interactive CircleMarkers on the map.
 * Follows DESIGN_SYSTEM.md for coloring, sizing, and animations.
 */
export function MarkerLayer({ antennas, selectedId, activeFilters, onAntennaClick }: MarkerLayerProps) {
  const { theme } = useTheme()
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  // Memoize marker status and colors to optimize render and force theme re-sync
  const antennaMarkers = useMemo(() => {
    return antennas.map(antenna => {
      const { technology, status } = worstCell(antenna)
      const colors = getMarkerColor(technology, status)
      return {
        ...antenna,
        worstTech: technology,
        worstStatus: status,
        colors
      }
    })
  }, [antennas, theme])

  const accentGlow = useMemo(() => {
    if (typeof window === 'undefined') return 'rgba(124, 111, 247, 0.25)'
    return getComputedStyle(document.documentElement).getPropertyValue('--accent-glow').trim()
  }, [theme])

  return (
    <>
      {antennaMarkers.map((marker) => {
        const isSelected = selectedId === marker.id
        const isHovered = hoveredId === marker.id
        
        // Filter logic: Check if technology and severity match active filters (if any)
        const matchesTech = !activeFilters?.technologies?.length || activeFilters.technologies.includes(marker.worstTech)
        const matchesSeverity = !activeFilters?.severities?.length || activeFilters.severities.includes(marker.worstStatus)
        const matchesFilter = matchesTech && matchesSeverity

        // Non-matching (filtered) antennas render as 5px gray dot
        if (!matchesFilter) {
          return (
            <CircleMarker
              key={`${marker.id}-filtered-${theme}`}
              center={[marker.latitude, marker.longitude]}
              radius={5}
              pathOptions={{
                fillColor: '#9ca3af',
                fillOpacity: 0.5,
                color: '#6b7280',
                weight: 1,
                opacity: 0.5
              }}
              eventHandlers={{
                click: () => onAntennaClick(marker)
              }}
            />
          )
        }

        const { fill, stroke } = marker.colors
        
        // Marker sizing per DESIGN_SYSTEM.md: Default 7, Hover 10, Selected 12
        let radius = 7
        let strokeWidth = 2
        if (isSelected) {
          radius = 12
          strokeWidth = 3
        } else if (isHovered) {
          radius = 10
          strokeWidth = 2.5
        }

        return (
          <Fragment key={`${marker.id}-${theme}`}>
            {/* Outer Glow Ring for Selected State */}
            {isSelected && (
              <CircleMarker
                center={[marker.latitude, marker.longitude]}
                radius={radius + 6}
                pathOptions={{
                  fillColor: accentGlow,
                  fillOpacity: 0.2,
                  color: accentGlow,
                  weight: 1,
                  opacity: 0.4,
                }}
              />
            )}
            
            <CircleMarker
              center={[marker.latitude, marker.longitude]}
              radius={radius}
              pathOptions={{
                fillColor: fill,
                fillOpacity: 1,
                color: stroke,
                weight: strokeWidth,
              }}
              eventHandlers={{
                click: () => onAntennaClick(marker),
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
                      style={{ 
                        backgroundColor: `${fill}2a`, 
                        borderColor: `${fill}6a`,
                        color: fill
                      }}
                    >
                      {marker.worstTech}
                    </span>
                    <span 
                      className="text-[10px] font-mono px-2 py-0.5 rounded-full border"
                      style={{ 
                        backgroundColor: `${stroke}2a`, 
                        borderColor: `${stroke}6a`,
                        color: stroke
                      }}
                    >
                      {marker.worstStatus.toUpperCase()}
                    </span>
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
