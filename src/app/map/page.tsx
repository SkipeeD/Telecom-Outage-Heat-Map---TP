'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { subscribeToAntennas } from '@/lib/firestore'
import { useAuth } from '@/components/AuthProvider'
import type { Antenna, Technology, AlarmSeverity } from '@/types'

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

export default function MapPage() {
  const { user, loading: authLoading } = useAuth()
  const [antennas, setAntennas] = useState<Antenna[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filters] = useState<{ technologies: Technology[], severities: AlarmSeverity[] }>({
    technologies: [],
    severities: [],
  })

  useEffect(() => {
    // Only subscribe to antennas in Firestore if the user is authenticated
    if (!user) return

    const unsubscribe = subscribeToAntennas((data) => {
      setAntennas(data)
    })
    return () => unsubscribe()
  }, [user])

  const handleAntennaClick = (antenna: Antenna) => {
    setSelectedId(prev => (prev === antenna.id ? null : antenna.id))
    console.log('Selected antenna:', antenna)
  }

  // AuthProvider handles the loading state, but we ensure we don't render 
  // data-dependent components until auth is resolved.
  if (authLoading) return null

  return (
    <div className="w-full h-screen bg-[var(--bg-base)] overflow-hidden transition-colors duration-300">
      <MapClient 
        antennas={antennas} 
        selectedId={selectedId}
        activeFilters={filters}
        onAntennaClick={handleAntennaClick} 
      />
    </div>
  )
}
