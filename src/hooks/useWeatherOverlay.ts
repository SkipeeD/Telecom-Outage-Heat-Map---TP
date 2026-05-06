import { useEffect, useState } from 'react'

const STORAGE_KEY = 'weatherOverlay'

export function useWeatherOverlay() {
  const [enabled, setEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    const v = window.localStorage.getItem(STORAGE_KEY)
    return v === 'on'
  })

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off')
  }, [enabled])

  return { enabled, toggle: () => setEnabled(v => !v), setEnabled }
}
