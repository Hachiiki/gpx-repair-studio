"use client"

import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { CheckIcon } from "lucide-react"

import { cn } from "@/lib/utils"

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        // Field Plot check: 17 px square, 3 px radius, signal fill with
        // an ink border and a black check when checked (mockup .check).
        "peer border-ink/35 dark:bg-input/30 data-[state=checked]:bg-signal data-[state=checked]:text-inkplus data-[state=checked]:border-ink focus-visible:border-signal aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive size-[17px] shrink-0 rounded-[3px] border-[1.5px] transition-[background-color,border-color] duration-150 outline-none focus-visible:ring-[2.5px] focus-visible:ring-signal/25 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current transition-none"
      >
        <CheckIcon className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
