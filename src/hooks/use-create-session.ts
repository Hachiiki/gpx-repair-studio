/**
 * useCreateSession — the "create from activity stats" section's app-layer
 * facade + session hook.
 *
 * Two jobs (both mirroring the recovery section's hook conventions):
 *   - re-export the create domain's types and pure helpers so presentation
 *     components can type/validate their props without importing feature
 *     internals (the ESLint boundary — the same facade pattern
 *     use-recovery-draw applies to GapTimePlan/PaceRow);
 *   - expose the section's phase + statistics + top-level intents for the
 *     shell and the studio (thin store selectors, no logic).
 *
 * "Create from activity stats" section. Client-side hook.
 */

"use client";

import { useCallback } from "react";
import {
  checkStatsConsistency,
  validateStatsEntry,
  type ActivityStats,
  type ConsistencyNotice,
  type StatsEntryFields,
  type StatsFieldErrors,
} from "@/features/create/stats";
import { useCreateStore, type CreatePhase } from "@/state/create-store";

// App-layer facade re-exports (components import from here, never the
// feature module directly).
export type {
  ActivityStats,
  ConsistencyNotice,
  StatsEntryFields,
  StatsFieldErrors,
} from "@/features/create/stats";
export { validateStatsEntry, checkStatsConsistency } from "@/features/create/stats";
export type { CreatePhase } from "@/state/create-store";
export { impliedPaceMsPerUnit } from "@/features/create/stats";
// The reconciliation vocabulary (track.ts) — surfaced here so the review
// card, the draw panel, and the finish dialog stay off feature internals.
export { RECONCILE_NOTICE_RATIO } from "@/features/create/track";
export type { Reconciliation } from "@/features/create/track";

/** Everything the shell, the landing form, and the studio need at the top. */
export interface CreateSession {
  phase: CreatePhase;
  stats: ActivityStats | null;
  /** Confirm the statistics and enter the drawing phase. */
  beginDrawing: (stats: ActivityStats) => void;
  /** Return to the statistics form (stats and route are kept). */
  backToForm: () => void;
  /** Full reset — new activity, empty form. */
  reset: () => void;
}

export function useCreateSession(): CreateSession {
  const phase = useCreateStore((s) => s.phase);
  const stats = useCreateStore((s) => s.stats);

  const beginDrawing = useCallback(
    (next: ActivityStats) => useCreateStore.getState().beginDrawing(next),
    [],
  );
  const backToForm = useCallback(
    () => useCreateStore.getState().backToForm(),
    [],
  );
  const reset = useCallback(() => useCreateStore.getState().reset(), []);

  return { phase, stats, beginDrawing, backToForm, reset };
}
