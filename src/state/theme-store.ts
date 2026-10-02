/**
 * Theme preference store (Phase 12 — dark mode).
 *
 * The light/dark preference is stored as a RAW string under its own
 * dedicated key (not inside the ui-store's JSON blob) for one reason:
 * the pre-paint inline script in src/app/layout.tsx must read it
 * without parsing anything, before React exists, so a dark-theme user
 * never sees a light flash. The same key is read here once the app is
 * alive; the two readers are pinned together by tests/theme.test.ts.
 *
 * Deliberately NOT a zustand store: the state is one string with a
 * handful of subscribers (the useTheme hook instances), the value must
 * be readable outside React (map controller construction), and a plain
 * module-level observable keeps all of that at ~60 lines with zero
 * hydration ceremony (useSyncExternalStore handles the SSR snapshot).
 *
 * "system" (the default) follows the OS preference live.
 */

"use client";

export type ThemePreference = "light" | "dark" | "system";

/** localStorage key — raw string, shared with the pre-paint script. */
export const THEME_STORAGE_KEY = "gpx-repair-studio.theme.v1";

const listeners = new Set<() => void>();

/** Cached preference (null until first read on the client). */
let current: ThemePreference | null = null;

function readPreference(): ThemePreference {
  if (current !== null) return current;
  if (typeof window === "undefined") return "system";
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    current =
      stored === "light" || stored === "dark" || stored === "system"
        ? stored
        : "system";
  } catch {
    // Private modes / storage disabled — degrade to the default.
    current = "system";
  }
  return current;
}

/** The stored preference (server snapshot: "system"). */
export function getThemePreference(): ThemePreference {
  return readPreference();
}

/** Persist + announce a new preference. */
export function setThemePreference(preference: ThemePreference): void {
  current = preference;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Storage unavailable — the choice lives for this page only.
  }
  for (const listener of listeners) listener();
}

/**
 * The preference resolved against the OS right now — usable outside
 * React (the map controllers read it at construction time). The hook
 * (src/hooks/use-theme.ts) is the reactive version.
 */
export function resolvedThemeNow(): "light" | "dark" {
  const preference = readPreference();
  if (preference !== "system") return preference;
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** Subscribe to preference changes (useSyncExternalStore plumbing). */
export function subscribeToTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
