import { SignalHigh } from "lucide-react"
import { LoginForm } from "@/components/login-form"
import { AnimatedAuthBackground } from "@/components/animated-auth-background"

export default function LoginPage() {
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
            <LoginForm />
          </div>
        </div>
      </div>
      <div className="hidden lg:block">
        <AnimatedAuthBackground 
          title="Outage Monitoring System" 
          subtitle="Real-time heat map and analytics for telecom infrastructure and network availability."
        />
      </div>
    </div>
  )
}
