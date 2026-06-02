'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { apiFetch } from '@/lib/api-client'

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
