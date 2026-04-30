"use client"

import { motion } from "motion/react"
import { useEffect, useState } from "react"
import { GlobePulse, type PulseMarker } from "@/components/ui/cobe-globe-pulse"
import { LampBeam } from "@/components/ui/lamp"
import { Typewriter } from "@/components/ui/typewriter"
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

export function GlobeAuthBackground() {
  const [markers, setMarkers] = useState<PulseMarker[]>([])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMarkers(buildMarkers())
  }, [])

  if (!markers.length) return null

  return (
    <div className="relative h-full w-full flex flex-col items-center justify-center overflow-hidden transition-colors duration-300">
      {/* Lamp at the top of the globe panel */}
      <div className="absolute top-0 left-0 right-0 h-48 pointer-events-none opacity-35">
        <LampBeam className="h-full" />
      </div>

      {/* Globe — nudged up slightly */}
      <motion.div
        className="w-full max-w-[520px] px-8 -translate-y-10"
        initial={{ opacity: 0, scale: 0.92, filter: "blur(12px)" }}
        animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
        transition={{ duration: 1.2, ease: [0.4, 0, 0.2, 1] }}
      >
        <GlobePulse markers={markers} />
      </motion.div>

      {/* Text — Bottom Right */}
      <motion.div
        className="absolute bottom-12 right-12 z-10 text-right"
        initial={{ opacity: 0, y: 16, filter: "blur(8px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.8, ease: "easeOut", delay: 0.4 }}
      >
        <div className="text-[11px] font-mono text-[var(--accent-bright)] tracking-widest uppercase mb-2">
          <Typewriter
            text={[
              "Live antenna alarm monitoring",
              "Critical · Major · Minor · Warning",
              "6G · 5G · 4G · 3G · 2G coverage",
              "Firestore real-time sync",
              "Romania network outage map",
              "Weather risk zone detection",
              "Cell tower status tracking",
            ]}
            speed={150}
            deleteSpeed={70}
            waitTime={4000}
            cursorChar="_"
            className=""
            cursorClassName="text-[var(--accent-bright)]"
          />
        </div>
      </motion.div>

    </div>
  )
}
