'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useMap } from 'react-leaflet'
import { motion, AnimatePresence } from 'motion/react'
import { Cloud, CloudRain, CloudFog, CloudSun, Sun, Wind, Zap, Droplets, Eye, X } from 'lucide-react'
import type { CityWeatherDetail } from '@/app/api/weather/route'
import { CITY_CENTERS } from '@/lib/weather-cities'

const WX_COLOR: Record<CityWeatherDetail['condition'], string> = {
  sunny:  'var(--wx-sun, #fbbf24)',
  rainy:  'var(--wx-rain, #60a5fa)',
  stormy: 'var(--wx-storm, #a78bfa)',
  cloudy: 'var(--wx-fog, #94a3b8)',
  windy:  'var(--wx-wind, #67e8f9)',
}

const RISK_COLOR: Record<CityWeatherDetail['risk'], string> = {
  low:    'var(--alarm-ok)',
  medium: 'var(--alarm-major)',
  high:   'var(--alarm-critical)',
}

const RISK_LEVEL: Record<CityWeatherDetail['risk'], number> = {
  low: 1,
  medium: 3,
  high: 5,
}

// Cities always rendered while the overlay is on, so the switch always
// produces visible state even when weather is calm.
const ALWAYS_SHOWN_CITIES = [
  'București',
  'Cluj-Napoca',
  'Timișoara',
  'Iași',
  'Constanța',
  'Brașov',
  'Sibiu',
]

function ConditionIcon({ condition, className, style }: { condition: CityWeatherDetail['condition']; className?: string; style?: React.CSSProperties }) {
  const Icon = condition === 'sunny'  ? Sun
            : condition === 'rainy'  ? CloudRain
            : condition === 'stormy' ? Zap
            : condition === 'windy'  ? Wind
            : condition === 'cloudy' ? CloudFog
            : Cloud
  return <Icon className={className} style={style} />
}

interface ScreenPos { x: number; y: number }

interface WeatherOverlayProps {
  enabled: boolean
  details: CityWeatherDetail[]
}

/**
 * Renders weather pill buttons directly over Leaflet map cities using
 * absolute positioning derived from `map.latLngToContainerPoint`.
 *
 * Clicking a pill expands a draggable detail card with temperature, conditions,
 * a 12-hour forecast, and a network impact assessment for the city.
 *
 * @param enabled - Whether the overlay is currently toggled on.
 * @param details - Fetched weather data for each city from the weather API route.
 */
