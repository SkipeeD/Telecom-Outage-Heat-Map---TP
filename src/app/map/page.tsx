'use client'

const EASE: [number, number, number, number] = [0.4, 0, 0.2, 1]

import { useState, useEffect, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { motion } from 'motion/react'
import { getAntennas, getAntenna } from '@/lib/firestore'
import { useAuth } from '@/components/AuthProvider'
import { useFilters, FilterSeverity } from '@/components/FilterProvider'
import { useLiveSnapshot } from '@/hooks/useLiveSnapshot'
import type { Antenna, AlarmSeverity, Technology } from '@/types'
import { AntennaPopup } from '@/components/antenna/AntennaPopup'
import { AntennaDetailsPanel } from '@/components/antenna/AntennaDetailsPanel'
import type { CityWeatherDetail } from '@/app/api/weather/route'

const MapClient = dynamic(() => import('@/app/map/Map'), { 
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[var(--bg-base)]">
      <span className="text-[var(--text-muted)] font-mono text-sm animate-pulse">
        Initializing map…
      </span>
    </div>
  )
})


/**
 * Inner component for the Map page. Wrapped in Suspense by the outer shell
 * because it calls `useSearchParams()`.
 *
 * Data strategy:
 * - Antenna topology (lat/lng, cells) is fetched once on mount — positions are static.
 * - Live severity per antenna is overlaid from `useLiveSnapshot`, replacing each
 *   cell's status value so the map pins reflect real-time alarm state.
 * - Clicking a pin shows a lightweight popup immediately, then upgrades it with
 *   the full per-cell breakdown fetched from `/api/antennas/[id]`.
 * - Weather risk flags refresh every 30 minutes and tint the map tiles.
 * - `myAntennaIds` powers the "Mine" filter: it tracks antennas belonging to
 *   incidents the current user owns (engineer = assignee, technician = dispatched).
 */
