"use client"

import { useEffect, useRef, useCallback } from "react"
import createGlobe from "cobe"
import type { AlarmSeverity } from "@/types"

export interface PulseMarker {
  id: string
  location: [number, number]
  delay: number
  status: AlarmSeverity
}

interface GlobePulseProps {
  markers?: PulseMarker[]
  className?: string
  speed?: number
}

// Status → CSS variable for colour
const STATUS_COLOR: Record<AlarmSeverity, string> = {
  ok:       "var(--alarm-ok)",
  warning:  "var(--alarm-warning)",
  minor:    "var(--alarm-minor)",
  major:    "var(--alarm-major)",
  critical: "var(--alarm-critical)",
}

// Pulse duration per severity — critical is fast/urgent, ok is calm
const PULSE_DURATION: Record<AlarmSeverity, number> = {
  critical: 1.2,
  major:    1.6,
  minor:    2.0,
  warning:  2.4,
  ok:       3.0,
}

// Same coordinate transform cobe uses internally
function latLngTo3D([lat, lng]: [number, number]): [number, number, number] {
  const phi    = (lat * Math.PI) / 180
  const lambda = (lng * Math.PI) / 180 - Math.PI
  const c      = Math.cos(phi)
  return [-c * Math.cos(lambda), Math.sin(phi), c * Math.sin(lambda)]
}

// Same projection cobe uses; returns normalised [0,1] screen coords + visibility
function project(
  p: [number, number, number],
  globePhi: number,
  globeTheta: number,
  aspect: number,
): { x: number; y: number; visible: boolean } {
  const cp = Math.cos(globePhi),  sp = Math.sin(globePhi)
  const ct = Math.cos(globeTheta), st = Math.sin(globeTheta)
  const e = 0.8
  const [px, py, pz] = p.map(v => v * e) as [number, number, number]
  const cx = cp * px + sp * pz
  const cy = sp * st * px + ct * py - cp * st * pz
  const cz = -sp * ct * px + st * py + cp * ct * pz
  return {
    x:       (cx / aspect + 1) / 2,
    y:       (-cy + 1) / 2,
    visible: cz >= 0 || cx * cx + cy * cy >= 0.64,
  }
}

// Inject shared keyframes once
let keyframesInjected = false
function ensureKeyframes() {
  if (keyframesInjected || typeof document === "undefined") return
  const style = document.createElement("style")
  style.textContent = `
    @keyframes globe-sonar {
      0%   { transform: scale(0.2); opacity: 0.9; }
      100% { transform: scale(3.5); opacity: 0;   }
    }
    @keyframes globe-antenna-in {
      from { opacity: 0; transform: translate(-50%, -50%) scale(0.6); }
      to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    }
  `
  document.head.appendChild(style)
  keyframesInjected = true
}

