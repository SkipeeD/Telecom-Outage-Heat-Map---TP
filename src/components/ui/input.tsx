import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-1 text-text-primary shadow-sm transition-all outline-none selection:bg-[var(--accent)] selection:text-white placeholder:text-text-muted disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-[var(--border-strong)] focus-visible:ring-2 focus-visible:ring-[var(--accent-dim)]",
        "aria-invalid:border-[var(--alarm-critical)] aria-invalid:ring-[var(--alarm-critical)]/20",
        className
      )}
      {...props}
    />
  )
}

export { Input }
