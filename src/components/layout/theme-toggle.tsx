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
import { useI18n } from "@/hooks/use-i18n";
import type { ThemePreference } from "@/state/theme-store";
import { cn } from "@/lib/utils";

const OPTIONS: readonly {
  value: ThemePreference;
  /** The dictionary key for the option's title/aria-label. */
  labelKey:
    | "theme.system"
    | "theme.light"
    | "theme.dark";
  icon: typeof Sun;
}[] = [
  { value: "system", labelKey: "theme.system", icon: Monitor },
  { value: "light", labelKey: "theme.light", icon: Sun },
  { value: "dark", labelKey: "theme.dark", icon: Moon },
];

export function ThemeToggle() {
  const { preference, setPreference } = useTheme();
  const { t } = useI18n();

  return (
    <div
      role="group"
      aria-label={t("theme.groupA11y")}
      data-testid="theme-toggle"
      className="inline-flex items-center gap-0.5 rounded-[8px] border-[1.5px] border-ink/25 bg-card p-[3px] shadow-lift"
    >
      {OPTIONS.map((option) => {
        const pressed = preference === option.value;
        const label = t(option.labelKey);
        return (
          <button
            key={option.value}
            type="button"
            data-testid={`theme-toggle-${option.value}`}
            aria-pressed={pressed}
            title={label}
            aria-label={label}
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
