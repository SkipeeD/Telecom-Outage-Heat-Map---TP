'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion } from 'motion/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import { getAllUsers, updateUserRole } from '@/lib/firestore'
import { canManageUsers } from '@/lib/roles'
import { cn } from '@/lib/utils'
import type { UserProfile } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, ShieldCheck, RefreshCw } from 'lucide-react'
import { IncidentsPanel } from '@/components/admin/IncidentsPanel'

type AdminTab = 'users' | 'incidents'

const EASE: [number, number, number, number] = [0.4, 0, 0.2, 1]

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 12, filter: 'blur(6px)' },
  visible: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.4, ease: EASE } },
}

const ROLE_CONFIG: Record<UserProfile['role'], { label: string; bg: string; border: string; color: string }> = {
  admin:      { label: 'Admin',      bg: 'rgba(124,111,247,0.12)', border: 'rgba(124,111,247,0.3)', color: 'var(--accent-bright)' },
  engineer:   { label: 'Engineer',   bg: 'rgba(52,211,153,0.12)',  border: 'rgba(52,211,153,0.3)',  color: 'var(--alarm-ok)' },
  technician: { label: 'Technician', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.3)',  color: 'var(--alarm-warning)' },
  user:       { label: 'User',       bg: 'rgba(139,137,168,0.12)', border: 'rgba(139,137,168,0.25)', color: 'var(--text-secondary)' },
}

// Roles an admin can grant from the Users table (admin is granted via Firebase).
const ASSIGNABLE_ROLES: { value: 'user' | 'engineer' | 'technician'; short: string }[] = [
  { value: 'user',       short: 'User' },
  { value: 'engineer',   short: 'Eng' },
  { value: 'technician', short: 'Tech' },
]

