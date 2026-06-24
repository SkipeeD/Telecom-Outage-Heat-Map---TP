'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { SignalHigh, MailCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Email-verification holding page. Shown right after registration while the
 * user's inbox is still unverified.
 *
 * Polls Firebase Auth every 3 seconds by calling `user.reload()` and checking
 * `emailVerified`. On success it sets an `auth-session` cookie (consumed by
 * the middleware) and does a hard navigation to `/map` so AuthProvider
 * re-initialises from scratch with the verified user object — a client-side
 * router push would carry the stale unverified state.
 */
export default function VerifyEmailPage() {
  const router = useRouter()

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) return

      const interval = setInterval(async () => {
        // Force-reload the Firebase user to pick up the latest emailVerified flag
        await user.reload()
        if (auth.currentUser?.emailVerified) {
          clearInterval(interval)
          document.cookie = `auth-session=true; path=/; max-age=${60 * 60 * 24 * 7}; samesite=lax`
          // Full-document navigation so AuthProvider re-initialises with the now
          // verified user. A client-side push would keep the stale (unverified)
          // user object, which suppresses the name-entry dialog until a refresh.
          window.location.assign('/map')
        }
      }, 3000)

      return () => clearInterval(interval)
    })

    return () => unsubscribe()
  }, [])

  return (
    <div className="flex min-h-svh items-center justify-center bg-[var(--bg-base)] p-6 transition-colors duration-300">
      <div className="w-full max-w-sm flex flex-col items-center gap-8">

        <Link href="/" className="flex items-center gap-2 text-[var(--text-primary)]">
          <div className="flex size-8 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent)] text-white shadow-[var(--shadow-glow)]">
            <SignalHigh className="size-5" />
          </div>
          <span className="font-semibold tracking-[0.2em] uppercase text-[14px]">SIGNALIS</span>
        </Link>

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
              onClick={() => router.push('/login')}
            >
              Back to Sign In
            </Button>
          </div>
        </div>

      </div>
    </div>
  )
}
