/**
 * useToolTours (Phase 19 — §EE 19.3) — the per-tool guided
 * walkthroughs' controller.
 *
 * One state machine for every tool tour: closed (`active`/`step`
 * null) or showing one step of the active tour. Every exit path —
 * Finish, Skip, Esc — writes that tool's seen-flag, so each tour
 * greets a browser exactly once through the offer banner; the help
 * dialog's "walkthroughs" section replays any of them anytime (the
 * Phase 11 tour's discipline, applied per tool).
 *
 * The OFFER is a banner, never a modal: entering a tool whose tour
 * this browser has not seen shows the dismissible "take the guided
 * tour" strip above the workspace. A dismiss writes the flag exactly
 * like finishing does — learning by declining is still learning.
 * Storage that cannot remember reads as "seen" (the nag rule), so a
 * private-mode visitor sees the offer at most once per load.
 *
 * The ACTION (a tour step that loads the Phase 12 teaching sample)
 * runs through the registered handler and advances the tour — the
 * next step then describes what just appeared.
 *
 * Phase 19 — Compare, summaries & guided flows. Client-side hook.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  hasSeenToolTour,
  writeToolTourSeen,
  type ToolTourId,
} from "@/lib/storage/tour-flag";

/**
 * The step count per tour — pinned by tests against the component's
 * content (the onboarding tour's shape: the count lives with the
 * controller, the copy with the component).
 */
export const TOOL_TOUR_STEPS: Record<ToolTourId, number> = {
  repair: 4,
  share: 3,
  recovery: 4,
  create: 4,
  merge: 4,
  plan: 4,
  batch: 4,
};

export interface ToolToursController {
  /** The tour showing (null while closed). */
  active: ToolTourId | null;
  /** The 0-based step showing, or null while closed. */
  step: number | null;
  /** Open a tour (the help dialog's replay, or the offer banner). */
  start: (id: ToolTourId) => void;
  /** Advance; on the tour's last step, finish (close + remember). */
  next: () => void;
  back: () => void;
  /** Close from anywhere — Skip, Esc, the X. Always remembers. */
  close: () => void;
  /** Run the current step's action (the teaching sample), then advance. */
  runAction: () => void;
  /** The dismissible offer's tool (the banner shows while non-null). */
  offer: ToolTourId | null;
  /** Dismiss the offer banner — remembers, exactly like finishing. */
  dismissOffer: () => void;
}

export interface UseToolToursOptions {
  /** Whether the active tour's action can run (a sample can load). */
  canRunAction: (id: ToolTourId) => boolean;
  /** The action itself — loads the tool's teaching payload. */
  onAction: (id: ToolTourId) => void;
  /** The tool whose page/workspace is showing (drives the offer). */
  activeTool: ToolTourId | null;
}

export function useToolTours(
  options: UseToolToursOptions,
): ToolToursController {
  const [active, setActive] = useState<ToolTourId | null>(null);
  const [step, setStep] = useState<number | null>(null);
  const [offer, setOffer] = useState<ToolTourId | null>(null);
  /** Tools the user explicitly dismissed this load (no re-offer). */
  const dismissed = useRef<Set<ToolTourId>>(new Set());
  /** The handler runs from a ref so a stable controller never goes stale
   * (kept current in an effect — the compiler-sanctioned channel). */
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  const start = useCallback((id: ToolTourId) => {
    dismissed.current.delete(id);
    setOffer(null);
    setActive(id);
    setStep(0);
  }, []);

  const close = useCallback(() => {
    if (active !== null) writeToolTourSeen(active);
    setActive(null);
    setStep(null);
  }, [active]);

  const next = useCallback(() => {
    if (step === null || active === null) return;
    if (step >= TOOL_TOUR_STEPS[active] - 1) {
      writeToolTourSeen(active);
      setActive(null);
      setStep(null);
      return;
    }
    setStep(step + 1);
  }, [active, step]);

  const back = useCallback(() => {
    setStep((current) =>
      current === null ? null : Math.max(0, current - 1),
    );
  }, []);

  const runAction = useCallback(() => {
    if (active === null || step === null) return;
    optionsRef.current.onAction(active);
    next();
  }, [active, step, next]);

  const dismissOffer = useCallback(() => {
    if (offer !== null) {
      writeToolTourSeen(offer);
      dismissed.current.add(offer);
    }
    setOffer(null);
  }, [offer]);

  // The offer follows the active tool: show for an unseen tour, clear
  // when the tool changes or the flag says seen. The storage read is
  // the external system this effect synchronizes with — the setState
  // rides a microtask (the codebase's async-callback pattern for
  // react-hooks/set-state-in-effect).
  const activeTool = options.activeTool;
  useEffect(() => {
    if (activeTool === null) {
      void Promise.resolve().then(() => setOffer(null));
      return;
    }
    const shouldOffer =
      !hasSeenToolTour(activeTool) && !dismissed.current.has(activeTool);
    void Promise.resolve().then(() => setOffer(shouldOffer ? activeTool : null));
  }, [activeTool]);

  return {
    active,
    step,
    start,
    next,
    back,
    close,
    runAction,
    offer,
    dismissOffer,
  };
}
