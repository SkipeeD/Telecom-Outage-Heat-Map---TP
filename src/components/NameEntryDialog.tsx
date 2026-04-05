'use client'

import { useState, useEffect, useMemo } from 'react'
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
  const [show, setShow] = useState(false)
  const pathname = usePathname()

  // 1. Determine if the user should see the dialog
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

  // 2. Control showing with a slight delay to allow redirects to settle
  useEffect(() => {
    let timeoutId: NodeJS.Timeout

    if (shouldShow) {
      // Slightly longer delay ensures the map and layout have settled
      timeoutId = setTimeout(() => setShow(true), 500)
    } else {
      setShow(false)
    }

    return () => clearTimeout(timeoutId)
  }, [shouldShow])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName || !user) return

    setIsSubmitting(true)
    try {
      const profileRef = doc(db, 'users', user.uid)
      await updateDoc(profileRef, {
        displayName: trimmedName
      })
      
      // Update local context immediately to close the modal
      if (profile) {
        setProfile({ ...profile, displayName: trimmedName })
      }
      setShow(false)
    } catch (error) {
      console.error('Error updating name:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  // If we shouldn't show, render nothing to avoid any flash
  if (!shouldShow && !show) return null

  return (
    <Dialog open={show} onOpenChange={(open) => {
      // Never allow the user to close it manually if it should be shown
      if (shouldShow) setShow(true)
      else setShow(open)
    }}>
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
