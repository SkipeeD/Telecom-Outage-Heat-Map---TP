import { useEffect, useState } from 'react'

/**
 * Theme hook that reads, applies, and syncs the dark/light preference.
 *
 * - On mount, initialises from `localStorage` (default: dark).
 * - On `toggle`, updates `document.documentElement` class and persists to `localStorage`.
 * - Watches the `class` attribute on `<html>` via a MutationObserver so that
 *   multiple mounted instances of this hook (e.g. Navbar + Dashboard) stay in sync
 *   without needing a context provider.
 *
 * @returns `{ theme, toggle, isDark }`.
 */
export function useTheme() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window === 'undefined') return 'dark'
    return (localStorage.getItem('theme') as 'dark' | 'light') ?? 'dark'
  })

  // Apply class + persist when this instance owns a toggle
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
    localStorage.setItem('theme', theme)
  }, [theme])

  // Stay in sync when another useTheme instance toggles the DOM class
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const current = document.documentElement.classList.contains('dark') ? 'dark' : 'light'
      setTheme(prev => prev === current ? prev : current)
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  const toggle = () => setTheme(t => t === 'dark' ? 'light' : 'dark')

  return { theme, toggle, isDark: theme === 'dark' }
}
