/**
 * Locale observable (Phase 21 — §EE 21.2 runtime).
 *
 * Deliberately the theme store's pattern (src/state/theme-store.ts):
 * a module-level observable, NOT a zustand store. The state is one
 * string; it must be readable OUTSIDE React (lib/utils/format.ts
 * renders unit words; the command palette searches localized labels);
 * and useSyncExternalStore handles the hydration ceremony with zero
 * extra machinery:
 *
 *   - the static export prerenders in English (the build-time locale);
 *   - during hydration `getServerSnapshot` returns "en", so the first
 *     client render matches the prerendered HTML — no mismatch errors;
 *   - immediately after hydration, React notices the client snapshot
 *     (the stored locale) and re-renders in place. A non-English user
 *     may see English settle for one paint — the same trade the theme
 *     store made with classes; recorded in §EE 21.
 *
 * Resolution order, first match wins:
 *   1. `?lang=` on the URL (testing/QA override — NEVER persisted, so
 *      closing the tab returns to the stored preference);
 *   2. the persisted raw key gpx-repair-studio.locale.v1
 *      (pickable locales only — "pseudo" cannot leak into storage);
 *   3. "en" (the default — never sniff the OS language: a locale the
 *      user has not chosen is a guess, and a wrong-language tool is
 *      worse than an English one they know).
 *
 * DOM access happens ONLY inside resolve(), guarded so node-env
 * vitest runs (domain tests import format.ts which reads the locale)
 * and SSR stay deterministic: no DOM, "en". The restricted-global
 * boundary (features/** may not touch window/document) is respected —
 * this module reaches the DOM through globalThis only.
 */

"use client";

import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  PICKABLE_LOCALES,
  htmlLangOf,
  isAppLocale,
  type AppLocale,
  type PickableLocale,
} from "./types";

const listeners = new Set<() => void>();

/** Cached locale (null until the first client read resolves it). */
let current: AppLocale | null = null;

/**
 * Resolve the app locale from the environment. Client-only DOM reads,
 * each individually guarded (private mode, storage disabled, SSR, and
 * node test environments all degrade to the default).
 */
function resolveLocale(): AppLocale {
  // 1) The ?lang= override — for testing and the pseudo-locale QA
  //    harness. Not persisted: it describes THIS load, not a choice.
  try {
    const search = globalThis.location?.search;
    if (search) {
      const param = new URLSearchParams(search).get("lang");
      if (param !== null && isAppLocale(param)) return param;
    }
  } catch {
    // No DOM — fall through.
  }
  // 2) The persisted preference (pickable locales only).
  try {
    const stored = globalThis.localStorage?.getItem(LOCALE_STORAGE_KEY);
    if (stored && isPickable(stored)) return stored;
  } catch {
    // Storage unavailable — degrade to the default.
  }
  // 3) The default.
  return DEFAULT_LOCALE;
}

function isPickable(value: string): value is PickableLocale {
  return (PICKABLE_LOCALES as readonly string[]).includes(value);
}

/** The active locale (server/test snapshot: the default, "en"). */
export function getLocale(): AppLocale {
  if (current === null) current = resolveLocale();
  return current;
}

/** The hydration snapshot — ALWAYS the prerender language. */
export function getServerLocale(): AppLocale {
  return DEFAULT_LOCALE;
}

/**
 * Choose a locale (the picker's action). Persists the pickable value
 * and updates the document's `lang` for assistive tech; notifies the
 * subscribers so every useI18n() instance re-renders in place.
 *
 * The pseudo locale may be SET (the QA harness swaps mid-run) but is
 * never PERSISTED — reloading without the URL param must return to
 * the user's real choice.
 */
export function setLocale(locale: AppLocale): void {
  const previous = current ?? DEFAULT_LOCALE;
  current = locale;
  if (isPickable(locale)) {
    try {
      globalThis.localStorage?.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      // Storage unavailable — the choice lives for this session only.
    }
  }
  if (locale !== previous) {
    applyDocumentLang(locale);
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        // a broken subscriber never blocks the others
      }
    }
  } else {
    // First programmatic set of an already-active locale still owes
    // the document its lang attribute (e.g. boot without any pick).
    applyDocumentLang(locale);
  }
}

/** Mirror the locale into <html lang> (no-op outside the DOM). */
function applyDocumentLang(locale: AppLocale): void {
  try {
    const doc = globalThis.document;
    if (doc?.documentElement) {
      doc.documentElement.setAttribute("lang", htmlLangOf(locale));
    }
  } catch {
    // No DOM — nothing to update.
  }
}

/** Subscribe to locale changes; returns the unsubscribe handle. */
export function subscribeLocale(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

/**
 * Test hook — reset the cached locale so the next getLocale() resolves
 * from the environment again. NEVER call this in app code: the cache
 * exists so a session's lookups are one resolution, not one per render.
 */
export function __resetLocaleForTests(): void {
  current = null;
  applyDocumentLang(DEFAULT_LOCALE);
}

/**
 * Read the stored preference WITHOUT touching the cache — the
 * pre-paint script's sibling (it reads the same raw key before React
 * exists, so the first accessible paint already carries the lang).
 * Returns null when nothing (or something drifted) is stored.
 */
export function readStoredLocale(): PickableLocale | null {
  try {
    const stored = globalThis.localStorage?.getItem(LOCALE_STORAGE_KEY);
    return stored && isPickable(stored) ? stored : null;
  } catch {
    return null;
  }
}
