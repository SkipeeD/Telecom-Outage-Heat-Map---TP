'use client'

const EASE: [number, number, number, number] = [0.4, 0, 0.2, 1]

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { motion } from 'motion/react'
import { getAntennas } from '@/lib/firestore'
import { useAuth } from '@/components/AuthProvider'
import { useFilters, FilterSeverity } from '@/components/FilterProvider'
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


function MapPageInner() {
  const { user, loading: authLoading } = useAuth()
  const { selectedSeverity, setCounts } = useFilters()
  const searchParams = useSearchParams()
  const focusAntennaId = searchParams.get('antennaId') ?? searchParams.get('selectSite')
  const [antennas, setAntennas] = useState<Antenna[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [popupAntenna, setPopupAntenna] = useState<Antenna | null>(null)
  const [popupAnchor, setPopupAnchor] = useState<Element | null>(null)
  const [detailsAntenna, setDetailsAntenna] = useState<Antenna | null>(null)
  const [detailsTech, setDetailsTech] = useState<Technology | null>(null)
  const [weatherRisk, setWeatherRisk] = useState<Record<string, boolean>>({})
  const [weatherDetails, setWeatherDetails] = useState<CityWeatherDetail[]>([])

  useEffect(() => {
    if (!user) return
    let cancelled = false

    const fetchAntennas = async () => {
      try {
        // Pass the active severity filter — server filters the antenna list and
        // always returns full counts so the filter bar stays accurate.
        const { antennas: data, counts } = await getAntennas(
          selectedSeverity !== 'all' ? selectedSeverity : undefined
        )
        if (cancelled) return
        setAntennas(data)
        setCounts(counts as Record<FilterSeverity, number>)
      } catch {
        // Keep stale data visible — don't clear antennas on error
      }
    }

    void fetchAntennas()
    const id = setInterval(() => void fetchAntennas(), 30_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [user, setCounts, selectedSeverity])

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

  const handleAntennaClick = (antenna: Antenna, anchorEl: Element) => {
    const isDeselecting = selectedId === antenna.id
    setSelectedId(isDeselecting ? null : antenna.id)
    if (isDeselecting) {
      setPopupAntenna(null)
      setPopupAnchor(null)
    } else {
      setPopupAntenna(antenna)
      setPopupAnchor(anchorEl)
    }
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
  }

  const handleDetailsClose = () => {
    setDetailsAntenna(null)
    setDetailsTech(null)
    setSelectedId(null)
  }

  if (authLoading) return null

  const activeFilters = {
    severities: selectedSeverity === 'all'
      ? undefined
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
          antennas={antennas}
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

export default function MapPage() {
  return (
    <Suspense>
      <MapPageInner />
    </Suspense>
  )
}
