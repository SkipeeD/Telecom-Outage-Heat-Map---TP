'use client'

import { cn } from '@/lib/utils'
import type { Cell, Technology } from '@/types'
import { sevColorVar, techColorVar } from '@/lib/antenna-helpers'
import { motion } from 'motion/react'

interface Props {
  tech: Technology
  cell?: Cell
  selected: boolean
  onSelect: () => void
}

export function CellTile({ tech, cell, selected, onSelect }: Props) {
  const techColor = `var(${techColorVar[tech]})`

  if (!cell) {
    return (
      <div
        aria-disabled="true"
        className={cn(
          'relative rounded-[var(--radius-md)] border px-[6px] py-[10px] pb-2 text-center',
          'bg-[var(--glass-bg)] border-[var(--glass-border)]',
          'opacity-35 saturate-50 cursor-not-allowed'
        )}
      >
        <div className="font-mono text-[11px] font-medium tracking-[0.04em]" style={{ color: techColor }}>
          {tech}
        </div>
        <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--text-muted)] mt-1">—</div>
      </div>
    )
  }

  const ledColor = `var(${sevColorVar[cell.status]})`

  return (
    <motion.div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect() }}
      whileTap={{ scale: 0.96 }}
      aria-pressed={selected}
      aria-label={`${tech} cell — ${cell.status}`}
      className={cn(
        'relative rounded-[var(--radius-md)] border px-[6px] py-[10px] pb-2 text-center cursor-pointer select-none',
        'transition-all duration-200',
        selected
          ? 'bg-[rgba(255,255,255,0.08)] border-[rgba(255,255,255,0.18)] scale-[1.06]'
          : 'bg-[var(--glass-bg)] border-[var(--glass-border)] hover:bg-[var(--glass-hover)] hover:border-[var(--border-strong)]'
      )}
    >
      <span
        aria-hidden
        className="absolute top-1.5 right-1.5 w-[5px] h-[5px] rounded-full"
        style={{ background: ledColor, boxShadow: `0 0 6px ${ledColor}` }}
      />
      <div className="font-mono text-[11px] font-medium tracking-[0.04em]" style={{ color: techColor }}>
        {tech}
      </div>
      <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--text-muted)] mt-1">
        {cell.status}
      </div>
    </motion.div>
  )
}
