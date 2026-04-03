"use client"

import { useEffect, useRef, useCallback } from "react"
import createGlobe from "cobe"

interface PulseMarker {
  id: string
  location: [number, number]
  delay: number
}

interface GlobePulseProps {
  markers?: PulseMarker[]
  className?: string
  speed?: number
}

const defaultMarkers: PulseMarker[] = [
  { id: "pulse-1",  location: [51.51,  -0.13],   delay: 0 },    // London
  { id: "pulse-2",  location: [40.71,  -74.01],  delay: 0.5 },  // New York
  { id: "pulse-3",  location: [35.68,  139.65],  delay: 1.0 },  // Tokyo
  { id: "pulse-4",  location: [-33.87, 151.21],  delay: 1.5 },  // Sydney
  { id: "pulse-5",  location: [1.35,   103.82],  delay: 2.0 },  // Singapore
  { id: "pulse-6",  location: [-23.55, -46.63],  delay: 2.5 },  // São Paulo
  { id: "pulse-7",  location: [28.61,  77.21],   delay: 3.0 },  // Delhi
  { id: "pulse-8",  location: [30.06,  31.25],   delay: 3.5 },  // Cairo
  { id: "pulse-9",  location: [52.52,  13.40],   delay: 4.0 },  // Berlin
  { id: "pulse-10", location: [6.52,   3.38],    delay: 4.5 },  // Lagos
]

export function GlobePulse({
  markers = defaultMarkers,
  className = "",
  speed = 0.003,
}: GlobePulseProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pointerInteracting = useRef<{ x: number; y: number } | null>(null)
  const dragOffset = useRef({ phi: 0, theta: 0 })
  const phiOffsetRef = useRef(0)
  const thetaOffsetRef = useRef(0)
  const isPausedRef = useRef(false)

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    pointerInteracting.current = { x: e.clientX, y: e.clientY }
    if (canvasRef.current) canvasRef.current.style.cursor = "grabbing"
    isPausedRef.current = true
  }, [])

  const handlePointerUp = useCallback(() => {
    if (pointerInteracting.current !== null) {
      phiOffsetRef.current += dragOffset.current.phi
      thetaOffsetRef.current += dragOffset.current.theta
      dragOffset.current = { phi: 0, theta: 0 }
    }
    pointerInteracting.current = null
    if (canvasRef.current) canvasRef.current.style.cursor = "grab"
    isPausedRef.current = false
  }, [])

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (pointerInteracting.current !== null) {
        dragOffset.current = {
          phi: (e.clientX - pointerInteracting.current.x) / 300,
          theta: (e.clientY - pointerInteracting.current.y) / 1000,
        }
      }
    }
    window.addEventListener("pointermove", handlePointerMove, { passive: true })
    window.addEventListener("pointerup", handlePointerUp, { passive: true })
    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
    }
  }, [handlePointerUp])

  useEffect(() => {
    if (!canvasRef.current) return
    const canvas = canvasRef.current
    let globe: ReturnType<typeof createGlobe> | null = null
    let animationId: number
    let phi = 0

    function init() {
      const width = canvas.offsetWidth
      if (width === 0 || globe) return

      globe = createGlobe(canvas, {
        devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        width, height: width,
        phi: 0, theta: 0.2, dark: 1, diffuse: 1.5,
        mapSamples: 16000, mapBrightness: 10,
        baseColor: [0.12, 0.12, 0.2],
        markerColor: [0.47, 0.44, 0.97],
        glowColor: [0.08, 0.06, 0.2],
        markerElevation: 0,
        markers: markers.map((m, i) => ({ location: m.location, size: 0.018 + (i % 5) * 0.006, id: m.id })),
        arcs: [], arcColor: [0.47, 0.44, 0.97],
        arcWidth: 0.5, arcHeight: 0.25, opacity: 0.7,
      })

      function animate() {
        if (!isPausedRef.current) phi += speed
        globe!.update({
          phi: phi + phiOffsetRef.current + dragOffset.current.phi,
          theta: 0.2 + thetaOffsetRef.current + dragOffset.current.theta,
        })
        animationId = requestAnimationFrame(animate)
      }
      animate()
      setTimeout(() => canvas && (canvas.style.opacity = "1"))
    }

    if (canvas.offsetWidth > 0) {
      init()
    } else {
      const ro = new ResizeObserver((entries) => {
        if (entries[0]?.contentRect.width > 0) {
          ro.disconnect()
          init()
        }
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
      <style>{`
        @keyframes pulse-expand {
          0% { transform: scaleX(0.3) scaleY(0.3); opacity: 0.8; }
          100% { transform: scaleX(1.5) scaleY(1.5); opacity: 0; }
        }
      `}</style>
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        style={{
          width: "100%", height: "100%", cursor: "grab", opacity: 0,
          transition: "opacity 1.2s ease", borderRadius: "50%", touchAction: "none",
        }}
      />
      {markers.map((m) => (
        <div
          key={m.id}
          style={{
            position: "absolute",
            // @ts-expect-error CSS Anchor Positioning
            positionAnchor: `--cobe-${m.id}`,
            bottom: "anchor(center)",
            left: "anchor(center)",
            translate: "-50% 50%",
            width: 40, height: 40,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none" as const,
            opacity: `var(--cobe-visible-${m.id}, 0)`,
            filter: `blur(calc((1 - var(--cobe-visible-${m.id}, 0)) * 8px))`,
            transition: "opacity 0.4s, filter 0.4s",
          }}
        >
          <span style={{
            position: "absolute", inset: 0,
            border: "2px solid var(--accent-bright)", borderRadius: "50%", opacity: 0,
            animation: `pulse-expand ${1.6 + (markers.indexOf(m) % 4) * 0.4}s ease-out infinite ${m.delay}s`,
          }} />
          <span style={{
            position: "absolute", inset: 0,
            border: "2px solid var(--accent-bright)", borderRadius: "50%", opacity: 0,
            animation: `pulse-expand ${1.6 + (markers.indexOf(m) % 4) * 0.4}s ease-out infinite ${m.delay + 0.6}s`,
          }} />
          <span style={{
            width: 10, height: 10,
            background: "var(--accent)",
            borderRadius: "50%",
            boxShadow: "0 0 0 3px var(--bg-base), 0 0 0 5px var(--accent)",
          }} />
        </div>
      ))}
    </div>
  )
}
