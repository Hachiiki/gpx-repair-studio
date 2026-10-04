/**
 * useBatchSession (Phase 18 — docs/MASTER_PLAN.md §EE 18.1/18.2) — the
 * Batch section's orchestration hook: the parse queue pump, the derived
 * per-file views, the aggregate stats, the preset planning/apply flow,
 * and the ZIP export.
 *
 * Composition (the merge section's discipline):
 *   - the STORE (state/batch-store.ts) holds the queue and its state
 *     machine; this hook owns WHEN: it pumps queued files through the
 *     real parse pipeline ONE AT A TIME (the Phase 9 worker handles one
 *     request at a time; a queue that parses in parallel would only
 *     reorder failures), and derives everything else;
 *   - per-file views are the SAME derivations the repair studio runs —
 *     `applyWorkingEdits` for the working copy, `deepValidate` for the
 *     report — so a batch fix and a manual fix describe the same file
 *     with the same words;
 *   - the batch uses the SHIPPED deep-check defaults (no per-file
 *     threshold UI in the queue — a recorded scope decision: the
 *     repair studio stays the place to tune an individual file);
 *   - the preset flow keeps the preview→confirm ritual: `planBatchPreset`
 *     is pure (nothing moves until the user confirms), and apply is one
 *     store call per file.
 *
 * Phase 18 — Batch & portable sessions. Client-side hook.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { zipSync } from "fflate";
import {
  DEFAULT_DEEP_OPTIONS,
  deepValidate,
  type DeepValidateOptions,
} from "@/features/validation/deepValidate";
import {
  editFromPlan,
  planPreset,
  PRESETS,
  type PresetDescriptor,
} from "@/features/validation/fixes";
import { applyWorkingEdits } from "@/features/validation/workingCopy";
import {
  buildBatchZipEntries,
  type BatchExportItem,
} from "@/features/batch/batchZip";
import { originalDistanceStats } from "@/features/statistics/distance";
import { runParsePipeline } from "@/lib/gpx/parse-client";
import { createDomXmlIo } from "@/lib/utils/xml";
import { downloadBlobFile } from "@/lib/utils/download";
import { announce } from "@/lib/announcements";
import { describeParseError } from "@/hooks/use-gpx-session";
import { nextEditId } from "@/state/working-store";
import { useBatchStore, type BatchItem } from "@/state/batch-store";
import { useUiStore } from "@/state/ui-store";
import type { ExportMode } from "@/features/gpx/exportGpx";
import type {
  DeepReport,
  FixPlan,
  PresetId,
  WorkingTrackData,
} from "@/types/domain";

// App-layer facade (§F): components may not import feature internals,
// so the export vocabulary the batch cards need flows through here —
// the same re-export use-gpx-export provides its cards.
export type { ExportMode } from "@/features/gpx/exportGpx";

/** The batch's deep-check options: the shipped defaults, always. */
export const BATCH_DEEP_OPTIONS: Required<DeepValidateOptions> = {
  ...DEFAULT_DEEP_OPTIONS,
};

/** One queue row's derived view (the statuses the UI renders). */
export interface BatchItemView {
  item: BatchItem;
  /** The working copy (identity-stable while no edits exist). */
  working: WorkingTrackData | null;
  /** The deep report over the working copy (parsed files only). */
  report: DeepReport | null;
  /** The plan's status word: queued/reading/failed/fixed/issues/clean/exported-marks. */
  statusWord:
    | "queued"
    | "reading"
    | "failed"
    | "fixed"
    | "issues-found"
    | "clean";
}

/** The queue's aggregate line (§EE 18.1 "aggregate stats"). */
export interface BatchAggregate {
  total: number;
  parsed: number;
  failed: number;
  fixed: number;
  issuesFound: number;
  clean: number;
  exported: number;
  /** Σ recorded points over the parsed ORIGINALS. */
  recordedPoints: number;
  /** Σ recorded distance over the parsed originals, meters. */
  recordedDistanceM: number;
  /** Σ points removed by applied edits. */
  deletedPoints: number;
}

/** One file's slice of a batch preset preview. */
export interface BatchPresetFilePlan {
  itemId: string;
  fileName: string;
  /** The chain's plans against the current working copy (null = no-op). */
  plans: FixPlan[] | null;
}

