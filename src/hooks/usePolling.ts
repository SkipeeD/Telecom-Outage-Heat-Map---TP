'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { apiFetch } from '@/lib/api-client'

/**
 * Generic data-fetching hook that polls a JSON API endpoint on a fixed interval.
 *
 * @param url        - Absolute or relative URL to fetch (GET).
 * @param intervalMs - How often to re-fetch, in milliseconds.
 * @param enabled    - Set to `false` to skip fetching (e.g. while auth is pending).
 * @returns `data` (typed `T`), `loading` flag, and an imperative `refresh` callback.
 *
 * Errors are swallowed silently and retried on the next interval tick.
 * The initial fetch is deferred via `queueMicrotask` to avoid a synchronous
 * state update in the effect body.
 */
export function usePolling<T>(
  url: string,
  intervalMs: number,
  enabled = true,
): { data: T | null; loading: boolean; refresh: () => void } {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const result = await apiFetch<T>(url)
      setData(result)
    } catch {
      // silently retry on next interval
    } finally {
      setLoading(false)
    }
  }, [url])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) void fetchData()
    })
    timerRef.current = setInterval(() => void fetchData(), intervalMs)
    return () => {
      cancelled = true
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [fetchData, intervalMs, enabled])

  return { data, loading, refresh: fetchData }
}
