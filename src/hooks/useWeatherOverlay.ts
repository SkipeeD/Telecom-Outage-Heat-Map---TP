import { useEffect, useState } from 'react'

const STORAGE_KEY = 'weatherOverlay'

/**
 * Persists and exposes the weather-overlay toggle state.
 *
 * The preference is stored in `localStorage` under `'weatherOverlay'` as
 * the literal string `'on'` or `'off'` so it survives page refreshes.
 *
 * Used by the map toolbar to show/hide weather impact tinting on antenna pins.
 *
 * @returns `{ enabled, toggle, setEnabled }`.
 */
export function useWeatherOverlay() {
  // Initialise from localStorage on mount; default off (SSR-safe guard)
  const [enabled, setEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    const v = window.localStorage.getItem(STORAGE_KEY)
    return v === 'on'
  })

  // Persist the preference whenever it changes
  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off')
  }, [enabled])

  return { enabled, toggle: () => setEnabled(v => !v), setEnabled }
}