function MapPageInner() {
  const { user, profile, loading: authLoading } = useAuth()
  const { selectedSeverity, setCounts } = useFilters()
  const searchParams = useSearchParams()
  // Accept both param names for backwards-compat deep links from different senders
  const focusAntennaId = searchParams.get('antennaId') ?? searchParams.get('selectSite')
  // Topology positions are fetched ONCE per session — antenna locations don't
  // change at runtime. Live severity comes from meta/liveSnapshot.
  const [baseAntennas, setBaseAntennas] = useState<Antenna[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [popupAntenna, setPopupAntenna] = useState<Antenna | null>(null)
  const [popupAnchor, setPopupAnchor] = useState<Element | null>(null)
  const [detailsAntenna, setDetailsAntenna] = useState<Antenna | null>(null)
  const [detailsTech, setDetailsTech] = useState<Technology | null>(null)
  const [weatherRisk, setWeatherRisk] = useState<Record<string, boolean>>({})
  const [weatherDetails, setWeatherDetails] = useState<CityWeatherDetail[]>([])

  const { snapshot } = useLiveSnapshot(!!user)

  // One-shot topology fetch — no polling. Severity will overlay from snapshot.
  useEffect(() => {
    if (!user) return
    let cancelled = false
    void (async () => {
      try {
        const { antennas: data } = await getAntennas()
        if (!cancelled) setBaseAntennas(data)
      } catch {
        // Keep stale data visible — don't clear on error
      }
    })()
    return () => { cancelled = true }
  }, [user])

  // Overlay live severity onto the static topology. The map's pin colors use
  // worst-severity-per-antenna, so we replace each cell's status with the
  // snapshot value — full per-cell breakdown is fetched on click via
  // /api/antennas/[id].
  const antennas = useMemo<Antenna[]>(() => {
    if (!snapshot) return baseAntennas
    return baseAntennas.map(a => {
      const sev = snapshot.antennaSeverity[a.id] ?? 'ok'
      return {
        ...a,
        cells: a.cells.length > 0
          ? a.cells.map(c => ({ ...c, status: sev, currentAlarm: undefined }))
          : [{ technology: '4G' as Technology, status: sev }],
      }
    })
  }, [baseAntennas, snapshot])

  // Severity-filtered list for the map (when the user picks a severity in the
  // filter bar). Counts always reflect ALL antennas, never filtered.
  // Antenna IDs tied to incidents assigned to me — engineers match on the
  // owning `assignees`, technicians on the dispatched `technicians`. Drives the
  // "Mine" map scope. Empty when the role has no ownership concept.
  // Derived from `snapshot` (a stable reference) rather than the hook's
  // openIncidents array (rebuilt every render) so the counts effect below
  // doesn't loop.
  const myAntennaIds = useMemo(() => {
    const ids = new Set<string>()
    if (!profile || (profile.role !== 'engineer' && profile.role !== 'technician')) return ids
    for (const inc of Object.values(snapshot?.openIncidents ?? {})) {
      const mine = profile.role === 'technician'
        ? (inc.technicians ?? []).some(t => t.uid === profile.uid)
        : (inc.assignees ?? []).some(a => a.uid === profile.uid)
      if (!mine) continue
      for (const id of (inc.antennaIds?.length ? inc.antennaIds : [inc.antennaId])) {
        if (id) ids.add(id)
      }
    }
    return ids
  }, [snapshot, profile])

  const filteredAntennas = useMemo(() => {
    if (selectedSeverity === 'all') return antennas
    if (selectedSeverity === 'mine') return antennas.filter(a => myAntennaIds.has(a.id))
    if (selectedSeverity === 'active')
      return antennas.filter(a => a.cells.some(c => c.status !== 'ok'))
    return antennas.filter(a => a.cells.some(c => c.status === selectedSeverity))
  }, [antennas, selectedSeverity, myAntennaIds])

  // Counts driven by the snapshot. Absence in antennaSeverity = 'ok'.
  useEffect(() => {
    if (baseAntennas.length === 0) return
    const counts: Record<FilterSeverity, number> = {
      all: baseAntennas.length, active: 0, mine: myAntennaIds.size, ok: 0, critical: 0, major: 0, minor: 0, warning: 0,
    }
    const severityMap = snapshot?.antennaSeverity ?? {}
    let nonOk = 0
    for (const a of baseAntennas) {
      const sev = severityMap[a.id]
      if (sev && sev !== 'ok') {
        counts[sev] = (counts[sev] ?? 0) + 1
        nonOk++
      }
    }
    counts.ok = baseAntennas.length - nonOk
    counts.active = nonOk
    setCounts(counts)
  }, [baseAntennas, snapshot, myAntennaIds, setCounts])

  useEffect(() => {
    if (!user) return
    let cancelled = false

    const fetchWeather = async () => {
      try {
        const res = await fetch('/api/weather')
        if (!res.ok || cancelled) return
        const { weatherRisk: risk, weatherDetails: details } = await res.json()
        if (cancelled) return
        setWeatherRisk(risk ?? {})
        setWeatherDetails(details ?? [])
      } catch {
        // silently ignore — weather is non-critical
      }
    }

    void fetchWeather()
    const id = setInterval(() => void fetchWeather(), 30 * 60 * 1000)
    return () => { cancelled = true; clearInterval(id) }
  }, [user])

  /**
   * Handles a map pin click. Toggles selection (clicking the same pin again
   * closes the popup). Shows the antenna data from the topology cache immediately
   * for snappy UX, then upgrades with per-cell detail from the API.
   */
  const handleAntennaClick = (antenna: Antenna, anchorEl: Element) => {
    const isDeselecting = selectedId === antenna.id
    setSelectedId(isDeselecting ? null : antenna.id)
    if (isDeselecting) {
      setPopupAntenna(null)
      setPopupAnchor(null)
      return
    }
    // Show the placeholder immediately for snappy UX, then fetch full cell
    // breakdown from the cached single-antenna endpoint.
    setPopupAntenna(antenna)
    setPopupAnchor(anchorEl)
    void (async () => {
      try {
        const full = await getAntenna(antenna.id)
        setPopupAntenna(prev => (prev && prev.id === antenna.id ? full : prev))
      } catch (err) {
        console.error('[map] failed to fetch antenna detail', err)
      }
    })()
  }

  const handlePopupClose = () => {
    setSelectedId(null)
    setPopupAntenna(null)
    setPopupAnchor(null)
  }

  const handleOpenDetails = (antenna: Antenna, tech: Technology) => {
    setDetailsAntenna(antenna)
    setDetailsTech(tech)
    setPopupAntenna(null)
    setPopupAnchor(null)
    void (async () => {
      try {
        const full = await getAntenna(antenna.id)
        setDetailsAntenna(prev => (prev && prev.id === antenna.id ? full : prev))
      } catch (err) {
        console.error('[map] failed to fetch antenna detail', err)
      }
    })()
  }

  const handleDetailsClose = () => {
    setDetailsAntenna(null)
    setDetailsTech(null)
    setSelectedId(null)
  }

  if (authLoading) return null

  const activeFilters = {
    severities:
      selectedSeverity === 'all' || selectedSeverity === 'mine'
        ? undefined
        : selectedSeverity === 'active'
        ? (['critical', 'major', 'minor', 'warning'] as AlarmSeverity[])
        : [selectedSeverity as AlarmSeverity]
  }

  return (
    <div className="flex h-screen bg-[var(--bg-base)] overflow-hidden transition-colors duration-300">

      {/* Map Area */}
      <motion.div
        className="flex-1 relative min-w-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.45, ease: EASE }}
      >
        <MapClient
          antennas={filteredAntennas}
          selectedId={selectedId}
          focusAntennaId={focusAntennaId}
          activeFilters={activeFilters}
          weatherRisk={weatherRisk}
          weatherDetails={weatherDetails}
          onAntennaClick={handleAntennaClick}
        />
      </motion.div>

      {popupAntenna && (
        <AntennaPopup
          antenna={popupAntenna}
          anchor={popupAnchor}
          open={!!popupAntenna}
          onClose={handlePopupClose}
          onOpenDetails={handleOpenDetails}
        />
      )}

      <AntennaDetailsPanel
        antenna={detailsAntenna ?? { id: '', name: '', siteId: '', provider: '', latitude: 0, longitude: 0, cells: [] }}
        allAntennas={antennas}
        initialTech={detailsTech ?? '4G'}
        open={!!detailsAntenna}
        onClose={handleDetailsClose}
      />
    </div>
  )
}

/**
 * Map page shell. Wraps `MapPageInner` in Suspense to satisfy `useSearchParams`
 * requirements in the Next.js App Router.
 */
export default function MapPage() {
  return (
    <Suspense>
      <MapPageInner />
    </Suspense>
  )
}
