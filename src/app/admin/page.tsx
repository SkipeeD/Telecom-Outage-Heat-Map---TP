'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion } from 'motion/react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import { getAllUsers, updateUserRole } from '@/lib/firestore'
import { canManageUsers, roleLabel } from '@/lib/roles'
import type { UserProfile } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Users, ShieldCheck, RefreshCw } from 'lucide-react'

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
  admin:    { label: 'Admin',    bg: 'rgba(124,111,247,0.12)', border: 'rgba(124,111,247,0.3)', color: 'var(--accent-bright)' },
  engineer: { label: 'Engineer', bg: 'rgba(52,211,153,0.12)',  border: 'rgba(52,211,153,0.3)',  color: 'var(--alarm-ok)' },
  user:     { label: 'User',     bg: 'rgba(139,137,168,0.12)', border: 'rgba(139,137,168,0.25)', color: 'var(--text-secondary)' },
}

export default function AdminPage() {
  const { profile, loading: authLoading } = useAuth()
  const router = useRouter()

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

  const loadUsers = useCallback(async () => {
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
  }, [])

  useEffect(() => {
    if (!authLoading && canManageUsers(profile?.role)) {
      loadUsers()
    }
  }, [authLoading, profile, loadUsers])

  async function handleRoleToggle(user: UserProfile) {
    if (user.role === 'admin') return
    const nextRole: 'user' | 'engineer' = user.role === 'engineer' ? 'user' : 'engineer'
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

  if (authLoading || !canManageUsers(profile?.role)) return null

  const counts = {
    total:    users.length,
    admins:   users.filter(u => u.role === 'admin').length,
    engineers: users.filter(u => u.role === 'engineer').length,
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
        <motion.div variants={itemVariants} className="flex items-start justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-[28px] font-semibold text-[var(--text-primary)]">
              User Management
            </h1>
            <p className="text-[14px] text-[var(--text-secondary)]">
              Assign and revoke engineer access. Admin roles are set directly in Firebase.
            </p>
          </div>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={loadUsers}
            disabled={loading}
            className="
              flex items-center gap-2 px-3 py-1.5 rounded-[var(--radius-md)]
              text-[11px] font-medium uppercase tracking-widest
              border border-[var(--glass-border)] bg-[var(--glass-bg)]
              text-[var(--text-secondary)] hover:text-[var(--text-primary)]
              hover:bg-[var(--glass-hover)] hover:border-[var(--border-strong)]
              transition-colors duration-200 disabled:opacity-40
            "
          >
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </motion.button>
        </motion.div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total Users', value: counts.total, color: 'var(--text-primary)', icon: Users },
            { label: 'Admins',      value: counts.admins,   color: 'var(--accent-bright)', icon: ShieldCheck },
            { label: 'Engineers',   value: counts.engineers, color: 'var(--alarm-ok)',      icon: null },
            { label: 'Regular',     value: counts.regular,  color: 'var(--text-secondary)', icon: null },
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
              <CardTitle className="text-[13px] font-medium text-[var(--text-primary)] uppercase tracking-widest">
                All Users
              </CardTitle>
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
                  {/* Table header */}
                  <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-6 py-2.5 border-b border-[var(--glass-border)]">
                    <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--text-muted)]">Email</span>
                    <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--text-muted)] text-right">Role</span>
                    <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--text-muted)] text-right">Joined</span>
                    <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--text-muted)] text-right w-[110px]">Action</span>
                  </div>

                  {users.map((user, i) => {
                    const cfg = ROLE_CONFIG[user.role]
                    const isMe = user.uid === profile?.uid
                    const isUpdating = updating === user.uid
                    const joined = new Date(user.createdAt).toLocaleDateString(undefined, {
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
                        {/* Email */}
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="text-[13px] text-[var(--text-primary)] truncate">
                            {user.email}
                          </span>
                          {isMe && (
                            <span className="text-[10px] font-mono text-[var(--accent)] uppercase tracking-widest">
                              You
                            </span>
                          )}
                        </div>

                        {/* Role badge */}
                        <span
                          className="font-mono text-[9px] font-medium uppercase tracking-widest px-2.5 py-1 rounded-[var(--radius-full)] whitespace-nowrap"
                          style={{
                            color: cfg.color,
                            background: cfg.bg,
                            border: `1px solid ${cfg.border}`,
                          }}
                        >
                          {cfg.label}
                        </span>

                        {/* Joined */}
                        <span className="font-mono text-[11px] text-[var(--text-muted)] whitespace-nowrap text-right">
                          {joined}
                        </span>

                        {/* Action */}
                        <div className="w-[110px] flex justify-end">
                          {user.role === 'admin' ? (
                            <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest font-mono">
                              Via Firebase
                            </span>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isUpdating || isMe}
                              onClick={() => handleRoleToggle(user)}
                              className="
                                h-7 text-[10px] font-medium uppercase tracking-widest
                                bg-[var(--glass-bg)] border-[var(--glass-border)]
                                hover:bg-[var(--glass-hover)] hover:border-[var(--border-strong)]
                                text-[var(--text-secondary)] hover:text-[var(--text-primary)]
                                disabled:opacity-40 disabled:cursor-not-allowed
                                rounded-[var(--radius-md)]
                              "
                            >
                              {isUpdating
                                ? '…'
                                : user.role === 'engineer'
                                  ? 'Revoke'
                                  : 'Promote'}
                            </Button>
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

        {/* Footer note */}
        <motion.p variants={itemVariants} className="text-[11px] text-[var(--text-muted)] font-mono text-center pb-4">
          Admin roles must be assigned directly in the Firebase console by editing the{' '}
          <span className="text-[var(--text-secondary)]">users/{'{uid}'}</span> document.
        </motion.p>
      </motion.div>
    </div>
  )
}
