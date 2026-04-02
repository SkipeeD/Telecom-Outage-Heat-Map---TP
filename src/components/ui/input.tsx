import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-border-subtle bg-bg-surface px-3 py-1 text-text-primary shadow-xs transition-[color,box-shadow] outline-none selection:bg-accent selection:text-white placeholder:text-text-muted disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-accent focus-visible:ring-[3px] focus-visible:ring-accent/50",
        "aria-invalid:border-alarm-critical aria-invalid:ring-alarm-critical/20",
        className
      )}
      {...props}
    />
  )
}

export { Input }
