'use client'

import { useState, useRef, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Search } from 'lucide-react'
import type { Antenna, Incident } from '@/types'
import { getAllIncidents } from '@/lib/firestore'

function normalize(str: string) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

interface Result {
  antenna: Antenna
  label: string
  sublabel: string
}

interface Props {
  antennas: Antenna[]
  onSelect: (antenna: Antenna) => void
}

export function MapSearch({ antennas, onSelect }: Props) {
  const [expanded, setExpanded]   = useState(false)
  const [query, setQuery]         = useState('')
  const [incidents, setIncidents] = useState<Incident[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getAllIncidents().then(setIncidents).catch(() => {})
  }, [])

  const results = useMemo((): Result[] => {
    const q = normalize(query.trim())
    if (!q) return []

    const seen = new Set<string>()
    const out: Result[] = []

    for (const a of antennas) {
      if (normalize(a.name).includes(q) || normalize(a.siteId).includes(q)) {
        if (!seen.has(a.id)) {
          seen.add(a.id)
          out.push({ antenna: a, label: a.name, sublabel: a.siteId })
        }
      }
    }

    for (const inc of incidents) {
      if (normalize(inc.incidentNumber).includes(q) || normalize(inc.siteId).includes(q)) {
        const antenna = antennas.find(a => a.id === inc.antennaId)
        if (antenna && !seen.has(antenna.id)) {
          seen.add(antenna.id)
          out.push({ antenna, label: inc.incidentNumber, sublabel: `${antenna.name} · ${antenna.siteId}` })
        }
      }
    }

    return out.slice(0, 40)
  }, [query, antennas, incidents])

  function handleExpand() {
    setExpanded(true)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  function handleCollapse() {
    setExpanded(false)
    setQuery('')
  }

  function handleSelect(antenna: Antenna) {
    onSelect(antenna)
    handleCollapse()
  }

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9995] flex flex-col-reverse items-center gap-2">
      {/* Search pill */}
      <motion.div
        animate={{ width: expanded ? 280 : 40 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="relative flex items-center justify-center h-10 rounded-[var(--radius-full)]
          backdrop-blur-xl backdrop-saturate-[280%]
          border shadow-[0_0_18px_rgba(124,111,247,0.25),0_4px_24px_rgba(0,0,0,0.55)]
          overflow-hidden"
        style={{
          background: expanded
            ? 'rgba(14,12,38,0.88)'
            : 'linear-gradient(135deg, rgba(124,111,247,0.18) 0%, rgba(9,9,28,0.88) 100%)',
          borderColor: expanded ? 'rgba(124,111,247,0.25)' : 'rgba(124,111,247,0.45)',
        }}
      >
        {/* Icon button — always visible, click or hover expands */}
        <button
          onClick={!expanded ? handleExpand : undefined}
          onMouseEnter={!expanded ? handleExpand : undefined}
          className="shrink-0 w-10 h-10 flex items-center justify-center cursor-pointer"
          aria-label="Search"
        >
          <Search
            className="size-4"
            style={{ color: expanded ? 'var(--text-secondary)' : 'var(--accent-bright)' }}
          />
        </button>

        <AnimatePresence>
          {expanded && (
            <motion.input
              ref={inputRef}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onBlur={handleCollapse}
              onKeyDown={e => { if (e.key === 'Escape') handleCollapse() }}
              placeholder="Site, name or incident…"
              className="flex-1 bg-transparent border-none outline-none pr-4
                text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]
                font-mono"
            />
          )}
        </AnimatePresence>
      </motion.div>

      {/* Results dropdown — appears above the pill */}
      <AnimatePresence>
        {results.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] as const }}
            className="w-[280px] rounded-[var(--radius-lg)] overflow-hidden
              bg-[rgba(9,9,20,0.94)] backdrop-blur-xl
              border border-[rgba(255,255,255,0.1)]
              shadow-[0_8px_32px_rgba(0,0,0,0.6)]"
          >
            <div className="max-h-[260px] overflow-y-auto scrollbar-hide">
            {results.map((r, i) => (
              <button
                key={`${r.antenna.id}-${i}`}
                onMouseDown={() => handleSelect(r.antenna)}
                className="w-full flex items-center gap-3 px-4 py-2.5
                  hover:bg-[var(--glass-hover)] transition-colors duration-100
                  border-b border-[var(--glass-border)] last:border-0
                  cursor-pointer text-left"
              >
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-[12px] font-medium text-[var(--text-primary)] truncate">
                    {r.label}
                  </span>
                  <span className="text-[10px] font-mono text-[var(--text-muted)] truncate">
                    {r.sublabel}
                  </span>
                </div>
              </button>
            ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
