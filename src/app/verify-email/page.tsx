'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase'

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
    <div className="flex min-h-screen items-center justify-center bg-bg-primary p-4">
      <div className="w-full max-w-md bg-bg-surface border border-border-subtle rounded-lg p-8 shadow-xl text-center">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-text-primary mb-2">Verify Your Email</h1>
          <p className="text-sm text-text-secondary uppercase tracking-widest font-medium">Action Required</p>
        </div>

        <p className="text-sm text-text-secondary mb-2">
          A verification link has been sent to your email address.
        </p>
        <p className="text-sm text-text-secondary mb-8">
          Please check your inbox and click the link to activate your account before signing in.
        </p>

        <div className="pt-6 border-t border-border-subtle">
          <Link
            href="/login"
            className="text-accent hover:text-accent-hover text-sm font-medium transition-colors"
          >
            Back to Sign In
          </Link>
        </div>
      </div>
    </div>
  )
}