export default function AdminPage() {
  const { profile, loading: authLoading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()

  const tabFromUrl = searchParams.get('tab')
  const incidentFromUrl = searchParams.get('incident')
  const [activeTab, setActiveTab] = useState<AdminTab>(() => tabFromUrl === 'incidents' ? 'incidents' : 'users')
  const [highlightIncident, setHighlightIncident] = useState<string | undefined>(() => incidentFromUrl ?? undefined)
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (authLoading) return
    if (!canManageUsers(profile?.role)) {
      router.replace('/dashboard')
    }
  }, [authLoading, profile, router])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return

      if (incidentFromUrl) {
        setActiveTab('incidents')
        setHighlightIncident(incidentFromUrl)
        router.replace('/admin?tab=incidents', { scroll: false })
        return
      }

      if (tabFromUrl === 'incidents') {
        setActiveTab('incidents')
      } else if (!tabFromUrl) {
        setActiveTab('users')
        setHighlightIncident(undefined)
      }
    })
    return () => {
      cancelled = true
    }
  }, [incidentFromUrl, router, tabFromUrl])

  const [usersRefreshKey, setUsersRefreshKey] = useState(0)

  const loadUsers = useCallback(() => setUsersRefreshKey(k => k + 1), [])

  useEffect(() => {
    if (!authLoading && canManageUsers(profile?.role)) {
      void (async () => {
        setLoading(true)
        setError(null)
        try {
          const data = await getAllUsers()
          setUsers(data.sort((a, b) => a.email.localeCompare(b.email)))
        } catch {
          setError('Failed to load users. Check Firestore rules.')
        } finally {
          setLoading(false)
        }
      })()
    }
  }, [authLoading, profile, usersRefreshKey])

  async function handleSetRole(user: UserProfile, nextRole: 'user' | 'engineer' | 'technician') {
    if (user.role === 'admin' || user.role === nextRole) return
    setUpdating(user.uid)
    try {
      await updateUserRole(user.uid, nextRole)
      setUsers(prev => prev.map(u => u.uid === user.uid ? { ...u, role: nextRole } : u))
    } catch {
      setError(`Failed to update role for ${user.email}.`)
    } finally {
      setUpdating(null)
    }
  }

  function handleTabClick(tab: AdminTab) {
    setActiveTab(tab)
    setHighlightIncident(undefined)
    router.replace(tab === 'incidents' ? '/admin?tab=incidents' : '/admin', { scroll: false })
  }

  if (authLoading || !canManageUsers(profile?.role)) return null

  const counts = {
    total:    users.length,
    admins:   users.filter(u => u.role === 'admin').length,
    engineers: users.filter(u => u.role === 'engineer').length,
    technicians: users.filter(u => u.role === 'technician').length,
    regular:  users.filter(u => u.role === 'user').length,
  }

  return (
    <div className="min-h-full bg-[var(--bg-base)] p-6 md:p-8">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="max-w-5xl mx-auto space-y-8"
      >
        {/* Header */}
        <motion.div variants={itemVariants} className="flex flex-col gap-1">
          <h1 className="text-[28px] font-semibold text-[var(--text-primary)]">
            Admin Panel
          </h1>
          <p className="text-[14px] text-[var(--text-secondary)]">
            Manage users, roles, and incident assignments.
          </p>
        </motion.div>

        {/* Tab switcher */}
        <motion.div variants={itemVariants} className="flex gap-0 border-b border-[var(--glass-border)]">
          {([
            { id: 'users',     label: 'Users' },
            { id: 'incidents', label: 'Incidents' },
          ] as { id: AdminTab; label: string }[]).map(tab => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => handleTabClick(tab.id)}
                className="px-5 py-2.5 text-[13px] font-medium border-b-2 transition-colors duration-150 cursor-pointer"
                style={{
                  color:            isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  borderBottomColor: isActive ? 'var(--accent)' : 'transparent',
                }}
              >
                {tab.label}
              </button>
            )
          })}
        </motion.div>

        {/* ── Users tab ───────────────────────────────────────── */}
        {activeTab === 'users' && (
          <>
            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              {[
                { label: 'Total Users', value: counts.total,        color: 'var(--text-primary)',   icon: Users },
                { label: 'Admins',      value: counts.admins,       color: 'var(--accent-bright)',  icon: ShieldCheck },
                { label: 'Engineers',   value: counts.engineers,    color: 'var(--alarm-ok)',       icon: null },
                { label: 'Technicians', value: counts.technicians,  color: 'var(--alarm-warning)',  icon: null },
                { label: 'Regular',     value: counts.regular,      color: 'var(--text-secondary)', icon: null },
              ].map(stat => (
                <motion.div key={stat.label} variants={itemVariants}>
                  <Card className="bg-[var(--glass-bg)] backdrop-blur-xl border-[var(--glass-border)] shadow-[var(--shadow-md)]">
                    <CardHeader className="pb-1">
                      <CardTitle className="text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-widest">
                        {stat.label}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold font-mono" style={{ color: stat.color }}>
                        {stat.value}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>

            {/* User table */}
            <motion.div variants={itemVariants}>
              <Card className="bg-[var(--glass-bg)] backdrop-blur-xl border-[var(--glass-border)] shadow-[var(--shadow-md)] overflow-hidden">
                <CardHeader className="border-b border-[var(--glass-border)]">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-[13px] font-medium text-[var(--text-primary)] uppercase tracking-widest">
                      All Users
                    </CardTitle>
                    <motion.button
                      whileTap={{ scale: 0.96 }}
                      onClick={loadUsers}
                      disabled={loading}
                      className="
                        flex items-center gap-2 px-3 py-1.5 rounded-[var(--radius-md)]
                        text-[10px] font-medium uppercase tracking-widest
                        border border-[var(--glass-border)] bg-[var(--glass-bg)]
                        text-[var(--text-secondary)] hover:text-[var(--text-primary)]
                        hover:bg-[var(--glass-hover)] hover:border-[var(--border-strong)]
                        transition-colors duration-200 disabled:opacity-40 cursor-pointer
                      "
                    >
                      <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
                      Refresh
                    </motion.button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {error && (
                    <div className="px-6 py-3 text-[13px] text-[var(--alarm-critical)] bg-[rgba(240,79,79,0.06)] border-b border-[var(--glass-border)]">
                      {error}
                    </div>
                  )}

                  {loading ? (
                    <div className="flex items-center gap-2.5 px-6 py-10 text-[13px] text-[var(--text-muted)] animate-pulse">
                      <span className="w-2 h-2 rounded-full bg-[var(--text-muted)] animate-pulse" />
                      Loading users…
                    </div>
                  ) : users.length === 0 ? (
                    <div className="px-6 py-10 text-center text-[13px] text-[var(--text-muted)]">
                      No users found.
                    </div>
                  ) : (
                    <div>
                      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-6 py-2.5 border-b border-[var(--glass-border)]">
                        <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--text-muted)]">Email</span>
                        <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--text-muted)] text-right">Role</span>
                        <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--text-muted)] text-right">Joined</span>
                        <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--text-muted)] text-right w-[190px]">Action</span>
                      </div>

                      {users.map((user, i) => {
                        const cfg        = ROLE_CONFIG[user.role]
                        const isMe       = user.uid === profile?.uid
                        const isUpdating = updating === user.uid
                        const joined     = new Date(user.createdAt).toLocaleDateString(undefined, {
                          month: 'short', day: 'numeric', year: 'numeric',
                        })

                        return (
                          <motion.div
                            key={user.uid}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: i * 0.03 }}
                            className="grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center px-6 py-3.5 border-b border-[var(--glass-border)] last:border-0 hover:bg-[var(--glass-hover)] transition-colors duration-150"
                          >
                            <div className="flex flex-col gap-0.5 min-w-0">
                              <span className="text-[13px] text-[var(--text-primary)] truncate">{user.email}</span>
                              {isMe && (
                                <span className="text-[10px] font-mono text-[var(--accent)] uppercase tracking-widest">You</span>
                              )}
                            </div>

                            <span
                              className="font-mono text-[9px] font-medium uppercase tracking-widest px-2.5 py-1 rounded-[var(--radius-full)] whitespace-nowrap"
                              style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}
                            >
                              {cfg.label}
                            </span>

                            <span className="font-mono text-[11px] text-[var(--text-muted)] whitespace-nowrap text-right">
                              {joined}
                            </span>

                            <div className="w-[190px] flex justify-end">
                              {user.role === 'admin' ? (
                                <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest font-mono">
                                  Via Firebase
                                </span>
                              ) : (
                                <div className="inline-flex items-center rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg)] p-0.5">
                                  {ASSIGNABLE_ROLES.map(({ value, short }) => {
                                    const active = user.role === value
                                    return (
                                      <button
                                        key={value}
                                        disabled={isUpdating || isMe || active}
                                        onClick={() => handleSetRole(user, value)}
                                        className={cn(
                                          'h-6 px-2.5 text-[10px] font-medium uppercase tracking-widest rounded-[var(--radius-sm)] transition-colors duration-150 disabled:cursor-not-allowed',
                                          active
                                            ? 'bg-[var(--accent)] text-white'
                                            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-hover)] disabled:opacity-40'
                                        )}
                                      >
                                        {isUpdating && active ? '…' : short}
                                      </button>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            <motion.p variants={itemVariants} className="text-[11px] text-[var(--text-muted)] font-mono text-center pb-4">
              Admin roles must be assigned directly in the Firebase console by editing the{' '}
              <span className="text-[var(--text-secondary)]">users/{'{uid}'}</span> document.
            </motion.p>
          </>
        )}

        {/* ── Incidents tab ───────────────────────────────────── */}
        {activeTab === 'incidents' && <IncidentsPanel highlightIncident={highlightIncident} />}

      </motion.div>
    </div>
  )
}
