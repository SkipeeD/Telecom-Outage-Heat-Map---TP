'use client'

import React, { createContext, useContext, useState, useMemo } from 'react'
import type { AlarmSeverity } from '@/types'

export type FilterSeverity = AlarmSeverity | 'all'

interface FilterContextType {
  selectedSeverity: FilterSeverity
  setSelectedSeverity: (s: FilterSeverity) => void
  counts: Record<FilterSeverity, number>
  setCounts: (counts: Record<FilterSeverity, number>) => void
}

const FilterContext = createContext<FilterContextType | undefined>(undefined)

export function FilterProvider({ children }: { children: React.ReactNode }) {
  const [selectedSeverity, setSelectedSeverity] = useState<FilterSeverity>('all')
  const [counts, setCounts] = useState<Record<FilterSeverity, number>>({
    all: 0,
    critical: 0,
    major: 0,
    minor: 0,
    warning: 0,
    ok: 0
  })

  const value = useMemo(() => ({
    selectedSeverity,
    setSelectedSeverity,
    counts,
    setCounts
  }), [selectedSeverity, counts])

  return (
    <FilterContext.Provider value={value}>
      {children}
    </FilterContext.Provider>
  )
}

export function useFilters() {
  const context = useContext(FilterContext)
  if (context === undefined) {
    throw new Error('useFilters must be used within a FilterProvider')
  }
  return context
}