/** The binding the batch studio renders. */
export interface BatchSessionBinding {
  phase: "intake" | "studio";
  items: readonly BatchItem[];
  views: readonly BatchItemView[];
  aggregate: BatchAggregate;
  /** Enqueue files (the cap-refusal split rides back for the intake's sentence). */
  addFiles: (
    files: readonly File[],
  ) => { accepted: { id: string; file: File }[]; refused: File[] };
  /** Preset chips (the Phase 13 vocabulary, one source). */
  presets: readonly PresetDescriptor[];
  /** Plan one preset across every parsed file (pure — nothing applied). */
  planBatchPreset: (id: PresetId) => BatchPresetFilePlan[];
  /** Apply a confirmed per-file plan list (one store call per file). */
  applyBatchPlans: (
    id: PresetId,
    perFile: readonly BatchPresetFilePlan[],
  ) => void;
  /** Undo one file's most recent fix (announced, like the repair log). */
  undoFileEdit: (itemId: string) => void;
  /** Remove one file from the queue. */
  removeItem: (itemId: string) => void;
  /** Drop the whole queue and return to the landing. */
  reset: () => void;
  /** The persisted export settings the ZIP honors. */
  exportMode: ExportMode;
  prettyPrint: boolean;
  setExportMode: (mode: ExportMode) => void;
  setPrettyPrint: (pretty: boolean) => void;
  /** Build + download the ZIP (returns the file name, or null). */
  downloadZip: () => string | null;
  /** Enter the studio (needs ≥ 1 parsed file; announced when refused). */
  enterStudio: () => void;
}

