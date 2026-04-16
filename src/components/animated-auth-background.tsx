"use client"

import { motion, AnimatePresence } from "motion/react"
import { useEffect, useState, useMemo } from "react"

const COLORS = [
  "var(--alarm-critical)",
  "var(--alarm-major)",
  "var(--tech-5g)",
  "var(--alarm-ok)",
  "var(--alarm-warning)",
  "var(--accent)",
]

function DynamicPin({ delay }: { delay: number }) {
  const [config, setConfig] = useState<{
    x: string
    y: string
    color: string
    siteId: number
    visible: boolean
  } | null>(null)

  const randomize = useMemo(() => () => ({
    x: `${15 + Math.random() * 70}%`,
    y: `${15 + Math.random() * 70}%`,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    siteId: Math.floor(1000 + Math.random() * 8999),
    visible: true
  }), [])

  useEffect(() => {
    // Initial delay
    const startTimeout = setTimeout(() => {
      setConfig(randomize())
    }, delay * 1000)

    return () => clearTimeout(startTimeout)
  }, [delay, randomize])

  useEffect(() => {
    if (!config) return

    // Every 7 seconds, relocate the pin
    const cycleInterval = setInterval(() => {
      setConfig(prev => prev ? { ...prev, visible: false } : null)
      
      // Wait for exit animation, then show at new spot
      setTimeout(() => {
        setConfig(randomize())
      }, 1000)
    }, 7000)

    return () => clearInterval(cycleInterval)
  }, [config, randomize])

  if (!config) return null

  return (
    <AnimatePresence>
      {config.visible && (
        <motion.div 
          className="absolute" 
          style={{ left: config.x, top: config.y }}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          {/* Pulsing ring */}
          <motion.div
            className="absolute -inset-4 rounded-full border-2"
            style={{ borderColor: config.color }}
            animate={{ scale: [0.5, 2], opacity: [0.4, 0] }}
            transition={{
              duration: 2.5,
              repeat: Infinity,
              ease: "easeOut"
            }}
          />
          
          {/* Core dot */}
          <div 
            className="h-2.5 w-2.5 rounded-full shadow-[0_0_12px_rgba(0,0,0,0.3)]"
            style={{ backgroundColor: config.color }}
          />
          
          {/* Floating Info Tag — Glass Style */}
          <motion.div
            className="absolute top-4 left-4 whitespace-nowrap bg-[var(--glass-bg)] backdrop-blur-md border border-[var(--glass-border)] px-2 py-1.5 rounded-[var(--radius-sm)] text-[10px] font-mono text-[var(--text-secondary)] pointer-events-none shadow-[var(--shadow-sm)]"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: [0, 1, 1, 0], y: [10, 0, 0, -10] }}
            transition={{
              duration: 5,
              times: [0, 0.1, 0.9, 1],
              delay: 0.5
            }}
          >
            <span className="text-[var(--text-muted)]">SITE_ID:</span> {config.siteId}
            <br />
            <span className="text-[var(--text-muted)]">STATUS:</span> {config.color.includes('critical') ? 'OUTAGE' : 'ACTIVE'}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

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

      {/* Dynamic Signals */}
      <div className="absolute inset-0">
        <DynamicPin delay={0} />
        <DynamicPin delay={1.5} />
        <DynamicPin delay={3} />
        <DynamicPin delay={4.5} />
        <DynamicPin delay={6} />
        <DynamicPin delay={7.5} />
      </div>

      {/* Subtle Ambient Scan Lines */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.05]">
        <pattern id="scanlines" width="100%" height="4" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="100%" y2="0" stroke="var(--text-primary)" strokeWidth="1" />
        </pattern>
        <rect width="100%" height="100%" fill="url(#scanlines)" />
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
