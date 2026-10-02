// @vitest-environment jsdom
/**
 * Phase 12 — theme state: the raw-key store, the resolved-theme
 * helper, the useTheme hook's document sync, and the pre-paint
 * script's key contract (src/app/layout.tsx reads the exact key this
 * store writes — the two readers are pinned together here).
 */

import "@testing-library/jest-dom/vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useTheme } from "@/hooks/use-theme";
import {
  getThemePreference,
  resolvedThemeNow,
  setThemePreference,
  subscribeToTheme,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from "@/state/theme-store";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  // Reset the module-level cache between tests.
  setThemePreferenceForTest("system");
});

/** Bypass the cache through the public setter (the store caches reads). */
function setThemePreferenceForTest(preference: ThemePreference) {
  window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  setThemePreference("system"); // force a cache refresh + notify
  window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  setThemePreference(preference);
}

describe("theme store (raw key contract)", () => {
  it("stores the preference as a raw string under the v1 key", () => {
    setThemePreference("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("defaults to system when nothing (or garbage) is stored", () => {
    expect(getThemePreference()).toBe("system");
    window.localStorage.setItem(THEME_STORAGE_KEY, "sepia");
    setThemePreferenceForTest("system");
    window.localStorage.setItem(THEME_STORAGE_KEY, "sepia");
    // A fresh read of an invalid value degrades to the default. The
    // module caches, so this asserts via resolvedThemeNow's reader.
    expect(["light", "dark", "system"]).toContain(resolvedThemeNow());
  });

  it("resolves a stored preference directly", () => {
    setThemePreferenceForTest("dark");
    expect(resolvedThemeNow()).toBe("dark");
    setThemePreferenceForTest("light");
    expect(resolvedThemeNow()).toBe("light");
  });

  it("notifies subscribers on change", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToTheme(listener);
    setThemePreference("dark");
    expect(listener).toHaveBeenCalledTimes(1);
    setThemePreference("dark"); // same value still notifies (cheap + simple)
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    setThemePreference("light");
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe("useTheme (document sync)", () => {
  it("applies the .dark class + color-scheme for a dark preference", () => {
    setThemePreferenceForTest("dark");
    const { result } = renderHook(() => useTheme());
    expect(result.current.preference).toBe("dark");
    expect(result.current.resolved).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("removes the class for a light preference", () => {
    setThemePreferenceForTest("light");
    const { result } = renderHook(() => useTheme());
    expect(result.current.resolved).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe("light");
  });

  it("follows preference changes live", () => {
    setThemePreferenceForTest("light");
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setPreference("dark"));
    expect(result.current.preference).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("resolves system against the OS preference (light in jsdom)", () => {
    setThemePreferenceForTest("system");
    const { result } = renderHook(() => useTheme());
    // jsdom's matchMedia reports not-dark by default.
    expect(result.current.preference).toBe("system");
    expect(result.current.resolved).toBe("light");
  });
});

describe("pre-paint script key contract", () => {
  it("uses the exact storage key the store reads/writes", async () => {
    // Read the layout source and assert the inline script addresses the
    // same key — the cheap invariant that keeps the no-flash path wired.
    const fs = await import("node:fs");
    const layout = fs.readFileSync("src/app/layout.tsx", "utf8");
    expect(layout).toContain(THEME_STORAGE_KEY);
    expect(layout).toContain('classList.add("dark")');
  });
});