export function useBatchSession(): BatchSessionBinding {
  const phase = useBatchStore((s) => s.phase);
  const items = useBatchStore((s) => s.items);
  const exportMode = useUiStore((s) => s.exportMode);
  const prettyPrint = useUiStore((s) => s.exportPrettyPrint);
  const setExportMode = useUiStore((s) => s.setExportMode);
  const setPrettyPrint = useUiStore((s) => s.setExportPrettyPrint);

  // ---- the parse pump: one file at a time, in queue order ---------------

  /** Guards double-pumps across Strict Mode's double effects. */
  const pumpingRef = useRef(false);

  useEffect(() => {
    if (pumpingRef.current) return;
    const next = items.find((item) => item.status === "queued");
    if (!next) return;
    pumpingRef.current = true;
    void (async () => {
      const store = useBatchStore.getState();
      store.beginParse(next.id);
      try {
        const bytes = await next.source.arrayBuffer();
        const result = await runParsePipeline(
          { bytes, fileName: next.fileName },
          { gapThresholds: useUiStore.getState().gapThresholds },
        );
        if (result.ok) {
          useBatchStore.getState().setParsed(next.id, {
            data: result.data,
            gaps: result.gaps,
            issues: result.issues,
          });
        } else {
          useBatchStore
            .getState()
            .setFailed(
              next.id,
              describeParseError(result.error, next.fileName),
            );
        }
      } catch (err) {
        useBatchStore.getState().setFailed(next.id, {
          title: "Could not read file",
          detail:
            `"${next.fileName}" could not be read: ` +
            `${err instanceof Error ? err.message : String(err)}`,
        });
      } finally {
        pumpingRef.current = false;
        // The setParsed/setFailed above changed `items`, which re-runs
        // this effect and picks up the next queued file (if any).
      }
    })();
  }, [items]);

  // ---- derived per-file views --------------------------------------------

  const views = useMemo<readonly BatchItemView[]>(() => {
    return items.map((item) => {
      if (item.status !== "parsed" || item.data === null) {
        const word =
          item.status === "queued"
            ? "queued"
            : item.status === "parsing"
              ? "reading"
              : "failed";
        return {
          item,
          working: null,
          report: null,
          statusWord: word,
        };
      }
      const working = applyWorkingEdits(item.data, item.edits);
      const report = deepValidate(working, BATCH_DEEP_OPTIONS);
      const statusWord: BatchItemView["statusWord"] =
        item.edits.length > 0
          ? "fixed"
          : report.totalCount > 0 || item.issues.length > 0
            ? "issues-found"
            : "clean";
      return { item, working, report, statusWord };
    });
  }, [items]);

  const aggregate = useMemo<BatchAggregate>(() => {
    let parsed = 0;
    let failed = 0;
    let fixed = 0;
    let issuesFound = 0;
    let clean = 0;
    let exported = 0;
    let recordedPoints = 0;
    let recordedDistanceM = 0;
    let deletedPoints = 0;
    for (const view of views) {
      if (view.item.status === "failed") failed++;
      if (view.item.status !== "parsed") continue;
      parsed++;
      if (view.item.exported) exported++;
      if (view.statusWord === "fixed") fixed++;
      else if (view.statusWord === "issues-found") issuesFound++;
      else clean++;
      if (view.item.data) {
        let points = 0;
        for (const segment of view.item.data.segments) {
          points += segment.points.length;
        }
        recordedPoints += points;
        recordedDistanceM += originalDistanceStats(view.item.data)
          .totalDistanceM;
        deletedPoints += view.working?.working?.deletedPointCount ?? 0;
      }
    }
    return {
      total: items.length,
      parsed,
      failed,
      fixed,
      issuesFound,
      clean,
      exported,
      recordedPoints,
      recordedDistanceM,
      deletedPoints,
    };
  }, [views, items.length]);

  // ---- the preset flow (pure planning, confirmed apply) ------------------

  const planBatchPreset = useCallback(
    (id: PresetId): BatchPresetFilePlan[] => {
      const plans: BatchPresetFilePlan[] = [];
      for (const view of views) {
        if (view.item.status !== "parsed" || !view.working || !view.report) {
          continue;
        }
        plans.push({
          itemId: view.item.id,
          fileName: view.item.fileName,
          plans: planPreset(
            view.working,
            view.report,
            id,
            BATCH_DEEP_OPTIONS,
          ),
        });
      }
      return plans;
    },
    [views],
  );

  const applyBatchPlans = useCallback(
    (id: PresetId, perFile: readonly BatchPresetFilePlan[]) => {
      const preset = PRESETS.find((p) => p.id === id);
      if (!preset) return;
      const appliedAt = Date.now();
      let appliedFiles = 0;
      let appliedFixes = 0;
      for (const file of perFile) {
        if (!file.plans || file.plans.length === 0) continue;
        const edits = file.plans.map((plan) =>
          editFromPlan(plan, nextEditId(), appliedAt),
        );
        useBatchStore
          .getState()
          .applyEdits(file.itemId, edits, preset.name);
        appliedFiles++;
        appliedFixes += edits.length;
      }
      if (appliedFiles === 0) {
        announce("Nothing to apply — every file was already clean for this preset.");
        return;
      }
      announce(
        `${preset.name} applied to ${appliedFiles} file${appliedFiles === 1 ? "" : "s"} — ${appliedFixes} fix${appliedFixes === 1 ? "" : "es"} in total.`,
      );
    },
    [],
  );

  const undoFileEdit = useCallback((itemId: string) => {
    const undone = useBatchStore.getState().undoLastEdit(itemId);
    if (undone) announce("Undone — the file's most recent fix is reverted.");
  }, []);

  const removeItem = useCallback((itemId: string) => {
    useBatchStore.getState().removeItem(itemId);
  }, []);

  const addFiles = useCallback(
    (files: readonly File[]) => useBatchStore.getState().enqueue(files),
    [],
  );

  const reset = useCallback(() => {
    useBatchStore.getState().reset();
  }, []);

  const enterStudio = useCallback(() => {
    const entered = useBatchStore.getState().enterStudio();
    if (!entered) {
      announce("Nothing to work on yet — add at least one file that parses.");
    }
  }, []);

  // ---- the ZIP export ------------------------------------------------------

  const downloadZip = useCallback((): string | null => {
    const parsed = items.filter((item) => item.status === "parsed" && item.data);
    if (parsed.length === 0) return null;
    const exportItems: BatchExportItem[] = parsed.map((item) => ({
      fileName: item.fileName,
      data: item.data!,
      edits: item.edits,
      ...(item.presetName !== null ? { presetName: item.presetName } : {}),
    }));
    const { entries } = buildBatchZipEntries(
      exportItems,
      { mode: exportMode, prettyPrint },
      createDomXmlIo(),
    );
    // fflate's sync API — the queue is bounded (≤50), the entries are
    // already in memory, and a worker dance would only reorder failures.
    const zipped: Record<string, Uint8Array> = {};
    for (const entry of entries) zipped[entry.name] = entry.bytes;
    const bytes = zipSync(zipped, { level: 6 });
    const fileName = "gpx-repair-studio-batch.zip";
    downloadBlobFile(fileName, new Blob([bytes], { type: "application/zip" }));
    useBatchStore
      .getState()
      .markExported(parsed.map((item) => item.id));
    announce(
      `Export ready — ${fileName} downloaded (${parsed.length} repaired file${parsed.length === 1 ? "" : "s"} + the manifest).`,
    );
    return fileName;
  }, [items, exportMode, prettyPrint]);

  return {
    phase,
    items,
    views,
    aggregate,
    addFiles,
    presets: PRESETS,
    planBatchPreset,
    applyBatchPlans,
    undoFileEdit,
    removeItem,
    reset,
    exportMode,
    prettyPrint,
    setExportMode,
    setPrettyPrint,
    downloadZip,
    enterStudio,
  };
}
