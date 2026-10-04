/**
 * Translation runtime (Phase 21 — §EE 21.2).
 *
 * A deliberately small, dependency-free lookup: no i18n framework, no
 * ICU message format, no runtime plurals engine. The app's needs are
 * flat string maps with `{param}` interpolation; the discipline that
 * keeps this honest is the TEST gate, not the library:
 *
 *   - every key used in code exists in en (compile-time: MessageKey;
 *     run-time: the missing-key unit gate walks every locale file);
 *   - every `{param}` in en has its twin in every translation (the
 *     param-parity gate);
 *   - en is the fallback for a key a translation has not reached yet
 *     (and in tests, a missing key is an assertion failure, not a
 *     silent pass-through — the gate covers the shipped files, the
 *     fallback covers the long tail).
 *
 * Pure: no DOM, no React, no stores. The React facade is
 * hooks/use-i18n.ts; the locale observable is i18n/locale.ts.
 */

import { DEFAULT_LOCALE, type AppLocale, type TranslateParams } from "./types";
import { en, type MessageKey } from "./dicts/en";

export type { MessageKey };

/** The dictionaries, by locale. English is always present (source). */
import { zhCN } from "./dicts/zh-CN";
import { pseudoDictionary } from "./pseudo";

export const DICTIONARIES: Record<AppLocale, Record<string, string>> = {
  en,
  "zh-CN": zhCN,
  pseudo: pseudoDictionary(en),
};

/** Every key the source dictionary defines (the gate's loop). */
export function messageKeys(): string[] {
  return Object.keys(en);
}

/**
 * Every `{param}` name a message uses, in order of first appearance —
 * the param-parity gate compares these between locales.
 */
export function paramNamesOf(template: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const match of template.matchAll(
    /(?<!\{)\{([a-zA-Z][a-zA-Z0-9_]*)\}/g,
  )) {
    if (!seen.has(match[1])) {
      seen.add(match[1]);
      names.push(match[1]);
    }
  }
  return names;
}

/**
 * Fill `{param}` placeholders. Unknown placeholders are left as-is
 * (visible, not silently empty — a bug should look like a bug).
 */
export function interpolate(
  template: string,
  params?: TranslateParams,
): string {
  if (!params) return template;
  return template.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (whole, name) =>
    name in params ? String(params[name]) : whole,
  );
}

/** Collected during a translate() miss — tests assert it stays empty. */
export const missingKeyLog: string[] = [];

/**
 * Translate one key into one locale, falling back to English when the
 * locale has no entry. Pure: same inputs, same string, no DOM.
 */
export function translate(
  locale: AppLocale,
  key: string,
  params?: TranslateParams,
): string {
  const dict = DICTIONARIES[locale];
  const template = dict[key] ?? en[key];
  if (template === undefined) {
    // Record and degrade honestly: the key itself is the visible
    // fallback (a missing key should never render an empty string —
    // tests and QA see the raw key and can file it).
    if (missingKeyLog.length < 200) missingKeyLog.push(`${locale}:${key}`);
    return interpolate(key, params);
  }
  return interpolate(template, params);
}

/** True when the key exists in the source dictionary. */
export function isMessageKey(key: string): key is MessageKey {
  return key in en;
}

/**
 * A translator bound to one locale (components hand this to pure
 * helpers that build option lists — getLandingTools(t) and friends).
 * Bound with translate's English fallback intact.
 */
export function translatorFor(locale: AppLocale) {
  return (key: string, params?: TranslateParams) =>
    translate(locale, key, params);
}

/**
 * The current-locale translator for NON-React call sites that render
 * at user-action time (toasts fired from hooks, announcements).
 * Components should use hooks/use-i18n.ts instead — it re-renders on
 * locale change; this reads the observable at call time.
 */
import { getLocale } from "./locale";
export function translateNow(key: string, params?: TranslateParams): string {
  return translate(getLocale(), key, params);
}

import type { LocalLabel, Translator } from "./types";

/**
 * Resolve a LocalLabel (Phase 21's domain-label pattern): structured
 * labels translate through the bound locale; legacy strings render
 * verbatim — sessions saved before Phase 21 keep their exact text.
 */
export function translateLabel(t: Translator, label: LocalLabel): string {
  return typeof label === "string" ? label : t(label.key, label.params);
}

/** A label's params object, when it is a structured one. */
export function labelParams(label: LocalLabel): TranslateParams | undefined {
  return typeof label === "string" ? undefined : label.params;
}

/** True when the label is a structured (localized) one. */
export function isLocalLabelStructured(
  label: LocalLabel,
): label is { key: string; params?: TranslateParams } {
  return typeof label !== "string";
}

export { DEFAULT_LOCALE };
