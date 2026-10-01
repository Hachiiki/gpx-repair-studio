/**
 * Onboarding tour flag (Phase 11) — one guarded localStorage key.
 *
 * The first-run tour's entire persistence: whether this browser has
 * seen the 4-step overlay. Plain text ("seen"), not JSON — the value
 * is also seeded by e2e (playwright.config.ts storageState) so the
 * existing suites never meet the first-run overlay, and the format
 * stays trivial to read there.
 *
 * Guards follow the lib/storage/sessionStore pattern (Phase 10): a
 * browser without localStorage (SSR, private mode, blocked) must never
 * throw — and the tour reacts by NEVER auto-opening (a greeting that
 * cannot remember it happened would nag on every reload; the manual
 * "Take the tour" link still works).
 */

/** localStorage key — versioned like the settings key (§E-8). */
export const TOUR_FLAG_STORAGE_KEY = "gpx-repair-studio.tour.v1";

export type TourFlagStatus =
  /** The tour already ran here — never auto-open again. */
  | "seen"
  /** Fresh browser — the tour may auto-open. */
  | "unseen"
  /** Storage unreadable — suppress the auto-open (see header). */
  | "unavailable";

export function readTourFlag(): TourFlagStatus {
  try {
    if (typeof window === "undefined") return "unavailable";
    return window.localStorage.getItem(TOUR_FLAG_STORAGE_KEY) === "seen"
      ? "seen"
      : "unseen";
  } catch {
    return "unavailable";
  }
}

/** Remember the tour — called on finish, skip, and implicit dismissal. */
export function writeTourSeen(): void {
  try {
    window.localStorage.setItem(TOUR_FLAG_STORAGE_KEY, "seen");
  } catch {
    // Storage dead — the tour still closes; it may offer again. Fine.
  }
}

/** Test helper — restores the "fresh browser" state between cases. */
export function clearTourFlag(): void {
  try {
    window.localStorage.removeItem(TOUR_FLAG_STORAGE_KEY);
  } catch {
    // Never throws — same contract as the session store guards.
  }
}