export function WeatherOverlay({ enabled, details }: WeatherOverlayProps) {
  const map = useMap()
  const [tick, setTick] = useState(0)
  const [focusedCity, setFocusedCity] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  // Close the focused card when the user clicks outside the overlay container
  useEffect(() => {
    if (!focusedCity) return
    const onDown = (e: MouseEvent) => {
      const root = rootRef.current
      if (root && !root.contains(e.target as Node)) setFocusedCity(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [focusedCity])

  // Trigger a re-render on every map pan/zoom/resize so pill positions
  // stay in sync with the changing container-pixel coordinates
  useEffect(() => {
    if (!enabled) return
    const update = () => setTick(t => t + 1)
    map.on('move', update)
    map.on('zoom', update)
    map.on('resize', update)
    return () => {
      map.off('move', update)
      map.off('zoom', update)
      map.off('resize', update)
    }
  }, [map, enabled])

  const cityIndex = useMemo(() => {
    const m = new Map<string, { lat: number; lon: number }>()
    CITY_CENTERS.forEach(c => m.set(c.name, { lat: c.lat, lon: c.lon }))
    return m
  }, [])

  // Always show the major cities; also include any city with medium/high weather risk
  const visibleCities = useMemo(() => {
    if (!enabled) return []
    const include = new Set<string>(ALWAYS_SHOWN_CITIES)
    details.forEach(d => { if (d.risk !== 'low') include.add(d.city) })
    return details
      .filter(d => include.has(d.city))
      .map(d => {
        const center = cityIndex.get(d.city)
        if (!center) return null
        return { detail: d, center }
      })
      .filter((x): x is { detail: CityWeatherDetail; center: { lat: number; lon: number } } => x !== null)
  }, [details, enabled, cityIndex])

  if (!enabled) return null

  const effectiveFocus = focusedCity && visibleCities.some(v => v.detail.city === focusedCity)
    ? focusedCity
    : null

  const projected = visibleCities.map(({ detail, center }) => {
    const point = map.latLngToContainerPoint([center.lat, center.lon])
    return { detail, pos: { x: point.x, y: point.y } as ScreenPos }
  })

  // Tick variable read to silence lint and force render on map move
  void tick

  const focused = projected.find(p => p.detail.city === effectiveFocus)

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0" style={{ zIndex: 1000 }}>
      <AnimatePresence>
        {projected.map(({ detail, pos }) => {
          if (detail.city === effectiveFocus) return null
          return (
            <motion.button
              key={detail.city}
              initial={{ opacity: 0, y: 6, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.95 }}
              transition={{ duration: 0.18 }}
              onClick={() => setFocusedCity(detail.city)}
              className="
                pointer-events-auto absolute
                -translate-x-1/2 -translate-y-[calc(100%+12px)]
                flex items-center gap-2
                px-2.5 py-1.5
                rounded-[var(--radius-md)] border border-[var(--glass-border)]
                backdrop-blur-xl
                shadow-[var(--shadow-md)]
                hover:border-[var(--border-strong)] cursor-pointer
              "
              style={{ left: pos.x, top: pos.y, color: WX_COLOR[detail.condition], background: 'color-mix(in srgb, var(--bg-overlay) 88%, transparent)' }}
              aria-label={`Show weather for ${detail.city}`}
            >
              <ConditionIcon condition={detail.condition} className="size-[18px]" />
              <div className="flex flex-col items-start leading-none">
                <span className="font-mono text-[13px] font-medium text-[var(--text-primary)]">
                  {detail.temp}°
                </span>
                <span
                  className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--text-muted)] mt-0.5"
                >
                  {detail.city}
                </span>
              </div>
              <span
                className="absolute left-1/2 top-full -translate-x-1/2 size-0
                  border-[5px] border-transparent"
                style={{ borderTopColor: 'color-mix(in srgb, var(--bg-overlay) 88%, transparent)' }}
                aria-hidden
              />
            </motion.button>
          )
        })}
      </AnimatePresence>

      <AnimatePresence>
        {focused && (
          <FocusedCard
            key={focused.detail.city}
            detail={focused.detail}
            anchor={focused.pos}
            mapWidth={map.getSize().x}
            mapHeight={map.getSize().y}
            onClose={() => setFocusedCity(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

interface FocusedCardProps {
  detail: CityWeatherDetail
  anchor: ScreenPos
  mapWidth: number
  mapHeight: number
  onClose: () => void
}

/**
 * Expanded weather detail card for a selected city.
 * Positions itself to the right of the anchor pill when space allows, otherwise
 * to the left, and clamps both axes to stay within the map viewport.
 * Supports free-form drag by disabling Leaflet's own drag handler during pointer capture.
 */
function FocusedCard({ detail, anchor, mapWidth, mapHeight, onClose }: FocusedCardProps) {
  const map = useMap()
  const cardW = 340
  const cardH = 480
  const offset = 36

  // Prefer right-side placement; fall back to left if the card would overflow
  const placeRight = anchor.x + offset + cardW + 24 < mapWidth
  let left = placeRight ? anchor.x + offset : anchor.x - offset - cardW
  let top = anchor.y - 90
  // Clamp within the map area so the card never goes off-screen
  top = Math.max(20, Math.min(mapHeight - cardH - 20, top))
  left = Math.max(20, Math.min(mapWidth - cardW - 20, left))

  const [drag, setDrag] = useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 })

  // Custom drag handler on the header: pauses Leaflet map dragging so moving the
  // card doesn't pan the map underneath it
  const onHeaderDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    e.stopPropagation()
    map.dragging.disable()
    const startX = e.clientX
    const startY = e.clientY
    const start = drag
    const move = (ev: MouseEvent) => {
      setDrag({ dx: start.dx + (ev.clientX - startX), dy: start.dy + (ev.clientY - startY) })
    }
    const up = () => {
      map.dragging.enable()
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }

  const wxColor = WX_COLOR[detail.condition]
  const impactColor = RISK_COLOR[detail.risk]
  const impactLevel = RISK_LEVEL[detail.risk]

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.985, filter: 'blur(4px)' }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, y: 6, scale: 0.985, filter: 'blur(4px)' }}
      transition={{ duration: 0.32, ease: [0.34, 1.56, 0.64, 1] }}
      className="
        pointer-events-auto absolute overflow-hidden
        rounded-[var(--radius-lg)] border border-[var(--glass-border)]
        backdrop-blur-2xl backdrop-saturate-150
        shadow-[var(--shadow-lg)] text-[var(--text-primary)]
      "
      style={{ left: left + drag.dx, top: top + drag.dy, width: cardW, background: 'color-mix(in srgb, var(--bg-overlay) 85%, transparent)', ['--wx-color' as string]: wxColor, ['--impact-color' as string]: impactColor }}
    >
      {/* Header (drag handle) */}
      <div
        onMouseDown={onHeaderDown}
        className="flex justify-between items-start px-3.5 pt-3.5 pb-2.5 border-b border-[var(--glass-border)] cursor-grab active:cursor-grabbing select-none"
      >
        <div>
          <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
            <span
              className="size-[5px] rounded-full"
              style={{ background: 'var(--accent-bright)', boxShadow: '0 0 8px var(--accent-glow)' }}
            />
            <span>Weather · {detail.region}</span>
          </div>
          <div className="text-[18px] font-semibold tracking-[-0.01em] mt-1">{detail.city}</div>
          <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--text-muted)] mt-0.5">
            {detail.condition.toUpperCase()} · {detail.risk.toUpperCase()} RISK
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="
            grid place-items-center w-6 h-6 rounded-[var(--radius-sm)]
            bg-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]
            hover:bg-[var(--glass-hover)] cursor-pointer
          "
        >
          <X className="size-3" />
        </button>
      </div>

      {/* Hero */}
      <div className="grid grid-cols-[auto_1fr] gap-3.5 items-center p-3.5">
        <div
          className="grid place-items-center size-16 rounded-[var(--radius-lg)] flex-shrink-0"
          style={{
            background: `radial-gradient(80px 60px at 50% 30%, color-mix(in oklab, ${wxColor} 28%, transparent), transparent 70%), var(--glass-bg)`,
            border: `1px solid color-mix(in oklab, ${wxColor} 30%, var(--glass-border))`,
            boxShadow: `0 0 24px color-mix(in oklab, ${wxColor} 20%, transparent)`,
          }}
        >
          <ConditionIcon condition={detail.condition} className="size-9" style={{ color: wxColor }} />
        </div>
        <div>
          <div className="flex items-baseline gap-px leading-none">
            <span className="font-mono text-[42px] font-medium tracking-[-0.02em]">{detail.temp}</span>
            <span className="font-mono text-[18px] text-[var(--text-secondary)] ml-px">°C</span>
          </div>
          <div className="text-[13px] text-[var(--text-secondary)] mt-1.5">
            <b className="font-medium text-[var(--text-primary)]">
              {detail.condition === 'stormy' ? 'Thunderstorm'
              : detail.condition === 'rainy'  ? 'Rain'
              : detail.condition === 'cloudy' ? 'Cloudy'
              : detail.condition === 'windy'  ? 'Windy'
              : 'Clear sky'}
            </b>{detail.precipitation > 0 ? ` · ${detail.precipitation.toFixed(1)} mm` : ''}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)] mt-1">
            WIND {detail.windSpeed} KM/H
          </div>
        </div>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-3 border-t border-[var(--glass-border)]">
        <Stat icon={<Wind className="size-3" />} label="Wind" value={detail.windSpeed} unit="km/h" />
        <Stat icon={<Droplets className="size-3" />} label="Precip" value={detail.precipitation.toFixed(1)} unit="mm" />
        <Stat icon={<Eye className="size-3" />} label="Risk" value={detail.risk.toUpperCase()} />
      </div>

      {/* 12-hour outlook */}
      <HourlyOutlook detail={detail} />

      {/* Impact band */}
      <div
        className="
          mx-3.5 mb-3.5 grid grid-cols-[auto_1fr_auto] gap-2.5 items-center
          rounded-[var(--radius-md)] px-3 py-2.5
        "
        style={{
          border: `1px solid color-mix(in oklab, ${impactColor} 30%, var(--glass-border))`,
          background: `color-mix(in oklab, ${impactColor} 8%, transparent)`,
        }}
      >
        <div
          className="grid place-items-center size-7 rounded-[var(--radius-sm)] flex-shrink-0"
          style={{
            background: `color-mix(in oklab, ${impactColor} 14%, transparent)`,
            color: impactColor,
          }}
        >
          <Zap className="size-3.5" />
        </div>
        <div className="min-w-0">
          <div className="text-[12px] font-medium leading-tight">
            {detail.risk === 'high'   ? 'Major impact on radio links'
            : detail.risk === 'medium' ? 'Possible signal attenuation'
                                        : 'No impact on radio links'}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)] mt-0.5">
            {detail.condition === 'stormy' ? '5G mmWave · 4G B7'
            : detail.condition === 'rainy'  ? 'high-band cells'
            : detail.condition === 'windy'  ? 'PtP backhaul'
                                            : 'all bands nominal'}
          </div>
        </div>
        <div className="flex gap-1 items-end h-[22px]">
          {[0, 1, 2, 3, 4].map(i => (
            <div
              key={i}
              className="w-[5px] rounded-[1px]"
              style={{
                height: `${8 + i * 3}px`,
                background: i < impactLevel ? impactColor : 'var(--text-muted)',
                opacity: i < impactLevel ? 1 : 0.35,
              }}
            />
          ))}
        </div>
      </div>

      {/* Footer */}
      <div
        className="
          flex justify-between items-center px-3.5 py-2.5
          border-t border-[var(--glass-border)] bg-[var(--glass-bg)]
          font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]
        "
      >
        <span>Source · Open-Meteo</span>
        <CloudSun className="size-3.5" style={{ color: wxColor }} />
      </div>
    </motion.div>
  )
}

