import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  // Field Plot keycap system: equipment-grade 1.5 px borders, a hard
  // ink bottom edge that depresses on press, 5 px control radius.
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[5px] text-sm font-semibold transition-[background-color,border-color,color,box-shadow,translate] duration-150 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal aria-invalid:outline-destructive",
  {
    variants: {
      variant: {
        // The orange keycap: signal fill, black text, ink edge.
        default:
          "bg-primary text-primary-foreground border-[1.5px] border-ink shadow-key hover:shadow-key-hover motion-safe:hover:-translate-y-px motion-safe:active:translate-y-[2px] motion-safe:active:shadow-none",
        // The dark keycap: hard ink+ surface for destructive actions.
        destructive:
          "bg-destructive text-white border-[1.5px] border-ink shadow-key hover:shadow-key-hover hover:bg-ink motion-safe:hover:-translate-y-px motion-safe:active:translate-y-[2px] motion-safe:active:shadow-none",
        outline:
          "border-[1.5px] border-ink bg-card text-ink hover:bg-ink/[0.06] hover:text-ink",
        secondary:
          "bg-secondary text-secondary-foreground border-[1.25px] border-ink/20 hover:bg-ink/[0.09]",
        ghost: "text-ink hover:bg-ink/[0.06] hover:text-ink",
        link: "text-primary font-medium underline-offset-[3px] hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-[4px] gap-1.5 px-3 text-[13px] has-[>svg]:px-2.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-10 rounded-[6px] px-6 has-[>svg]:px-4",
        icon: "size-9",
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
  variant,
  size,
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
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
