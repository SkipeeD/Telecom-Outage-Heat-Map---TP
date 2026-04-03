"use client"

import { motion } from "motion/react"
import { useEffect, useState } from "react"
import { GlobePulse, type PulseMarker } from "@/components/ui/cobe-globe-pulse"
import type { AlarmSeverity } from "@/types"

const LOCATIONS: [number, number][] = [
  [51.51,  -0.13],   // London
  [40.71,  -74.01],  // New York
  [35.68,  139.65],  // Tokyo
  [-33.87, 151.21],  // Sydney
  [1.35,   103.82],  // Singapore
  [-23.55, -46.63],  // São Paulo
  [28.61,  77.21],   // Delhi
  [30.06,  31.25],   // Cairo
  [52.52,  13.40],   // Berlin
  [6.52,   3.38],    // Lagos
  [19.43,  -99.13],  // Mexico City
  [55.75,  37.62],   // Moscow
]

// Weighted random status — mostly ok/warning, occasional critical
const STATUSES: AlarmSeverity[] = [
  "ok", "ok", "ok", "ok",
  "warning", "warning",
  "minor",
  "major",
  "critical",
]

function randomStatus(): AlarmSeverity {
  return STATUSES[Math.floor(Math.random() * STATUSES.length)]
}

function buildMarkers(): PulseMarker[] {
  return LOCATIONS.map((location, i) => ({
    id:       `globe-${i}`,
    location,
    delay:    i * 0.35,
    status:   randomStatus(),
  }))
}

export function GlobeAuthBackground({ title, subtitle }: { title: string; subtitle: string }) {
  const [mounted, setMounted] = useState(false)
  const [markers, setMarkers] = useState<PulseMarker[]>([])

  useEffect(() => {
    setMounted(true)
    setMarkers(buildMarkers())
  }, [])

  if (!mounted) return null

  return (
    <div className="relative h-full w-full flex flex-col items-center justify-center bg-[var(--bg-base)] overflow-hidden transition-colors duration-300">
      {/* Left-edge fade — blends into the form panel */}
      <div
        className="absolute inset-y-0 left-0 w-32 z-10 pointer-events-none"
        style={{ background: "linear-gradient(to right, var(--bg-base), transparent)" }}
      />

      {/* Background Grid */}
      <div
        className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]"
        style={{
          backgroundImage: `linear-gradient(var(--text-primary) 1px, transparent 1px), linear-gradient(90deg, var(--text-primary) 1px, transparent 1px)`,
          backgroundSize: "40px 40px",
        }}
      />

      {/* Globe */}
      <motion.div
        className="w-full max-w-[520px] px-8"
        initial={{ opacity: 0, scale: 0.92, filter: "blur(12px)" }}
        animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
        transition={{ duration: 1.2, ease: [0.4, 0, 0.2, 1] }}
      >
        <GlobePulse markers={markers} />
      </motion.div>

      {/* Text — Top Right */}
      <motion.div
        className="absolute top-12 right-12 z-10 text-right"
        initial={{ opacity: 0, x: 20, filter: "blur(8px)" }}
        animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      >
        <h2 className="text-[20px] font-semibold text-[var(--text-primary)] mb-2 tracking-[0.2em] uppercase font-sans">
          {title}
        </h2>
        <p className="text-[12px] text-[var(--text-secondary)] max-w-xs ml-auto leading-[1.6] font-sans">
          {subtitle}
        </p>
      </motion.div>

      {/* Scanning Line */}
      <motion.div
        className="absolute left-0 right-0 h-[1px] bg-[var(--accent)] opacity-[0.1] z-0"
        animate={{ top: ["0%", "100%"] }}
        transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
      />
    </div>
  )
}
