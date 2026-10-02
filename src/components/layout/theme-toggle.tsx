/**
 * ThemeToggle (Phase 12) — the footer's three-state theme control.
 *
 * System / Light / Dark, one icon button each, in a bordered
 * segmented chip — the Field Plot keycap vocabulary at miniature
 * scale. The pressed state inverts (ink fill, paper icon), the
 * unpressed icons sit in shade; the control is a real aria-pressed
 * radiogroup-shaped set of buttons (radio semantics would forbid
 * "system" being default with none pressed, so pressed/not it is).
 *
 * Pure presentation + the theme store: it uses useTheme() itself, so
 * mounting it anywhere is enough to keep the document class in sync.
 */

"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import type { ThemePreference } from "@/state/theme-store";
import { cn } from "@/lib/utils";

const OPTIONS: readonly {
  value: ThemePreference;
  label: string;
  icon: typeof Sun;
}[] = [
  { value: "system", label: "Follow the system theme", icon: Monitor },
  { value: "light", label: "Light theme", icon: Sun },
  { value: "dark", label: "Dark theme", icon: Moon },
];

export function ThemeToggle() {
  const { preference, setPreference } = useTheme();

  return (
    <div
      role="group"
      aria-label="Color theme"
      data-testid="theme-toggle"
      className="inline-flex items-center gap-0.5 rounded-[8px] border-[1.5px] border-ink/25 bg-card p-[3px] shadow-lift"
    >
      {OPTIONS.map((option) => {
        const pressed = preference === option.value;
        return (
          <button
            key={option.value}
            type="button"
            data-testid={`theme-toggle-${option.value}`}
            aria-pressed={pressed}
            title={option.label}
            aria-label={option.label}
            onClick={() => setPreference(option.value)}
            className={cn(
              "grid size-[26px] place-items-center rounded-[6px] transition-colors focus-visible:outline-2",
              pressed
                ? "bg-ink text-paper"
                : "text-shade hover:bg-ink/[0.08] hover:text-foreground",
            )}
          >
            <option.icon className="size-[14px]" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
