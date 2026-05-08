'use client'

import { useState, useMemo } from 'react'
import { useAuth } from './AuthProvider'
import { db } from '@/lib/firebase'
import { doc, updateDoc } from 'firebase/firestore'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { usePathname } from 'next/navigation'
import { motion } from 'motion/react'

export function NameEntryDialog() {
  const { user, profile, setProfile } = useAuth()
  const [name, setName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const pathname = usePathname()

  const isVerified = useMemo(() => {
    return user?.emailVerified || (user && user.providerData.some(p => p.providerId === 'google.com'))
  }, [user])

  const shouldShow = !!(
    user &&
    isVerified &&
    profile &&
    !profile.displayName &&
    !['/login', '/register', '/verify-email'].includes(pathname)
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName || !user) return

    setIsSubmitting(true)
    setError('')
    try {
      const profileRef = doc(db, 'users', user.uid)
      await updateDoc(profileRef, {
        displayName: trimmedName
      })

      if (profile) {
        setProfile({ ...profile, displayName: trimmedName })
      }
    } catch (err) {
      console.error('Error updating name:', err)
      setError('Could not save your name. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!shouldShow) return null

  return (
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent 
        className="sm:max-w-[425px] bg-[var(--bg-overlay)] border-[var(--glass-border)] backdrop-blur-2xl"
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold text-[var(--text-primary)]">
            Welcome to SIGNALIS
          </DialogTitle>
          <DialogDescription className="text-[var(--text-secondary)]">
            To personalize your NOC dashboard, please enter your name.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-4">
          <Input
            placeholder="e.g. Alex Chen"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-[var(--bg-subtle)] border-[var(--glass-border)] text-[var(--text-primary)] focus:ring-[var(--accent)]"
            autoFocus
            required
          />
          {error && (
            <p className="text-[12px] text-[var(--alarm-critical)]">{error}</p>
          )}
          <motion.div whileTap={{ scale: 0.98 }}>
            <Button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="w-full bg-[var(--accent)] hover:bg-[var(--accent-bright)] text-white font-medium"
            >
              {isSubmitting ? "Finalizing..." : "Enter Dashboard"}
            </Button>
          </motion.div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
