import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[var(--wiki-radius-md)] font-[var(--wiki-font-family)] text-[14px] leading-[22px] font-medium transition-[background-color,border-color,color,box-shadow,transform] [transition-duration:var(--wiki-motion-normal)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--wiki-color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--wiki-color-paper)] active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 aria-invalid:border-[var(--wiki-color-danger)] aria-invalid:ring-[var(--wiki-color-danger)]",
  {
    variants: {
      variant: {
        default: "border border-[var(--wiki-color-accent)] bg-[var(--wiki-color-accent)] text-[var(--wiki-color-white)] hover:border-[var(--wiki-color-accent-dark)] hover:bg-[var(--wiki-color-accent-dark)]",
        destructive:
          "border border-[var(--wiki-color-danger)] bg-[var(--wiki-color-danger)] text-[var(--wiki-color-white)] hover:brightness-95 focus-visible:ring-[var(--wiki-color-danger)]",
        outline:
          "border border-[var(--wiki-color-line)] bg-[var(--wiki-color-paper)] text-[var(--wiki-color-ink)] hover:bg-[var(--wiki-color-canvas)]",
        secondary:
          "border border-[var(--wiki-color-line)] bg-[var(--wiki-color-paper)] text-[var(--wiki-color-ink)] hover:border-[var(--wiki-color-control)] hover:bg-[var(--wiki-color-canvas)]",
        ghost:
          "border border-transparent bg-transparent text-[var(--wiki-color-muted)] hover:bg-[var(--wiki-color-canvas)] hover:text-[var(--wiki-color-ink)]",
        link: "border border-transparent bg-transparent text-[var(--wiki-color-accent)] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-[var(--wiki-size-control-md)] px-4 py-2 has-[>svg]:px-3",
        sm: "h-[var(--wiki-size-control-sm)] gap-1.5 px-3 py-1 text-[13px] leading-[20px] has-[>svg]:px-2.5",
        lg: "h-[var(--wiki-size-control-lg)] px-6 has-[>svg]:px-4",
        icon: "size-[var(--wiki-size-control-md)] p-0",
        "icon-sm": "size-[var(--wiki-size-icon)] p-0",
        "icon-lg": "size-[var(--wiki-size-control-lg)] p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
