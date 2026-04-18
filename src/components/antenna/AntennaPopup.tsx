'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { Antenna, Technology } from '@/types'
import {
  TECHS,
  overallSeverity,
  sevColorVar,
  statusCopy,
  worstAlarmCell,
} from '@/lib/antenna-helpers'
import { SeverityBadge } from './SeverityBadge'
import { CellTile } from './CellTile'
import { AlarmCard, EmptyAlarm } from './AlarmCard'
import { Button } from '@/components/ui/button'

const POPUP_WIDTH = 360
const GAP = 12
const MARGIN = 12

type Placement = 'top' | 'bottom'
interface Position {
  left: number
  top: number
  placement: Placement
  arrowX: number
}

interface Props {
  antenna: Antenna
  anchor: Element | null
  open: boolean
  onClose: () => void
  onAcknowledge?: (antenna: Antenna) => void
  onOpenDetails?: (antenna: Antenna) => void
}

export function AntennaPopup({
  antenna,
  anchor,
  open,
  onClose,
  onAcknowledge,
  onOpenDetails,
}: Props) {
  const shouldReduce = useReducedMotion()
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState<Position | null>(null)
  const [acknowledged, setAcknowledged] = useState(false)
  const hasDragged = useRef(false)

  const overall = useMemo(() => overallSeverity(antenna.cells), [antenna.cells])
  const worstCell = useMemo(() => worstAlarmCell(antenna.cells), [antenna.cells])

  const [prevAntennaId, setPrevAntennaId] = useState(antenna.id)
  const [selectedTech, setSelectedTech] = useState<Technology | null>(
    worstCell?.technology ?? antenna.cells[0]?.technology ?? null,
  )

  // Reset state during render when the antenna changes (avoids setState-in-effect)
  if (prevAntennaId !== antenna.id) {
    setPrevAntennaId(antenna.id)
    setSelectedTech(worstCell?.technology ?? antenna.cells[0]?.technology ?? null)
    setAcknowledged(false)
  }

  // Ref mutation must stay outside render
  useEffect(() => {
    hasDragged.current = false
  }, [antenna.id])

  useLayoutEffect(() => {
    if (!open || !anchor || !wrapRef.current) return
    if (hasDragged.current) return
    const calc = () => {
      const el = wrapRef.current
      if (!el || !anchor) return
      const a = anchor.getBoundingClientRect()
      const winH = window.innerHeight
      const winW = window.innerWidth
      const h = Math.min(el.offsetHeight, winH - MARGIN * 2)
      const spaceBelow = winH - a.bottom - GAP - MARGIN
      const spaceAbove = a.top - GAP - MARGIN

      let placement: Placement
      let top: number
      if (h <= spaceBelow) {
        placement = 'bottom'; top = a.bottom + GAP
      } else if (h <= spaceAbove) {
        placement = 'top'; top = a.top - GAP - h
      } else if (spaceBelow >= spaceAbove) {
        placement = 'bottom'; top = a.bottom + GAP
      } else {
        placement = 'top'; top = a.top - GAP - h
      }
      top = Math.max(MARGIN, Math.min(winH - h - MARGIN, top))

      let left = a.left + a.width / 2 - POPUP_WIDTH / 2
      left = Math.max(MARGIN, Math.min(winW - POPUP_WIDTH - MARGIN, left))

      const anchorCenterX = a.left + a.width / 2
      const arrowX = Math.max(18, Math.min(POPUP_WIDTH - 18, anchorCenterX - left))

      setPos({ left, top, placement, arrowX })
    }
    calc()
    window.addEventListener('resize', calc)
    window.addEventListener('scroll', calc, true)
    return () => {
      window.removeEventListener('resize', calc)
      window.removeEventListener('scroll', calc, true)
    }
  }, [open, anchor, antenna.id, selectedTech])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const onClick = (e: MouseEvent) => {
      const el = wrapRef.current
      if (!el) return
      if (!el.contains(e.target as Node) && !(anchor && anchor.contains(e.target as Node))) {
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [open, onClose, anchor])

  const selectedCell = selectedTech
    ? antenna.cells.find(c => c.technology === selectedTech)
    : null

  const entryTransition = shouldReduce
    ? { duration: 0 }
    : { duration: 0.26, ease: [0.34, 1.56, 0.64, 1] as const }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={wrapRef}
          role="dialog"
          aria-label={`${antenna.name} antenna details`}
          drag
          dragMomentum={false}
          dragElastic={0}
          onDragStart={() => { hasDragged.current = true }}
          initial={{ opacity: 0, y: 6, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.97, transition: { duration: 0.18 } }}
          transition={entryTransition}
          data-placement={pos?.placement ?? 'bottom'}
          style={{
            position: 'fixed',
            left: pos?.left ?? -9999,
            top: pos?.top ?? -9999,
            width: POPUP_WIDTH,
            maxHeight: 'calc(100vh - 24px)',
            zIndex: 9999,
            transformOrigin: `${pos?.arrowX ?? POPUP_WIDTH / 2}px ${pos?.placement === 'top' ? '100%' : '0%'}`,
          }}
          className="
            flex flex-col overflow-hidden
            rounded-[var(--radius-lg)]
            border border-[rgba(255,255,255,0.1)]
            shadow-[0_8px_40px_rgba(0,0,0,0.7),0_2px_8px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.07)]
            bg-[rgba(15,15,30,0.50)]
            backdrop-blur-2xl backdrop-saturate-[280%] backdrop-brightness-[0.85]
            cursor-grab active:cursor-grabbing
          "
        >
          {/* Arrow */}
          {pos && (
            <span
              aria-hidden
              className="absolute w-3.5 h-3.5 rotate-45 bg-[rgba(15,15,30,0.50)] backdrop-blur-2xl"
              style={{
                left: pos.arrowX - 7,
                top: pos.placement === 'bottom' ? -8 : undefined,
                bottom: pos.placement === 'top' ? -8 : undefined,
                borderLeft: pos.placement === 'bottom' ? '1px solid var(--glass-border)' : undefined,
                borderTop: pos.placement === 'bottom' ? '1px solid var(--glass-border)' : undefined,
                borderRight: pos.placement === 'top' ? '1px solid var(--glass-border)' : undefined,
                borderBottom: pos.placement === 'top' ? '1px solid var(--glass-border)' : undefined,
              }}
            />
          )}

          {/* Header — drag handle */}
          <div className="flex items-start gap-3 px-4 pt-3.5 pb-3 border-b border-[var(--glass-border)] shrink-0 select-none">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5 font-mono text-[10px] tracking-[0.14em] uppercase text-[var(--text-muted)]">
                <span className="text-[var(--text-secondary)]">{antenna.siteId}</span>
                <span>·</span>
                <span>{antenna.provider.toUpperCase()}</span>
              </div>
              <div className="text-[16px] font-semibold leading-[1.3] text-[var(--text-primary)] truncate">
                {antenna.name}
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="
                shrink-0 w-7 h-7 grid place-items-center rounded-[var(--radius-md)]
                text-[var(--text-muted)] border border-transparent cursor-pointer
                hover:text-[var(--text-primary)] hover:bg-[var(--glass-hover)] hover:border-[var(--glass-border)]
                transition-colors duration-200
              "
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M3 3 L11 11 M11 3 L3 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 min-h-0 overflow-y-auto cursor-default">
            <div className="px-4 pt-3.5 pb-1">
              {/* Status strip */}
              <div className="flex items-center gap-2.5 px-3 py-2.5 mb-3.5 rounded-[var(--radius-md)] border bg-[var(--glass-bg)] border-[var(--glass-border)]">
                <span
                  aria-hidden
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{
                    background: `var(${sevColorVar[overall]})`,
                    boxShadow: `0 0 10px var(${sevColorVar[overall]})`,
                  }}
                />
                <span className="flex-1 text-[12px] text-[var(--text-primary)]">
                  {statusCopy(overall, antenna.cells)}
                </span>
                <SeverityBadge severity={overall} />
              </div>

              {/* Cells */}
              <SectionLabel
                left={
                  <>
                    Cells by technology
                    <span className="ml-1.5 font-normal normal-case tracking-[0.02em] text-[10px] text-[var(--text-muted)]">
                      · click to inspect
                    </span>
                  </>
                }
                right={`${antenna.cells.length}/${TECHS.length}`}
              />
              <div className="grid grid-cols-5 gap-1.5 mb-3.5">
                {TECHS.map(t => {
                  const cell = antenna.cells.find(c => c.technology === t)
                  return (
                    <CellTile
                      key={t}
                      tech={t}
                      cell={cell}
                      selected={!!cell && selectedTech === t}
                      onSelect={() => setSelectedTech(t)}
                    />
                  )
                })}
              </div>

              {/* Current alarm */}
              <SectionLabel
                left={
                  <>
                    Current alarm
                    {selectedCell && (
                      <span className="ml-1.5 font-mono font-medium tracking-[0.08em] text-[var(--accent-bright)]">
                        · {selectedCell.technology}
                      </span>
                    )}
                  </>
                }
                right={undefined}
              />
              <div className="mb-3.5">
                {!selectedCell ? (
                  <EmptyAlarm text="No cell selected." />
                ) : selectedCell.currentAlarm ? (
                  <AlarmCard alarm={selectedCell.currentAlarm} />
                ) : (
                  <EmptyAlarm text={`${selectedCell.technology} cell nominal — no active alarm.`} />
                )}
              </div>

              {/* Meta */}
              <div className="grid grid-cols-2 gap-x-3.5 gap-y-2.5 py-3 border-t border-[var(--glass-border)]">
                <MetaItem k="Latitude" v={`${antenna.latitude.toFixed(4)}°`} />
                <MetaItem k="Longitude" v={`${antenna.longitude.toFixed(4)}°`} />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex gap-2 px-4 py-3 border-t border-[var(--glass-border)] bg-black/10 shrink-0 cursor-default">
            <Button
              onClick={() => {
                setAcknowledged(true)
                onAcknowledge?.(antenna)
              }}
              className={`
                flex-1 justify-center gap-1.5 text-[12px] font-medium
                rounded-[var(--radius-md)] transition-all duration-200
                ${acknowledged
                  ? 'bg-[var(--alarm-ok)] hover:bg-[var(--alarm-ok)] text-[var(--text-inverse)]'
                  : 'bg-[var(--accent)] hover:bg-[var(--accent-bright)] text-white shadow-[var(--shadow-glow)]'}
              `}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 6 L5 9 L10 3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {acknowledged ? 'Acknowledged' : 'Acknowledge'}
            </Button>
            <Button
              variant="outline"
              onClick={() => onOpenDetails?.(antenna)}
              className="
                text-[12px] rounded-[var(--radius-md)]
                bg-[var(--glass-bg)] hover:bg-[var(--glass-hover)]
                border-[var(--glass-border)] hover:border-[var(--border-strong)]
                text-[var(--text-primary)]
              "
            >
              Open details
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function SectionLabel({
  left, right,
}: { left: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-2.5 text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--text-secondary)]">
      <span>{left}</span>
      {right ? (
        <span className="font-mono text-[10px] tracking-[0.08em] text-[var(--text-muted)]">
          {right}
        </span>
      ) : null}
    </div>
  )
}

function MetaItem({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--text-muted)] mb-0.5">
        {k}
      </div>
      <div className="font-mono text-[12px] text-[var(--text-primary)]">{v}</div>
    </div>
  )
}
