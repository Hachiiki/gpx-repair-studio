/**
 * Unit words and locale number formatting (Phase 21 — §EE 21.3).
 *
 * The typed lookup translates SENTENCES; this module translates the
 * words that ride ALONGSIDE numbers — distances, speeds, paces. It
 * lives beside the dictionaries (not inside them) because these words
 * are consumed by lib/utils/format.ts's arithmetic-adjacent code, and
 * keeping them in one small table makes the formatting contract easy
 * to test as a unit: one table per locale, one Intl tag per locale.
 *
 * The pseudo locale reuses the ENGLISH words by design: the harness
 * grows UI copy to catch overflow; number/unit rendering stays the
 * real, shippable form so width regressions in the numeric columns
 * can be told apart from the (intended) copy growth.
 */

import type { AppLocale } from "./types";

/** The words format.ts appends to numbers, per locale. */
export interface UnitWords {
  /** Meters below 1 km ("m" / "米"). */
  m: string;
  /** Kilometers ("km" / "公里"). */
  km: string;
  /** Miles ("mi" / "英里"). */
  mi: string;
  /** Kilometers per hour ("km/h" / "公里/时"). */
  kmh: string;
  /** Pace suffix per kilometer ("/km" / "/公里"). */
  perKm: string;
  /** Pace suffix per mile ("/mi" / "/英里"). */
  perMi: string;
}

export const UNIT_WORDS: Record<AppLocale, UnitWords> = {
  en: { m: "m", km: "km", mi: "mi", kmh: "km/h", perKm: "/km", perMi: "/mi" },
  "zh-CN": {
    m: "米",
    km: "公里",
    mi: "英里",
    kmh: "公里/时",
    perKm: "/公里",
    perMi: "/英里",
  },
  pseudo: { m: "m", km: "km", mi: "mi", kmh: "km/h", perKm: "/km", perMi: "/mi" },
};

/** The Intl tag each locale formats numbers and dates with. */
export function localeTag(locale: AppLocale): string {
  return locale === "zh-CN" ? "zh-CN" : "en-US";
}

/**
 * A number in the locale's own grouping/decimal conventions. Options
 * mirror Intl.NumberFormat's (used for the 2-decimal distance form).
 */
export function formatNumber(
  value: number,
  locale: AppLocale,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(localeTag(locale), options).format(value);
}

/**
 * An epoch date-time in the locale's medium date/medium time form —
 * the one form the app's timestamps use (§L-1).
 */
export function formatDateTimeIn(
  epochMs: number,
  locale: AppLocale,
): string {
  return new Intl.DateTimeFormat(localeTag(locale), {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(epochMs));
}
