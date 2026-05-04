"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { auth, googleProvider } from '@/lib/firebase'
import { signInWithEmailAndPassword, signInWithPopup } from 'firebase/auth'
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldError,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import Link from "next/link"
import { motion } from "motion/react"

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

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!email || !password) {
      setError('Please fill in all fields.')
      return
    }

    setLoading(true)
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password)
      await userCredential.user.reload()
      if (!userCredential.user.emailVerified) {
        router.push('/verify-email')
        return
      }
      // Let AuthProvider handle the redirect to /map once profile is ready
    } catch (err) {
      const error = err as Error
      setError(error.message || 'Failed to login. Please check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    setError(null)
    setLoading(true)
    try {
      await signInWithPopup(auth, googleProvider)
      // Let AuthProvider handle the redirect to /map once profile is ready
    } catch (err) {
      const error = err as Error
      setError(error.message || 'Failed to login with Google.')
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
        <form onSubmit={handleLogin}>
          <FieldGroup>
            <motion.div variants={itemVariants} className="flex flex-col items-center gap-2 text-center mb-2">
              <h1 className="text-[20px] font-semibold text-[var(--text-primary)] uppercase tracking-widest">
                Login to SIGNALIS
              </h1>
            </motion.div>

            <motion.div variants={itemVariants}>
              <Field>
                <FieldLabel htmlFor="email"
                            className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-secondary)]">
                  Email Address
                </FieldLabel>
                <Input
                    id="email"
                    type="email"
                    placeholder="engineer@telecom.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-[var(--glass-bg)] border-[var(--glass-border)] focus:border-[var(--border-strong)] rounded-[var(--radius-md)]"
                />
              </Field>
            </motion.div>

            <motion.div variants={itemVariants}>
              <Field>
                <div className="flex items-center">
                  <FieldLabel htmlFor="password"
                              className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-secondary)]">
                    Password
                  </FieldLabel>
                  <a
                      href="#"
                      className="ml-auto text-[12px] text-[var(--accent)] hover:text-[var(--accent-bright)] underline-offset-4 hover:underline transition-colors"
                  >
                    Forgot password?
                  </a>
                </div>
                <Input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-[var(--glass-bg)] border-[var(--glass-border)] focus:border-[var(--border-strong)] rounded-[var(--radius-md)]"
                />
              </Field>
            </motion.div>

            {error && (
                <motion.div variants={itemVariants}>
                  <FieldError
                      className="bg-red-500/10 border border-red-500/30 p-3 rounded-[var(--radius-md)] text-[12px] font-mono">
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
                {loading ? 'AUTHENTICATING...' : 'SIGN IN'}
              </Button>
            </motion.div>

            <motion.div variants={itemVariants}>
              <Link href="/register" className="block w-full">
                <Button
                    type="button"
                    variant="outline"
                    className="w-full bg-[var(--glass-bg)] hover:bg-[var(--glass-hover)] border-[var(--glass-border)] hover:border-[var(--border-strong)] text-[var(--text-primary)] rounded-[var(--radius-md)] h-10 uppercase tracking-widest text-[13px] font-medium transition-all backdrop-blur-sm"
                >
                  SIGN UP
                </Button>
              </Link>
            </motion.div>

            <motion.div variants={itemVariants} className="relative flex items-center gap-4 py-2">
              <Separator className="flex-1 bg-[var(--glass-border)]"/>
              <span
                  className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-secondary)] font-medium">OR</span>
              <Separator className="flex-1 bg-[var(--glass-border)]"/>
            </motion.div>

            <motion.div variants={itemVariants}>
              <Button
                  type="button"
                  variant="outline"
                  onClick={handleGoogleLogin}
                  disabled={loading}
                  className="w-full bg-transparent border-[var(--glass-border)] hover:bg-[var(--glass-bg)] hover:border-[var(--border-strong)] text-[var(--text-primary)] rounded-[var(--radius-md)] h-10 uppercase tracking-widest text-[12px] font-medium transition-all flex items-center justify-center gap-3"
              >
                <svg viewBox="0 0 24 24" className="size-4 shrink-0" xmlns="http://www.w3.org/2000/svg">
                  <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      fill="#4285F4"/>
                  <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"/>
                  <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                      fill="#FBBC05"/>
                  <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"/>
                </svg>
                Login with Google
              </Button>
            </motion.div>


          </FieldGroup>
        </form>
      </motion.div>
  )
}
