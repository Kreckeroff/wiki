import * as React from "react"

import { cn } from "@/lib/utils"

interface MenuItemProps extends React.ComponentProps<"button"> {
  icon: React.ReactNode
  label: string
  description?: React.ReactNode
  active?: boolean
}

const MenuItem = React.forwardRef<HTMLButtonElement, MenuItemProps>(
  ({ className, icon, label, description, active = false, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      role="option"
      aria-selected={active}
      tabIndex={-1}
      data-active={active || undefined}
      className={cn(
        "flex w-full items-center gap-3 rounded-[var(--wiki-radius-md)] px-3 py-2 text-left font-[var(--wiki-font-family)] text-[var(--wiki-color-ink)] outline-none transition-colors [transition-duration:var(--wiki-motion-fast)] hover:bg-[var(--wiki-color-canvas)] aria-selected:bg-[var(--wiki-color-accent-soft)]",
        className
      )}
      {...props}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-[var(--wiki-radius-sm)] border border-[var(--wiki-color-line)] bg-[var(--wiki-color-paper)] text-[var(--wiki-color-muted)] [&_svg]:size-4" aria-hidden="true">
        {icon}
      </span>
      <span className="grid min-w-0 gap-0.5">
        <span className="truncate text-[14px] leading-[22px] font-medium">{label}</span>
        {description && <span className="truncate text-[12px] leading-[18px] text-[var(--wiki-color-muted)]">{description}</span>}
      </span>
    </button>
  )
)
MenuItem.displayName = "MenuItem"

export { MenuItem }
