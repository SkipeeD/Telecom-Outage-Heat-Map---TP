import { SignalHigh } from "lucide-react"
import { LoginForm } from "@/components/login-form"
import { GlobeAuthBackground } from "@/components/globe-auth-background"

export default function LoginPage() {
  return (
    <div className="grid min-h-svh lg:grid-cols-2 bg-[var(--bg-base)] transition-colors duration-300">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex justify-center gap-2 md:justify-start">
          <a href="/" className="flex items-center gap-2 font-medium text-[var(--text-primary)]">
            <div className="flex size-8 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent)] text-white shadow-[var(--shadow-glow)]">
              <SignalHigh className="size-5" />
            </div>
            <span className="font-semibold tracking-[0.2em] uppercase text-[14px]">SIGNALIS</span>
          </a>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs">
            <LoginForm />
          </div>
        </div>
      </div>
      <div className="hidden lg:block">
        <GlobeAuthBackground
          title="Outage Monitoring System"
          subtitle="Real-time heat map and analytics for telecom infrastructure and network availability."
        />
      </div>
    </div>
  )
}
