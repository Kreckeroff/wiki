import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-[var(--wiki-size-control-md)] w-full min-w-0 rounded-[var(--wiki-radius-md)] border border-[var(--wiki-color-line)] bg-[var(--wiki-color-paper)] px-3 py-2 font-[var(--wiki-font-family)] text-[14px] leading-[22px] text-[var(--wiki-color-ink)] transition-[border-color,box-shadow] [transition-duration:var(--wiki-motion-normal)] outline-none placeholder:text-[var(--wiki-color-faint)] selection:bg-[var(--wiki-color-selection)] disabled:cursor-not-allowed disabled:opacity-50 file:mr-3 file:inline-flex file:h-7 file:border-0 file:bg-transparent file:p-0 file:text-[13px] file:font-medium file:text-[var(--wiki-color-ink)]",
        "focus-visible:border-[var(--wiki-color-accent)] focus-visible:ring-2 focus-visible:ring-[var(--wiki-color-accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--wiki-color-paper)]",
        "aria-invalid:border-[var(--wiki-color-danger)] aria-invalid:ring-[var(--wiki-color-danger)]",
        className
      )}
      {...props}
    />
  )
}

export { Input }
