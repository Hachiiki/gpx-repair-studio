/**
 * useDeepValidation — the deep-check / working-copy orchestration hook
 * (docs/MASTER_PLAN.md §EE 13.1–13.5, Phase 13).
 *
 * Owns the runtime loop of the working copy:
 *   edits (working-store) → applyWorkingEdits → deepValidate → report
 * and exposes the planning intents (`planFix`, `planPreset` — pure, the
 * preview dialog renders their output before anything is applied) plus
 * the apply/undo intents that write the log. The session hook owns the
 * working VIEW itself (`session.workingData`) so the map, the share
 * card, the statistics, and the export all render the same copy; this
 * hook owns what the report card shows and what the log holds.
 *
 * Composition root pattern: AppShell wires `(session)` in; nothing here
 * touches components or the map. The detectors and the layer are pure —
 * this hook only reads stores and calls the domain.
 *
 * Phase 13 — Deep validation & repair presets. Client-side hook.
 */

"use client";

import { useCallback, useEffect, useMemo } from "react";
import {
  DEFAULT_DEEP_OPTIONS,
  deepValidate,
  fixKindsForIssue,
  type DeepValidateOptions,
} from "@/features/validation/deepValidate";
import {
  editFromPlan,
  planFix,
  planPreset,
  PRESETS,
  type FixExtras,
} from "@/features/validation/fixes";
import { workingMetaOf } from "@/features/validation/workingCopy";
import { announce } from "@/lib/announcements";
import { nextEditId, useWorkingStore } from "@/state/working-store";
import type {
  DeepIssueKind,
  DeepReport,
  FixKind,
  FixPlan,
  PresetId,
  WorkingEdit,
  WorkingMeta,
} from "@/types/domain";
import type { GpxSession } from "@/hooks/use-gpx-session";

// App-layer facade: components may not import feature internals (ESLint
// boundary, §F), so the deep-check vocabulary they need flows through
// this module.
export type {
  DeepValidateOptions,
} from "@/features/validation/deepValidate";
export type { FixExtras, PresetDescriptor } from "@/features/validation/fixes";

/** The binding the report card and the preview dialog render. */
export interface DeepValidationBinding {
  /** Session-scoped thresholds (merged over the shipped defaults). */
  options: Required<DeepValidateOptions>;
  /** Patch the thresholds (pure re-derivation trigger). */
  setOptions: (patch: Partial<DeepValidateOptions>) => void;
  /** The confirmed-fix log, oldest first. */
  edits: readonly WorkingEdit[];
  /** The deep report over the working copy (empty when no file). */
  report: DeepReport;
  /** What the working layer changed (labels for stats + summary). */
  working: WorkingMeta;
  /** Which fixes a deep issue kind offers. */
  fixesForIssue: (kind: DeepIssueKind) => readonly FixKind[];
  /** Plan one fix against the current report (null = nothing to do). */
  planFix: (kind: FixKind, extras?: FixExtras) => FixPlan | null;
  /** Plan a preset chain (null = the whole chain is a no-op). */
  planPreset: (id: PresetId, extras?: FixExtras) => FixPlan[] | null;
  /** The shipped preset descriptors (name/description for the chips). */
  presets: typeof PRESETS;
  /** Apply confirmed plan(s) — one log edit per plan (one undo step each). */
  applyPlans: (plans: readonly FixPlan[]) => void;
  /** Undo the most recent edit. No-op (announced) when the log is empty. */
  undo: () => void;
}

export function useDeepValidation(session: GpxSession): DeepValidationBinding {
  const edits = useWorkingStore((s) => s.edits);
  const rawOptions = useWorkingStore((s) => s.options);
  const applyEdit = useWorkingStore((s) => s.applyEdit);
  const undoEdit = useWorkingStore((s) => s.undo);
  const setStoreOptions = useWorkingStore((s) => s.setOptions);

  // Edits belong to the file they were made on — a new file (or reset)
  // wipes the log, exactly like the editor store's repair state.
  useEffect(() => {
    if (session.status !== "parsed") {
      useWorkingStore.getState().reset();
    }
  }, [session.status]);

  const options = useMemo<Required<DeepValidateOptions>>(
    () => ({ ...DEFAULT_DEEP_OPTIONS, ...rawOptions }),
    [rawOptions],
  );

  // The report runs over the WORKING copy — fixed issues disappear.
  const workingData = session.workingData;
  const report = useMemo(
    () =>
      workingData
        ? deepValidate(workingData, options)
        : { issues: [], totalCount: 0 },
    [workingData, options],
  );

  const working = useMemo<WorkingMeta>(
    () =>
      session.status === "parsed" && session.data
        ? workingMetaOf(edits)
        : {
            deletedPointCount: 0,
            sortedSegmentIds: [],
            overriddenEleCount: 0,
            splitCount: 0,
            duplicatedSegmentCount: 0,
            reorderedSegmentCount: 0,
            hasEdits: false,
          },
    [edits, session.status, session.data],
  );

  const setOptions = useCallback(
    (patch: Partial<DeepValidateOptions>) => setStoreOptions(patch),
    [setStoreOptions],
  );

  const planFixIntent = useCallback(
    (kind: FixKind, extras: FixExtras = {}): FixPlan | null =>
      workingData ? planFix(workingData, report, kind, options, extras) : null,
    [workingData, report, options],
  );

  const planPresetIntent = useCallback(
    (id: PresetId, extras: FixExtras = {}): FixPlan[] | null =>
      workingData ? planPreset(workingData, report, id, options, extras) : null,
    [workingData, report, options],
  );

  const applyPlans = useCallback(
    (plans: readonly FixPlan[]) => {
      if (plans.length === 0) return;
      const appliedAt = Date.now();
      for (const plan of plans) {
        applyEdit(editFromPlan(plan, nextEditId(), appliedAt));
      }
      // Phase 8 pattern — the aria-live region speaks the outcome.
      const label =
        plans.length === 1
          ? plans[0].label
          : `${plans.length} fixes (${plans.map((p) => p.label).join("; ")})`;
      announce(`Fix applied — ${label}. The report re-checks the working copy.`);
    },
    [applyEdit],
  );

  const undo = useCallback(() => {
    const undone = undoEdit();
    if (undone) {
      announce(`Undone — ${undone.label}.`);
    }
  }, [undoEdit]);

  return {
    options,
    setOptions,
    edits,
    report,
    working,
    fixesForIssue: fixKindsForIssue,
    planFix: planFixIntent,
    planPreset: planPresetIntent,
    presets: PRESETS,
    applyPlans,
    undo,
  };
}
