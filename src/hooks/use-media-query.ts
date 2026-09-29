/**
 * useMediaQuery — the responsive split behind layout decisions that
 * cannot be expressed in CSS alone (Phase 8's mobile tools sheet vs
 * the desktop sticky column render DIFFERENT trees, so a single
 * `hidden lg:block` pair would duplicate testids and screen-reader
 * content).
 *
 * Defensive by design: environments without `matchMedia` (jsdom
 * without a mock, SSR) get the `fallback` — callers pass the
 * layout that matches the prerendered HTML, so there is never a
 * hydration mismatch, only a post-hydration correction on real
 * viewports.
 */

import { useEffect, useState } from "react";

export function useMediaQuery(query: string, fallback: boolean): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === "undefined") return fallback;
    if (typeof window.matchMedia !== "function") return fallback;
    try {
      return window.matchMedia(query).matches;
    } catch {
      return fallback;
    }
  });

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    let mql: MediaQueryList;
    try {
      mql = window.matchMedia(query);
    } catch {
      return;
    }
    const onChange = () => setMatches(mql.matches);
    // The query may have resolved differently since mount (or the
    // fallback covered a jsdom gap) — reconcile once, then track.
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