// Build one marker DOM node (wrapper + 2 pulse rings + antenna SVG)
function buildMarkerEl(status: AlarmSeverity, delay: number): HTMLDivElement {
  const color    = STATUS_COLOR[status]
  const duration = PULSE_DURATION[status]

  const wrapper = document.createElement("div")
  wrapper.style.cssText = `
    position: absolute;
    width: 0; height: 0;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.3s ease;
  `

  // Two sonar rings
  for (let i = 0; i < 2; i++) {
    const ring = document.createElement("div")
    ring.style.cssText = `
      position: absolute;
      width: 20px; height: 20px;
      left: -10px; top: -10px;
      border-radius: 50%;
      border: 1.5px solid ${color};
      opacity: 0;
      animation: globe-sonar ${duration}s ease-out infinite ${delay + i * (duration / 2)}s;
      pointer-events: none;
    `
    wrapper.appendChild(ring)
  }

  // Antenna SVG icon — base sits at the marker point, tower extends upward
  const iconWrapper = document.createElement("div")
  iconWrapper.style.cssText = `
    position: absolute;
    left: 0; bottom: 0;
    transform: translate(-50%, 0);
    color: ${color};
    filter: drop-shadow(0 0 5px ${color});
    line-height: 0;
    pointer-events: none;
  `
  iconWrapper.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
         fill="none" stroke="currentColor" stroke-width="1.8"
         stroke-linecap="round" stroke-linejoin="round">
      <path d="M4.9 16.1C1 12.2 1 5.8 4.9 1.9"/>
      <path d="M7.8 4.7a6.14 6.14 0 0 0 0 8.5"/>
      <circle cx="12" cy="9" r="2"/>
      <line x1="12" x2="12" y1="11" y2="22"/>
      <line x1="8"  x2="16" y1="22" y2="22"/>
      <path d="M16.1 4.9a6.14 6.14 0 0 1 0 8.5"/>
      <path d="M19.1 1.9a10.67 10.67 0 0 1 0 14.1"/>
    </svg>
  `
  wrapper.appendChild(iconWrapper)
  return wrapper
}

export function GlobePulse({
  markers = [],
  className = "",
  speed = 0.003,
}: GlobePulseProps) {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const iconEls    = useRef<Map<string, HTMLDivElement>>(new Map())

  const pointerInteracting = useRef<{ x: number; y: number } | null>(null)
  const dragOffset         = useRef({ phi: 0, theta: 0 })
  const phiOffsetRef       = useRef(0)
  const thetaOffsetRef     = useRef(0)
  const isPausedRef        = useRef(false)

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    pointerInteracting.current = { x: e.clientX, y: e.clientY }
    if (canvasRef.current) canvasRef.current.style.cursor = "grabbing"
    isPausedRef.current = true
  }, [])

  const handlePointerUp = useCallback(() => {
    if (pointerInteracting.current !== null) {
      phiOffsetRef.current  += dragOffset.current.phi
      thetaOffsetRef.current += dragOffset.current.theta
      dragOffset.current     = { phi: 0, theta: 0 }
    }
    pointerInteracting.current = null
    if (canvasRef.current) canvasRef.current.style.cursor = "grab"
    isPausedRef.current = false
  }, [])

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (pointerInteracting.current !== null) {
        dragOffset.current = {
          phi:   (e.clientX - pointerInteracting.current.x) / 300,
          theta: (e.clientY - pointerInteracting.current.y) / 1000,
        }
      }
    }
    window.addEventListener("pointermove", onMove,             { passive: true })
    window.addEventListener("pointerup",   handlePointerUp,    { passive: true })
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup",   handlePointerUp)
    }
  }, [handlePointerUp])

  // Rebuild icon DOM whenever markers change
  useEffect(() => {
    ensureKeyframes()
    const overlay = overlayRef.current
    if (!overlay) return
    overlay.innerHTML = ""
    iconEls.current.clear()

    for (const m of markers) {
      const el = buildMarkerEl(m.status, m.delay)
      overlay.appendChild(el)
      iconEls.current.set(m.id, el)
    }

    return () => { overlay.innerHTML = "" }
  }, [markers])

  // Globe + animation loop
  useEffect(() => {
    if (!canvasRef.current) return
    const canvas = canvasRef.current
    let globe: ReturnType<typeof createGlobe> | null = null
    let animationId: number
    let phi = 0

    const positions3D = markers.map(m => latLngTo3D(m.location))

    function updateIcons(globePhi: number, globeTheta: number) {
      const w = canvas.offsetWidth
      const h = canvas.offsetHeight
      if (w === 0 || h === 0) return
      const aspect = w / h

      markers.forEach((m, i) => {
        const el = iconEls.current.get(m.id)
        if (!el) return
        const { x, y, visible } = project(positions3D[i], globePhi, globeTheta, aspect)
        el.style.left    = `${x * 100}%`
        el.style.top     = `${y * 100}%`
        el.style.opacity = visible ? "1" : "0"
      })
    }

    function init() {
      const width = canvas.offsetWidth
      if (width === 0 || globe) return

      globe = createGlobe(canvas, {
        devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        width, height: width,
        phi: 0, theta: 0.2, dark: 1, diffuse: 1.5,
        mapSamples: 16000, mapBrightness: 10,
        baseColor:   [0.12, 0.12, 0.2],
        markerColor: [0.47, 0.44, 0.97],
        glowColor:   [0.08, 0.06, 0.2],
        markerElevation: 0,
        markers: markers.map(m => ({ location: m.location, size: 0.001 })),
        arcs: [], arcColor: [0.47, 0.44, 0.97],
        arcWidth: 0.5, arcHeight: 0.25, opacity: 0.7,
      })

      function animate() {
        if (!isPausedRef.current) phi += speed
        const curPhi   = phi + phiOffsetRef.current  + dragOffset.current.phi
        const curTheta = 0.2 + thetaOffsetRef.current + dragOffset.current.theta
        globe!.update({ phi: curPhi, theta: curTheta })
        updateIcons(curPhi, curTheta)
        animationId = requestAnimationFrame(animate)
      }
      animate()
      setTimeout(() => canvas && (canvas.style.opacity = "1"))
    }

    if (canvas.offsetWidth > 0) {
      init()
    } else {
      const ro = new ResizeObserver(entries => {
        if (entries[0]?.contentRect.width > 0) { ro.disconnect(); init() }
      })
      ro.observe(canvas)
    }

    return () => {
      if (animationId) cancelAnimationFrame(animationId)
      if (globe) globe.destroy()
    }
  }, [markers, speed])

  return (
    <div className={`relative aspect-square select-none ${className}`}>
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        style={{
          width: "100%", height: "100%", cursor: "grab", opacity: 0,
          transition: "opacity 1.2s ease", borderRadius: "50%", touchAction: "none",
        }}
      />
      <div ref={overlayRef} className="absolute inset-0 pointer-events-none" />
    </div>
  )
}
