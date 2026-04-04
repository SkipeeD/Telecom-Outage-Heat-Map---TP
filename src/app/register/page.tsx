import Link from "next/link"
import { SignalHigh } from "lucide-react"
import { SignupForm } from "@/components/signup-form"
import { GlobeAuthBackground } from "@/components/globe-auth-background"
import { SparklesCore } from "@/components/ui/sparkles"

export default function RegisterPage() {
  return (
    <div className="relative grid min-h-svh lg:grid-cols-2 bg-[var(--bg-base)] transition-colors duration-300">
      {/* Sparkles across both panels */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <SparklesCore
          id="register-sparkles"
          background="transparent"
          minSize={0.4}
          maxSize={1.2}
          particleDensity={80}
          className="w-full h-full"
          particleColor="#7c6ff7"
          speed={1.5}
        />
      </div>

      <div className="relative z-10 flex flex-col gap-4 p-6 md:p-10">
        <div className="flex justify-center gap-2 md:justify-start">
          <Link href="/" className="flex items-center gap-2 font-medium text-[var(--text-primary)]">
            <div className="flex size-8 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent)] text-white shadow-[var(--shadow-glow)]">
              <SignalHigh className="size-5" />
            </div>
            <span className="font-semibold tracking-[0.2em] uppercase text-[14px]">SIGNALIS</span>
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs">
            <SignupForm />
          </div>
        </div>
      </div>

      <div className="relative z-10 hidden lg:block">
        <GlobeAuthBackground />
      </div>
    </div>
  )
}
