/**
 * useOnboardingTour (Phase 11) — the first-run overlay's controller.
 *
 * State machine: closed (`step === null`) or showing one of the four
 * steps (0–3). Every exit path — Finish, Skip, Esc, and the implicit
 * dismissal below — writes the localStorage flag, so the tour greets
 * a browser exactly once (unless storage cannot remember, in which
 * case it never auto-opens at all; see lib/storage/tour-flag.ts).
 *
 * Auto-open rules (the "first-run" in the plan's "first-run: 4-step
 * overlay"), evaluated at most once per page load:
 *   - the landing's tool-cards page is showing (the only page the
 *     tour describes — `enabled`);
 *   - the Phase 10 storage scan has finished (`storageScanDone`) and
 *     found NO restorable work (`hasRestoreOffers` false) — someone
 *     with saved work is not new here, and the restore prompt has
 *     priority;
 *   - the flag reads "unseen".
 *
 * Implicit dismissal: a user who opens a tool while the AUTO-opened
 * tour is showing has learned by doing — the tour finishes silently
 * (flag written, no modal lingering over a workspace it does not
 * describe). Manually started tours (the "Take the tour" link) are
 * closed only by their own controls.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  readTourFlag,
  writeTourSeen,
} from "@/lib/storage/tour-flag";

/** The overlay's step count — pinned by tests; the copy lives in the component. */
export const ONBOARDING_TOUR_STEPS = 4;

export interface OnboardingTourController {
  /** The 0-based step showing, or null while closed. */
  step: number | null;
  /** Open the tour manually (the landing's "Take the tour" link). */
  start: () => void;
  /** Advance; on the last step, finish (which closes + remembers). */
  next: () => void;
  back: () => void;
  /** Close from anywhere — Skip, Esc, the X. Always remembers. */
  close: () => void;
}

export interface UseOnboardingTourOptions {
  /** The landing's tool-cards page is the page being shown right now. */
  enabled: boolean;
  /** The session-recovery scan finished (offers settled) — see header. */
  storageScanDone: boolean;
  /** Restorable work exists — a returning user, not a new one. */
  hasRestoreOffers: boolean;
}

export function useOnboardingTour(
  options: UseOnboardingTourOptions,
): OnboardingTourController {
  const [step, setStep] = useState<number | null>(null);
  /** The auto-open may fire at most once per page load. */
  const autoOpenArmed = useRef(true);
  /** True once the user opened this tour themselves (keep-open rule). */
  const manualOpen = useRef(false);

  const start = useCallback(() => {
    manualOpen.current = true;
    setStep(0);
  }, []);

  const close = useCallback(() => {
    setStep(null);
    writeTourSeen();
  }, []);

  const next = useCallback(() => {
    setStep((current) => {
      if (current === null) return null;
      if (current >= ONBOARDING_TOUR_STEPS - 1) {
        writeTourSeen();
        return null;
      }
      return current + 1;
    });
  }, []);

  const back = useCallback(() => {
    setStep((current) =>
      current === null ? null : Math.max(0, current - 1),
    );
  }, []);

  // First-run auto-open — exactly once, on the cards page, after the
  // storage scan, only for genuinely new visitors. The setStep rides a
  // microtask (the codebase's async-callback pattern for
  // react-hooks/set-state-in-effect: the flag read is the external
  // system this effect synchronizes with, not React state).
  useEffect(() => {
    if (!autoOpenArmed.current) return;
    if (!options.enabled || !options.storageScanDone) return;
    if (options.hasRestoreOffers) return;
    autoOpenArmed.current = false;
    if (readTourFlag() === "unseen") {
      void Promise.resolve().then(() => setStep(0));
    }
  }, [options.enabled, options.storageScanDone, options.hasRestoreOffers]);

  // Implicit dismissal of the AUTO-opened tour (see header). Runs after
  // the auto-open effect on the same commit, so a manual start can never
  // be dismissed by it (manualOpen guards), and a page that never showed
  // the cards (step null) is a no-op.
  useEffect(() => {
    if (step === null || manualOpen.current) return;
    if (!options.enabled) {
      writeTourSeen();
      void Promise.resolve().then(() => setStep(null));
    }
  }, [options.enabled, step]);

  return { step, start, next, back, close };
}
