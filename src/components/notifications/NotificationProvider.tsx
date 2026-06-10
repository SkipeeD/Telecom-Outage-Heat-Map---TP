'use client'

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/components/AuthProvider'
import { useLiveSnapshot } from '@/hooks/useLiveSnapshot'
import type { Incident } from '@/types'

export interface AppNotification {
  id: string
  incidentNumber: string
  title: string
  message: string
  priority: Incident['priority']
  timestamp: string
  read: boolean
  type: 'new_incident' | 'assigned_to_me' | 'escalation'
}

interface NotificationContextType {
  notifications: AppNotification[]
  unreadCount: number
  markAllRead: () => void
  dismiss: (id: string) => void
  soundEnabled: boolean
  toggleSound: () => void
  toasts: AppNotification[]
  dismissToast: (id: string) => void
}

const NotificationContext = createContext<NotificationContextType>({
  notifications: [],
  unreadCount: 0,
  markAllRead: () => {},
  dismiss: () => {},
  soundEnabled: false,
  toggleSound: () => {},
  toasts: [],
  dismissToast: () => {},
})

export const useNotifications = () => useContext(NotificationContext)

// Tracks incidents the user has already seen to prevent toast storms on reload.
function getSeenKey(uid: string) { return `signalis-seen-${uid}` }
function loadSeen(uid: string): Set<string> {
  try {
    const raw = localStorage.getItem(getSeenKey(uid))
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
  } catch { return new Set() }
}
function persistSeen(uid: string, seen: Set<string>) {
  try { localStorage.setItem(getSeenKey(uid), JSON.stringify([...seen])) } catch {}
}

// Tracks P1 incidents that have already fired an escalation alert.
// Persisted so page refreshes don't re-fire alerts for the same incidents.
function getEscalatedKey(uid: string) { return `signalis-escalated-${uid}` }
function loadEscalated(uid: string): Set<string> {
  try {
    const raw = localStorage.getItem(getEscalatedKey(uid))
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
  } catch { return new Set() }
}
function persistEscalated(uid: string, escalated: Set<string>) {
  try { localStorage.setItem(getEscalatedKey(uid), JSON.stringify([...escalated])) } catch {}
}

// Soft ping using WebAudio — no external file needed, no autoplay issues
// (this is called only after a user gesture, gated by soundEnabled).
function playSoftPing() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3)
    gain.gain.setValueAtTime(0.18, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.4)
  } catch {}
}

