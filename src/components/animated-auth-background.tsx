"use client"

import { motion } from "motion/react"
import { useEffect, useState } from "react"

const PINS = [
  { id: 1, x: "20%", y: "30%", color: "var(--alarm-critical)", delay: 0 },
  { id: 2, x: "70%", y: "20%", color: "var(--alarm-major)", delay: 0.5 },
  { id: 3, x: "40%", y: "60%", color: "var(--tech-5g)", delay: 1 },
  { id: 4, x: "80%", y: "75%", color: "var(--alarm-ok)", delay: 1.5 },
  { id: 5, x: "15%", y: "80%", color: "var(--alarm-warning)", delay: 2 },
  { id: 6, x: "55%", y: "45%", color: "var(--accent)", delay: 0.8 },
]

export function AnimatedAuthBackground({ title, subtitle }: { title: string, subtitle: string }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  return (
    <div className="relative h-full w-full flex flex-col items-center justify-center bg-[var(--bg-base)] overflow-hidden transition-colors duration-300">
      {/* Background Grid */}
      <div 
        className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]" 
        style={{ 
          backgroundImage: `linear-gradient(var(--text-primary) 1px, transparent 1px), linear-gradient(90deg, var(--text-primary) 1px, transparent 1px)`, 
          backgroundSize: '40px 40px' 
        }}
      />

      {/* Animated Pins / Map Markers */}
      <div className="absolute inset-0">
        {PINS.map((pin) => (
          <div 
            key={pin.id} 
            className="absolute" 
            style={{ left: pin.x, top: pin.y }}
          >
            {/* Pulsing ring */}
            <motion.div
              className="absolute -inset-4 rounded-full border-2"
              style={{ borderColor: pin.color }}
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: [0.5, 2], opacity: [0.4, 0] }}
              transition={{
                duration: 2.5,
                repeat: Infinity,
                delay: pin.delay,
                ease: "easeOut"
              }}
            />
            {/* Core dot */}
            <motion.div
              className="h-2.5 w-2.5 rounded-full shadow-[0_0_12px_rgba(0,0,0,0.3)]"
              style={{ backgroundColor: pin.color }}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{
                type: "spring",
                stiffness: 260,
                damping: 20,
                delay: pin.delay
              }}
            />
            
            {/* Floating Info Tag — Glass Style */}
            <motion.div
              className="absolute top-4 left-4 whitespace-nowrap bg-[var(--glass-bg)] backdrop-blur-md border border-[var(--glass-border)] px-2 py-1.5 rounded-[var(--radius-sm)] text-[10px] font-mono text-[var(--text-secondary)] pointer-events-none shadow-[var(--shadow-sm)]"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: [0, 1, 1, 0], y: [10, 0, 0, -10] }}
              transition={{
                duration: 5,
                repeat: Infinity,
                delay: pin.delay + 1,
                times: [0, 0.1, 0.9, 1]
              }}
            >
              <span className="text-[var(--text-muted)]">SITE_ID:</span> {Math.floor(1000 + Math.random() * 9000)}
              <br />
              <span className="text-[var(--text-muted)]">STATUS:</span> {pin.color.includes('critical') ? 'OUTAGE' : 'ACTIVE'}
            </motion.div>
          </div>
        ))}
      </div>

      {/* Connection Lines (SVG) */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.15]">
        <motion.path
          d="M 20% 30% L 55% 45% L 70% 20%"
          stroke="var(--accent)"
          strokeWidth="1.5"
          fill="none"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.path
          d="M 15% 80% L 40% 60% L 55% 45% L 80% 75%"
          stroke="var(--text-muted)"
          strokeWidth="1"
          strokeDasharray="4 4"
          fill="none"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
        />
      </svg>

      {/* Text Content — Top Right, Refined Geist Typography */}
      <motion.div 
        className="absolute top-12 right-12 z-10 text-right"
        initial={{ opacity: 0, x: 20, filter: 'blur(8px)' }}
        animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      >
        <h2 className="text-[20px] font-semibold text-[var(--text-primary)] mb-2 tracking-[0.2em] uppercase font-sans">
          {title}
        </h2>
        <p className="text-[12px] text-[var(--text-secondary)] max-w-xs ml-auto leading-[1.6] font-sans">
          {subtitle}
        </p>
      </motion.div>

      {/* Scanning Line Effect — Refined */}
      <motion.div 
        className="absolute left-0 right-0 h-[1px] bg-[var(--accent)] opacity-[0.1] z-0"
        animate={{ top: ["0%", "100%"] }}
        transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
      />
    </div>
  )
}
