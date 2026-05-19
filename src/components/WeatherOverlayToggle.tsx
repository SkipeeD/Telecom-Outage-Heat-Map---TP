'use client'

import { motion, AnimatePresence } from 'motion/react'
import { CloudRain, CloudOff } from 'lucide-react'
import { Switch } from '@/components/ui/interfaces-switch'
import { cn } from '@/lib/utils'

interface WeatherOverlayToggleProps {
  enabled: boolean
  onToggle: () => void
}

export function WeatherOverlayToggle({ enabled, onToggle }: WeatherOverlayToggleProps) {
  return (
    <div
      className="
        fixed bottom-6 left-6
        flex items-center gap-2.5
        px-3 py-2
        rounded-[var(--radius-full)] border
        border-[var(--glass-border)]
        backdrop-blur-2xl backdrop-saturate-150
        shadow-[var(--shadow-md)]
      "
      style={{ background: 'color-mix(in srgb, var(--bg-overlay) 70%, transparent)', zIndex: 9990 }}
    >
      <div className="relative flex items-center justify-center w-4 h-4">
        <AnimatePresence mode="wait">
          {enabled ? (
            <motion.div
              key="on"
              initial={{ scale: 0.5, opacity: 0, rotate: -45 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 0.5, opacity: 0, rotate: 45 }}
              transition={{ duration: 0.2 }}
            >
              <CloudRain className="size-4 text-[var(--accent)]" />
            </motion.div>
          ) : (
            <motion.div
              key="off"
              initial={{ scale: 0.5, opacity: 0, rotate: 45 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 0.5, opacity: 0, rotate: -45 }}
              transition={{ duration: 0.2 }}
            >
              <CloudOff className="size-4 text-[var(--text-muted)]" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <Switch
        checked={enabled}
        onCheckedChange={onToggle}
        aria-label="Toggle weather overlay"
        className={cn(
          'shadow-none border-none focus-visible:ring-0',
          'dark:data-[state=unchecked]:bg-slate-800/60'
        )}
      />
    </div>
  )
}
