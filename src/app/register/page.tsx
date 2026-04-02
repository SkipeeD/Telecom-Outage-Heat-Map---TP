import { SignalHigh } from "lucide-react"
import { SignupForm } from "@/components/signup-form"
import { AnimatedAuthBackground } from "@/components/animated-auth-background"

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
      console.log('[register] creating user with email:', email)
      const userCredential = await createUserWithEmailAndPassword(auth, email, password)
      const user = userCredential.user
      console.log('[register] user created:', user.uid)

      // Initialize user data in Firestore
      console.log('[register] writing firestore doc')
      await setDoc(doc(db, 'users', user.uid), {
        email: user.email,
        createdAt: new Date().toISOString(),
        role: 'engineer',
      })
      console.log('[register] firestore doc written')

      console.log('[register] sending verification email')
      await sendEmailVerification(userCredential.user)
      console.log('[register] verification email sent, redirecting')
      router.push('/verify-email')
    } catch (err: any) {
      console.error('[register] error:', err)
      setError(err.message || 'Failed to register account.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid min-h-svh lg:grid-cols-2 bg-bg-primary">
      <div className="flex flex-col gap-4 p-6 md:p-10 border-r border-border-subtle">
        <div className="flex justify-center gap-2 md:justify-start">
          <a href="/" className="flex items-center gap-2 font-medium text-text-primary">
            <div className="flex size-8 items-center justify-center rounded-md bg-accent text-white">
              <SignalHigh className="size-5" />
            </div>
            <span className="font-semibold tracking-tight uppercase text-lg">SIGNALIS</span>
          </a>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs">
            <SignupForm />
          </div>
        </div>
      </div>
      <div className="hidden lg:block">
        <AnimatedAuthBackground 
          title="Network Resilience" 
          subtitle="Join the team ensuring continuous connectivity for millions of users worldwide."
        />
      </div>
    </div>
  )
}