const UNACKED_P1_THRESHOLD_MS = 10 * 60 * 1000 // 10 min

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user, profile } = useAuth()
  const role = profile?.role
  const uid = profile?.uid ?? ''

  const enabled = !!user && (role === 'admin' || role === 'engineer' || role === 'technician')
  const { openIncidents } = useLiveSnapshot(enabled)

  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [toasts, setToasts] = useState<AppNotification[]>([])
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try { return localStorage.getItem('signalis-sound') === 'true' } catch { return false }
  })

  // Ref keeps the previous snapshot's incidentNumber → {status, assigneeUids} map
  const prevMapRef = useRef<Map<string, { status: string; assigneeUids: Set<string>; technicianUids: Set<string> }>>(new Map())
  // Tracks which P1 incidents have already fired the escalation alert
  const escalatedRef = useRef<Set<string>>(new Set())
  // True once the first snapshot has been processed (baseline established)
  const baselineSetRef = useRef(false)
  const seenRef = useRef<Set<string>>(new Set())

  // Load persisted seen + escalated sets once uid is known
  useEffect(() => {
    if (!uid) return
    seenRef.current = loadSeen(uid)
    escalatedRef.current = loadEscalated(uid)
  }, [uid])

  const fire = useCallback((notif: Omit<AppNotification, 'id' | 'read'>, withSound: boolean) => {
    const full: AppNotification = { ...notif, id: `${Date.now()}-${Math.random()}`, read: false }
    setNotifications(prev => [full, ...prev].slice(0, 100))
    setToasts(prev => [...prev, full])
    if (withSound && soundEnabled) playSoftPing()
  }, [soundEnabled])

  // Process snapshot changes
  useEffect(() => {
    if (!enabled || !openIncidents) return

    const currentMap = new Map<string, { status: string; assigneeUids: Set<string>; technicianUids: Set<string> }>()
    for (const inc of openIncidents) {
      currentMap.set(inc.incidentNumber, {
        status: inc.status,
        assigneeUids: new Set((inc.assignees ?? []).map(a => a.uid)),
        technicianUids: new Set((inc.technicians ?? []).map(t => t.uid)),
      })
    }

    if (!baselineSetRef.current) {
      // First snapshot — record as baseline; mark all as seen
      for (const inc of openIncidents) seenRef.current.add(inc.incidentNumber)
      if (uid) persistSeen(uid, seenRef.current)
      prevMapRef.current = currentMap
      baselineSetRef.current = true
      return
    }

    const prev = prevMapRef.current

    // Collect during the pass and flush after, so no setState runs
    // synchronously inside the effect body (avoids cascading renders).
    const pending: { notif: Omit<AppNotification, 'id' | 'read'>; withSound: boolean }[] = []

    for (const inc of openIncidents) {
      const num = inc.incidentNumber
      const prevEntry = prev.get(num)

      // Admins: new incident
      if (role === 'admin' && !prevEntry && !seenRef.current.has(num)) {
        seenRef.current.add(num)
        if (uid) persistSeen(uid, seenRef.current)
        pending.push({
          notif: {
            incidentNumber: num,
            type: 'new_incident',
            title: 'New Incident',
            message: `${num} · ${(inc.siteIds ?? [inc.siteId]).join(', ')} · ${inc.priority}`,
            priority: inc.priority,
            timestamp: new Date().toISOString(),
          },
          withSound: inc.priority === '1-Critical' || inc.priority === '2-High',
        })
      }

      // Engineers: assigned to me
      if (role === 'engineer' && uid) {
        const prevUids = prevEntry?.assigneeUids ?? new Set()
        const nowUids = new Set((inc.assignees ?? []).map(a => a.uid))
        if (!prevUids.has(uid) && nowUids.has(uid)) {
          pending.push({
            notif: {
              incidentNumber: num,
              type: 'assigned_to_me',
              title: 'Incident Assigned',
              message: `You've been assigned to ${num} · ${inc.priority}`,
              priority: inc.priority,
              timestamp: new Date().toISOString(),
            },
            withSound: true,
          })
        }
      }

      // Technicians: dispatched to me
      if (role === 'technician' && uid) {
        const prevUids = prevEntry?.technicianUids ?? new Set()
        const nowUids = new Set((inc.technicians ?? []).map(t => t.uid))
        if (!prevUids.has(uid) && nowUids.has(uid)) {
          pending.push({
            notif: {
              incidentNumber: num,
              type: 'assigned_to_me',
              title: 'Job Dispatched',
              message: `You've been dispatched to ${num} · ${inc.priority}`,
              priority: inc.priority,
              timestamp: new Date().toISOString(),
            },
            withSound: true,
          })
        }
      }
    }

    prevMapRef.current = currentMap

    if (pending.length > 0) {
      queueMicrotask(() => {
        for (const { notif, withSound } of pending) fire(notif, withSound)
      })
    }
  }, [openIncidents, enabled, role, uid, fire])

  // Admins: P1 escalation — poll for unacknowledged critical incidents
  useEffect(() => {
    if (role !== 'admin') return
    const id = setInterval(() => {
      for (const inc of openIncidents) {
        if (inc.status !== 'ASSIGNED' || inc.priority !== '1-Critical') continue
        if (escalatedRef.current.has(inc.incidentNumber)) continue
        const age = Date.now() - new Date(inc.submitDate).getTime()
        if (age >= UNACKED_P1_THRESHOLD_MS) {
          escalatedRef.current.add(inc.incidentNumber)
          if (uid) persistEscalated(uid, escalatedRef.current)
          fire({
            incidentNumber: inc.incidentNumber,
            type: 'escalation',
            title: 'P1 Unacknowledged',
            message: `${inc.incidentNumber} has been unacknowledged for ${Math.floor(age / 60000)} min`,
            priority: '1-Critical',
            timestamp: new Date().toISOString(),
          }, true)
        }
      }
    }, 30_000)
    return () => clearInterval(id)
  }, [role, openIncidents, uid, fire])

  const markAllRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }, [])

  const dismiss = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(n => n.id !== id))
  }, [])

  const toggleSound = useCallback(() => {
    setSoundEnabled(prev => {
      const next = !prev
      try { localStorage.setItem('signalis-sound', String(next)) } catch {}
      return next
    })
  }, [])

  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, markAllRead, dismiss, soundEnabled, toggleSound, toasts, dismissToast }}>
      {children}
    </NotificationContext.Provider>
  )
}
