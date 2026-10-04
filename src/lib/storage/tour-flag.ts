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

// ---------------------------------------------------------------------------
// Phase 19 — per-tool guided walkthrough flags (§EE 19.3)
// ---------------------------------------------------------------------------

/**
 * One JSON key for every tool tour's seen-flag (a map of tool id →
 * "seen"). JSON, not one key per tool, so the e2e storageState seed
 * and future tools stay one entry wide; the value is written whole.
 */
export const TOOL_TOUR_FLAGS_KEY = "gpx-repair-studio.tool-tours.v1";

/** The tool ids that own a guided walkthrough (one source). */
export const TOOL_TOUR_IDS = [
  "repair",
  "share",
  "recovery",
  "create",
  "merge",
  "plan",
  "batch",
] as const;

export type ToolTourId = (typeof TOOL_TOUR_IDS)[number];

type ToolTourFlagMap = Partial<Record<ToolTourId, "seen">>;

function readFlagMap(): ToolTourFlagMap | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(TOOL_TOUR_FLAGS_KEY);
    if (raw === null) return {};
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return {}; // corrupted value → a fresh map (unseen), never a throw
    }
    if (parsed === null || typeof parsed !== "object") return {};
    return parsed as ToolTourFlagMap;
  } catch {
    return null; // storage itself unreadable — callers suppress the offer
  }
}

/**
 * Has this browser seen this tool's tour? Storage that cannot remember
 * reads as "seen" for the AUTO-offer (a greeting that cannot remember
 * would nag on every entry — the Phase 11 rule, applied per tool).
 */
export function hasSeenToolTour(id: ToolTourId): boolean {
  const map = readFlagMap();
  if (map === null) return true;
  return map[id] === "seen";
}

/** Remember one tool's tour (finish, skip, Esc, or offer dismissed). */
export function writeToolTourSeen(id: ToolTourId): void {
  try {
    const map = readFlagMap();
    if (map === null) return; // dead storage — nothing to remember
    map[id] = "seen";
    window.localStorage.setItem(
      TOOL_TOUR_FLAGS_KEY,
      JSON.stringify(map),
    );
  } catch {
    // Never throws — same contract as every storage guard.
  }
}

/** The seen-state of every tool tour at once (the e2e seed's shape). */
export function allToolToursSeen(): Record<ToolTourId, "seen"> {
  return {
    repair: "seen",
    share: "seen",
    recovery: "seen",
    create: "seen",
    merge: "seen",
    plan: "seen",
    batch: "seen",
  };
}

/** Test helper — forget every tool tour flag. */
export function clearToolTourFlags(): void {
  try {
    window.localStorage.removeItem(TOOL_TOUR_FLAGS_KEY);
  } catch {
    // Never throws.
  }
}
