"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { auth } from '@/lib/firebase'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldError,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import Link from "next/link"
import { motion } from "motion/react"

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
      await signInWithEmailAndPassword(auth, email, password)
      router.push('/')
    } catch (err: any) {
      setError(err.message || 'Failed to login. Please check your credentials.')
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
            <p className="text-[13px] text-balance text-[var(--text-secondary)]">
              Enter your credentials to access the dashboard
            </p>
          </motion.div>
          
          <motion.div variants={itemVariants}>
            <Field>
              <FieldLabel htmlFor="email" className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-secondary)]">
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
                <FieldLabel htmlFor="password" className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-secondary)]">
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
              {loading ? 'AUTHENTICATING...' : 'SIGN IN'}
            </Button>
          </motion.div>
          
          <motion.div variants={itemVariants}>
            <FieldDescription className="text-center text-[12px]">
              Don&apos;t have an account?{" "}
              <Link href="/register" className="text-[var(--accent)] hover:text-[var(--accent-bright)] underline underline-offset-4">
                Register New
              </Link>
            </FieldDescription>
          </motion.div>
        </FieldGroup>
      </form>
    </motion.div>
  )
}