/**
 * 12-column hourly forecast strip.
 * Temperature offsets and probability-of-precipitation values are condition-keyed
 * approximations rather than real forecast data, giving a plausible shape to the chart.
 */
function HourlyOutlook({ detail }: { detail: CityWeatherDetail }) {
  const wxColor = WX_COLOR[detail.condition]
  // Relative temperature offsets from the current reading over 12 hours
  const tempCurve = [0, 1, 2, 2, 1, -1, -2, -3, -3, -2, -1, 0]
  const popCurve: Record<CityWeatherDetail['condition'], number[]> = {
    sunny:  [0, 0, 0, 5, 5, 0, 0, 0, 0, 0, 0, 0],
    rainy:  [70, 80, 85, 80, 65, 55, 45, 30, 25, 20, 15, 10],
    stormy: [85, 95, 90, 70, 50, 40, 30, 20, 15, 10, 5, 5],
    cloudy: [10, 15, 20, 20, 15, 15, 10, 10, 10, 10, 10, 10],
    windy:  [20, 25, 30, 25, 20, 20, 15, 15, 10, 10, 10, 10],
  }
  const pops = popCurve[detail.condition]
  const hour = new Date().getHours()

  return (
    <div className="border-t border-[var(--glass-border)]">
      <div
        className="
          px-3.5 pt-3 pb-1.5
          text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--text-secondary)]
        "
      >
        12-hour outlook
      </div>
      <div className="grid grid-cols-12 px-2 pb-3 gap-0">
        {tempCurve.map((offset, i) => {
          const t = detail.temp + offset
          const h = ((hour + i) % 24).toString().padStart(2, '0')
          const pop = pops[i]
          return (
            <div
              key={i}
              className="
                flex flex-col items-center gap-1 py-1.5 px-0.5
                rounded-[var(--radius-sm)] hover:bg-[var(--glass-hover)]
              "
            >
              <span className="font-mono text-[10px] font-medium tracking-[0.02em] text-[var(--text-secondary)]">{h}</span>
              <ConditionIcon condition={detail.condition} className="size-4 opacity-90" style={{ color: wxColor }} />
              <span className="font-mono text-[11px] font-medium text-[var(--text-primary)]">{t}°</span>
              <span
                className="font-mono text-[9px] leading-none"
                style={{ color: 'var(--wx-rain)', opacity: pop > 0 ? 0.9 : 0 }}
              >
                {pop > 0 ? `${pop}%` : '·'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Stat({ icon, label, value, unit }: { icon: React.ReactNode; label: string; value: string | number; unit?: string }) {
  return (
    <div className="flex flex-col items-center gap-1 py-2.5 px-1.5 border-r last:border-r-0 border-[var(--glass-border)]">
      <div className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
        {icon}
        {label}
      </div>
      <div className="font-mono text-[13px] font-medium">
        {value}
        {unit && <span className="font-mono text-[9px] text-[var(--text-muted)] ml-0.5">{unit}</span>}
      </div>
    </div>
  )
}
