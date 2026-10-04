/**
 * useI18n — the React facade over the i18n runtime (Phase 21).
 *
 * One hook, three things:
 *   - `locale` — the ACTIVE app locale, subscribed through
 *     useSyncExternalStore. During hydration the server snapshot
 *     ("en") is used, so the first client render matches the static
 *     export's prerendered HTML (no mismatch errors); immediately
 *     after hydration React re-renders with the client's resolved
 *     locale (the theme store's exact ceremony, applied to text).
 *   - `t` — a translator bound to that locale. Key-typed in editors
 *     (autocomplete over the source dictionary's keys).
 *   - `setLocale` — the picker's action (persisted for pickable
 *     locales; the pseudo locale is a session-only QA override).
 *
 * Components render copy ONLY through this hook (or through pure
 * helpers it feeds — getLandingTools(t) and friends); the ESLint rule
 * no-hardcoded-ui-strings (§EE 21.1) keeps new copy from bypassing it.
 */

"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  getLocale,
  getServerLocale,
  setLocale as setLocaleObservable,
  subscribeLocale,
} from "@/i18n/locale";
import { translate } from "@/i18n/runtime";
import type { AppLocale, TranslateParams } from "@/i18n/types";

/**
 * A translator's callable shape — for pure helpers that build
 * option lists from keys (getLandingTools(t) and friends) without
 * depending on the hook module itself.
 */
export type TranslatorArg = (
  key: string,
  params?: TranslateParams,
) => string;

export interface I18nApi {
  /** The active locale (the hydration-safe snapshot). */
  locale: AppLocale;
  /** Translate a key, with optional `{param}` values. */
  t: (key: string, params?: TranslateParams) => string;
  /** Choose a new locale (persisted when pickable). */
  setLocale: (locale: AppLocale) => void;
}

export function useI18n(): I18nApi {
  const locale = useSyncExternalStore(
    subscribeLocale,
    getLocale,
    getServerLocale,
  );
  const t = useCallback(
    (key: string, params?: TranslateParams) => translate(locale, key, params),
    [locale],
  );
  const setLocale = useCallback((next: AppLocale) => {
    setLocaleObservable(next);
  }, []);
  return { locale, t, setLocale };
}

/**
 * A translator bound to English, for TESTS that assert copy text
 * (tests stay English-anchored: the en dictionary is the contract the
 * zh translation is checked against, so assertions read en strings).
 */
export function enTranslator(
  key: string,
  params?: TranslateParams,
): string {
  return translate("en", key, params);
}
