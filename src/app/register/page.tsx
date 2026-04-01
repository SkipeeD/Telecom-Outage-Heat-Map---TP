'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import { createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth'
import { doc, setDoc } from 'firebase/firestore'

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!email || !password || !confirmPassword) {
      setError('Please fill in all fields.')
      return
    }

    if (!/\S+@\S+\.\S+/.test(email)) {
      setError('Please enter a valid email address.')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password)
      const user = userCredential.user

      // Initialize user data in Firestore
      await setDoc(doc(db, 'users', user.uid), {
        email: user.email,
        createdAt: new Date().toISOString(),
        role: 'engineer',
      })

      await sendEmailVerification(userCredential.user)
      router.push('/verify-email')
    } catch (err: any) {
      setError(err.message || 'Failed to register account.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-primary p-4">
      <div className="w-full max-w-md bg-bg-surface border border-border-subtle rounded-lg p-8 shadow-xl">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-text-primary mb-2">Telecom Outage Heat Map</h1>
          <p className="text-sm text-text-secondary uppercase tracking-widest font-medium">New Engineer Registration</p>
        </div>

        <form onSubmit={handleRegister} className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-medium text-text-secondary uppercase tracking-wider block">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-bg-elevated border border-border-subtle rounded-md px-4 py-2.5 text-text-primary text-sm focus:border-accent focus:outline-none transition-colors"
              placeholder="engineer@telecom.ro"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-text-secondary uppercase tracking-wider block">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-bg-elevated border border-border-subtle rounded-md px-4 py-2.5 text-text-primary text-sm focus:border-accent focus:outline-none transition-colors"
              placeholder="••••••••"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-text-secondary uppercase tracking-wider block">
              Confirm Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-bg-elevated border border-border-subtle rounded-md px-4 py-2.5 text-text-primary text-sm focus:border-accent focus:outline-none transition-colors"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="text-xs text-alarm-critical font-mono bg-red-950/30 border border-alarm-critical/30 rounded p-3">
              ERROR: {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent hover:bg-accent-hover text-white text-sm font-medium py-3 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'CREATING ACCOUNT...' : 'REGISTER'}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-border-subtle text-center">
          <p className="text-sm text-text-secondary mb-3">Already have an engineer account?</p>
          <Link
            href="/login"
            className="text-accent hover:text-accent-hover text-sm font-medium transition-colors"
          >
            Sign In Instead
          </Link>
        </div>
      </div>
    </div>
  )
}
