/**
 * i18n core types (Phase 21 — docs/MASTER_PLAN.md §EE 21).
 *
 * The locale model, the dictionary contract, and the locale registry.
 * This module is PURE TYPES + PURE DATA: no DOM, no React, no storage —
 * everything runtime lives in locale.ts / runtime.ts, and the React
 * facade lives in hooks/use-i18n.ts.
 *
 * Locale set decision (§EE 21.3 "the initial set the user picks"):
 * the first shipped pair is English (the source language) + Simplified
 * Chinese (zh-CN) — the language of the requesting user, and the
 * audience most likely to need a privacy-first, locally-running GPX
 * tool in their own language. Adding a locale later is ONE dictionary
 * file + ONE registry entry; the architecture forecloses nothing.
 *
 * "pseudo" is not a real locale: it is the long-string expansion
 * harness (§EE 21.4) for overflow QA — reachable only through the
 * ?lang= override, never offered in the picker, and never persisted.
 */

/** The locales the app can render right now. */
export type AppLocale = "en" | "zh-CN" | "pseudo";

/**
 * Locales a user may PICK (and that may be persisted). The pseudo
 * locale is QA-only: `?lang=pseudo` resolves it for the running tab,
 * but the footer picker does not offer it and setLocale refuses to
 * persist it.
 */
export const PICKABLE_LOCALES = ["en", "zh-CN"] as const;

export type PickableLocale = (typeof PICKABLE_LOCALES)[number];

/** localStorage key — a raw string, shared with the pre-paint script. */
export const LOCALE_STORAGE_KEY = "gpx-repair-studio.locale.v1";

/** The default locale — also the static export's prerender language. */
export const DEFAULT_LOCALE: AppLocale = "en";

/**
 * A locale entry for the picker (and the missing-key gate's loop).
 * `label` is the locale's OWN name for itself (never translated —
 * "English" and "简体中文" are both correct in every UI language).
 */
export interface LocaleDescriptor {
  id: PickableLocale;
  /** The endonym shown in the picker. */
  label: string;
}

/** The picker's locales, in display order. */
export const LOCALE_OPTIONS: readonly LocaleDescriptor[] = [
  { id: "en", label: "English" },
  { id: "zh-CN", label: "简体中文" },
];

/** The BCP-47 tag the document's `lang` attribute should carry. */
export function htmlLangOf(locale: AppLocale): string {
  // The pseudo locale is expanded English — screen readers should keep
  // pronouncing it as English.
  return locale === "pseudo" ? "en" : locale;
}

/** Is this string one of the locales we know? */
export function isAppLocale(value: string): value is AppLocale {
  return value === "en" || value === "zh-CN" || value === "pseudo";
}

/** Interpolation parameters — `{name}` placeholders get these values. */
export type TranslateParams = Record<string, string | number>;

/**
 * A label that may be LOCALIZED (Phase 21's labelKey pattern).
 *
 * Domain code emits `{ key, params }` — the key resolves through the
 * active locale at RENDER time, so a mid-session locale switch
 * re-renders every stored label. A plain `string` is LEGACY (sessions
 * saved before Phase 21 carry final text): it renders as-is, never
 * through a dictionary — old work stays readable forever.
 */
export type LocalLabel = string | { key: string; params?: TranslateParams };

/**
 * A translator bound to one locale. Key-typed when the caller is
 * compile-time checked (components); the `string` overload for data
 * driven lookups (stored label keys) goes through translate() itself.
 */
export type Translator = (
  key: string,
  params?: TranslateParams,
) => string;
