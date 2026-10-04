/**
 * LanguageToggle (Phase 21) — the footer's locale control.
 *
 * The theme toggle's twin: one bordered segmented chip, one button
 * per pickable locale, the pressed state inverts (ink fill, paper
 * glyph). The option GLYPHS are the locales' endonyms — "EN" and
 * "中文" — which are correct in every UI language (never translated);
 * the toggle's own labels (group name, per-option a11y text, the
 * switch toast) come from the dictionary like all app copy.
 *
 * Uses useI18n() itself: mounting it anywhere keeps the document lang
 * in sync through the locale store, exactly like the theme toggle
 * owns the document class.
 */

"use client";

import { Languages } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useI18n } from "@/hooks/use-i18n";
import { LOCALE_OPTIONS } from "@/i18n/types";
import { cn } from "@/lib/utils";

/** The short endonym shown as the button glyph (types.ts owns these). */
const GLYPHS: Record<string, string> = {
  en: "EN",
  "zh-CN": "中文",
};

export function LanguageToggle() {
  const { locale, setLocale, t } = useI18n();

  return (
    <div
      role="group"
      aria-label={t("language.groupA11y")}
      data-testid="language-toggle"
      className="inline-flex items-center gap-0.5 rounded-[8px] border-[1.5px] border-ink/25 bg-card p-[3px] shadow-lift"
    >
      {LOCALE_OPTIONS.map((option) => {
        const pressed = locale === option.id;
        return (
          <button
            key={option.id}
            type="button"
            data-testid={`language-toggle-${option.id}`}
            aria-pressed={pressed}
            title={t("language.optionA11y", { locale: option.label })}
            aria-label={t("language.optionA11y", { locale: option.label })}
            onClick={() => {
              if (locale === option.id) return;
              setLocale(option.id);
              toast({ description: t("footer.languageChanged") });
            }}
            className={cn(
              "inline-flex h-[26px] min-w-[34px] items-center justify-center rounded-[6px] px-1.5 text-[12px] font-semibold leading-none transition-colors focus-visible:outline-2",
              pressed
                ? "bg-ink text-paper"
                : "text-shade hover:bg-ink/[0.08] hover:text-foreground",
            )}
          >
            <span aria-hidden="true">{GLYPHS[option.id]}</span>
          </button>
        );
      })}
      {/* Screen-reader text for the group when focus lands cold — the
          glyphs alone do not say what the control is for. */}
      <span className="sr-only">
        <Languages className="size-3.5" aria-hidden="true" />
        {t("footer.language")}
      </span>
    </div>
  );
}
