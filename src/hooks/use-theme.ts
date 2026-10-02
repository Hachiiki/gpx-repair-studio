/**
 * useTheme (Phase 12 — dark mode) — the reactive theme binding.
 *
 * Returns the stored preference ("light" | "dark" | "system"), the
 * preference resolved against the OS, and the setter. The resolved
 * value is applied to <html> (the .dark class + color-scheme) by an
 * effect here, so ANY component using this hook keeps the document in
 * sync — the footer toggle alone is enough to drive it, and every map
 * controller hook reads the same truth.
 *
 * Flash-free by construction: the pre-paint script in
 * src/app/layout.tsx sets the class before React hydrates, and this
 * hook's apply-effect only ever re-asserts the same value (the
 * system-dark probe is initialized lazily so the first effect run
 * already agrees with the script).
 *
 * Safe to use from any number of components (module-level store, see
 * src/state/theme-store.ts). SSR snapshot is the default ("system").
 */

"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  getThemePreference,
  setThemePreference,
  subscribeToTheme,
  type ThemePreference,
} from "@/state/theme-store";

export interface ThemeBinding {
  /** The stored preference (never null; "system" by default). */
  preference: ThemePreference;
  /** The preference resolved against the OS right now. */
  resolved: "light" | "dark";
  /** Persist + apply a new preference. */
  setPreference: (preference: ThemePreference) => void;
}

export function useTheme(): ThemeBinding {
  const preference = useSyncExternalStore(
    subscribeToTheme,
    getThemePreference,
    () => "system" as const,
  );

  // The OS probe — lazily initialized so the very first render on the
  // client already agrees with the pre-paint script (no one-frame flip
  // when the preference is "system" and the OS is dark). Guarded for
  // environments without matchMedia (older jsdom test setups).
  const [systemDark, setSystemDark] = useState(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return false;
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemDark(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const resolved: "light" | "dark" =
    preference === "system" ? (systemDark ? "dark" : "light") : preference;

  // Apply to the document — idempotent, so multiple hook instances
  // (shell, toggle, legend, map hooks) writing the same value is free.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", resolved === "dark");
    root.style.colorScheme = resolved;
  }, [resolved]);

  const setPreference = useCallback((next: ThemePreference) => {
    setThemePreference(next);
  }, []);

  return { preference, resolved, setPreference };
}
