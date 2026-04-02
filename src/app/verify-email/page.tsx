'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { SignalHigh, MailCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

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
    <div className="flex min-h-svh items-center justify-center bg-[var(--bg-base)] p-6 transition-colors duration-300">
      <div className="w-full max-w-sm flex flex-col items-center gap-8">

        <a href="/" className="flex items-center gap-2 text-[var(--text-primary)]">
          <div className="flex size-8 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent)] text-white shadow-[var(--shadow-glow)]">
            <SignalHigh className="size-5" />
          </div>
          <span className="font-semibold tracking-[0.2em] uppercase text-[14px]">SIGNALIS</span>
        </a>

        <div className="w-full bg-[var(--glass-bg)] backdrop-blur-xl border border-[var(--glass-border)] rounded-[var(--radius-lg)] shadow-[var(--shadow-md)] p-8 flex flex-col items-center gap-6 text-center">

          <div className="flex size-14 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--accent-dim)] border border-[var(--border-accent)]">
            <MailCheck className="size-7 text-[var(--accent-bright)]" />
          </div>

          <div className="flex flex-col gap-2">
            <h1 className="text-[20px] font-semibold text-[var(--text-primary)] uppercase tracking-widest">
              Verify Your Email
            </h1>
            <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
              A verification link has been sent to your inbox. Click it to activate your account — this page will redirect automatically once verified.
            </p>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)] uppercase tracking-widest font-mono">
            <span className="inline-block size-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
            Waiting for verification
          </div>

          <div className="w-full pt-2 border-t border-[var(--border)]">
            <Button
              variant="outline"
              className="w-full bg-[var(--glass-bg)] hover:bg-[var(--glass-hover)] border-[var(--glass-border)] hover:border-[var(--border-strong)] text-[var(--text-primary)] text-[13px] rounded-[var(--radius-md)] uppercase tracking-widest"
              asChild
            >
              <Link href="/login">Back to Sign In</Link>
            </Button>
          </div>
        </div>

      </div>
    </div>
  )
}
