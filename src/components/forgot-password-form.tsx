"use client"

import { useState } from 'react'
import { auth } from '@/lib/firebase'
import { sendPasswordResetEmail } from 'firebase/auth'
import { cn, getAuthErrorMessage } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldError,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import Link from "next/link"
import { motion, AnimatePresence } from "motion/react"
import { CheckCircle2, ArrowLeft } from "lucide-react"

const EASE: [number, number, number, number] = [0.4, 0, 0.2, 1]

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.1 }
  }
}

const itemVariants = {
  hidden: { opacity: 0, y: 12, filter: 'blur(4px)' },
  visible: {
    opacity: 1, y: 0, filter: 'blur(0px)',
    transition: { duration: 0.4, ease: EASE }
  }
}

export function ForgotPasswordForm({ className }: React.ComponentProps<"div">) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!email) {
      setError('Please enter your email address.')
      return
    }

    setLoading(true)
    try {
      await sendPasswordResetEmail(auth, email)
      setSent(true)
    } catch (err) {
      const code = (err as { code?: string })?.code ?? ''
      // Treat user-not-found as success to prevent account enumeration
      if (code === 'auth/user-not-found') {
        setSent(true)
        return
      }
      setError(getAuthErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className={cn("flex flex-col gap-6", className)}
    >
      <AnimatePresence mode="wait">
        {sent ? (
          <motion.div
            key="sent"
            initial={{ opacity: 0, scale: 0.96, filter: 'blur(4px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            transition={{ duration: 0.4, ease: EASE }}
            className="flex flex-col items-center gap-5 text-center py-4"
          >
            <div className="flex size-14 items-center justify-center rounded-[var(--radius-xl)] bg-[rgba(52,211,153,0.12)] border border-[rgba(52,211,153,0.3)]">
              <CheckCircle2 className="size-7 text-[var(--alarm-ok)]" />
            </div>
            <div className="flex flex-col gap-1.5">
              <h2 className="text-[18px] font-semibold text-[var(--text-primary)] uppercase tracking-widest">
                Check your inbox
              </h2>
              <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed max-w-[280px]">
                If an account exists for <span className="font-mono text-[var(--text-primary)]">{email}</span>, a reset link is on its way.
              </p>
            </div>
            <Link
              href="/login"
              className="flex items-center gap-2 text-[12px] text-[var(--accent)] hover:text-[var(--accent-bright)] transition-colors underline-offset-4 hover:underline"
            >
              <ArrowLeft className="size-3.5" />
              Back to sign in
            </Link>
          </motion.div>
        ) : (
          <motion.form key="form" onSubmit={handleSubmit}>
            <FieldGroup>
              <motion.div variants={itemVariants} className="flex flex-col items-center gap-2 text-center mb-2">
                <h1 className="text-[20px] font-semibold text-[var(--text-primary)] uppercase tracking-widest">
                  Reset password
                </h1>
                <p className="text-[13px] text-[var(--text-secondary)]">
                  Enter your email and we&apos;ll send a reset link.
                </p>
              </motion.div>

              <motion.div variants={itemVariants}>
                <Field>
                  <FieldLabel
                    htmlFor="reset-email"
                    className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-secondary)]"
                  >
                    Email Address
                  </FieldLabel>
                  <Input
                    id="reset-email"
                    type="email"
                    placeholder="engineer@telecom.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-[var(--glass-bg)] border-[var(--glass-border)] focus:border-[var(--border-strong)] rounded-[var(--radius-md)]"
                  />
                </Field>
              </motion.div>

              {error && (
                <motion.div variants={itemVariants}>
                  <FieldError className="bg-red-500/10 border border-red-500/30 p-3 rounded-[var(--radius-md)] text-[12px] font-mono">
                    ERROR: {error}
                  </FieldError>
                </motion.div>
              )}

              <motion.div variants={itemVariants}>
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[var(--accent)] hover:bg-[var(--accent-bright)] text-white shadow-[var(--shadow-glow)] rounded-[var(--radius-md)] h-10 uppercase tracking-widest text-[13px] font-medium transition-all"
                >
                  {loading ? 'SENDING...' : 'SEND RESET LINK'}
                </Button>
              </motion.div>

              <motion.div variants={itemVariants} className="flex justify-center">
                <Link
                  href="/login"
                  className="flex items-center gap-2 text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <ArrowLeft className="size-3.5" />
                  Back to sign in
                </Link>
              </motion.div>
            </FieldGroup>
          </motion.form>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
