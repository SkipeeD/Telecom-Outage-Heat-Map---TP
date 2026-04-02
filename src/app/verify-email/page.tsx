'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { SignalHigh, MailCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AnimatedAuthBackground } from '@/components/animated-auth-background'
import { motion } from 'motion/react'
import Link from 'next/link'

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
    transition: { duration: 0.4, ease: [0.4, 0, 0.2, 1] }
  }
}

export default function VerifyEmailPage() {
  const router = useRouter()

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) return

      const interval = setInterval(async () => {
        await user.reload()
        if (auth.currentUser?.emailVerified) {
          clearInterval(interval)
          router.push('/map')
        }
      }, 3000)

      return () => clearInterval(interval)
    })

    return () => unsubscribe()
  }, [router])

  return (
    <div className="grid min-h-svh lg:grid-cols-2 bg-[var(--bg-base)] transition-colors duration-300">
      <div className="flex flex-col gap-4 p-6 md:p-10 border-r border-[var(--border)]">
        <div className="flex justify-center gap-2 md:justify-start">
          <a href="/" className="flex items-center gap-2 font-medium text-[var(--text-primary)]">
            <div className="flex size-8 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent)] text-white shadow-[var(--shadow-glow)]">
              <SignalHigh className="size-5" />
            </div>
            <span className="font-semibold tracking-[0.2em] uppercase text-[14px]">SIGNALIS</span>
          </a>
        </div>

        <div className="flex flex-1 items-center justify-center">
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="w-full max-w-xs flex flex-col gap-6 text-center"
          >
            <motion.div variants={itemVariants} className="flex justify-center">
              <div className="flex size-14 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--accent-dim)] border border-[var(--border-accent)]">
                <MailCheck className="size-7 text-[var(--accent-bright)]" />
              </div>
            </motion.div>

            <motion.div variants={itemVariants} className="flex flex-col gap-2">
              <h1 className="text-[20px] font-semibold text-[var(--text-primary)] uppercase tracking-widest">
                Check Your Email
              </h1>
              <p className="text-[13px] text-[var(--text-secondary)]">
                A verification link has been sent to your email address.
              </p>
              <p className="text-[13px] text-[var(--text-secondary)]">
                Click the link to activate your account. This page will redirect automatically once verified.
              </p>
            </motion.div>

            <motion.div variants={itemVariants}>
              <div className="flex items-center gap-2 justify-center text-[11px] text-[var(--text-muted)] uppercase tracking-widest font-mono">
                <span className="inline-block size-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
                Waiting for verification
              </div>
            </motion.div>

            <motion.div variants={itemVariants}>
              <Button
                variant="outline"
                className="w-full bg-[var(--glass-bg)] hover:bg-[var(--glass-hover)] border-[var(--glass-border)] hover:border-[var(--border-strong)] text-[var(--text-primary)] text-[13px] rounded-[var(--radius-md)] backdrop-blur-sm uppercase tracking-widest"
                asChild
              >
                <Link href="/login">Back to Sign In</Link>
              </Button>
            </motion.div>
          </motion.div>
        </div>
      </div>

      <div className="hidden lg:block border-l border-[var(--border)]">
        <AnimatedAuthBackground
          title="Almost There"
          subtitle="Verify your email to gain access to the outage monitoring dashboard."
        />
      </div>
    </div>
  )
}
