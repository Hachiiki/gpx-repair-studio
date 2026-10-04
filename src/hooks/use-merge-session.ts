/**
 * useMergeSession — the Merge section's session hook (Task 43).
 *
 * Two responsibilities, mirroring `use-recovery-session`'s split:
 *
 *   1. `addMergeFiles` — the standalone file-intake entry point the
 *      landing's merge tool page calls (the intake component): parse +
 *      validate each file LOCALLY, one store entry per file, typed
 *      failures kept per file (one bad file never blocks the others —
 *      the user removes it and carries on).
 *
 *   2. `useMergeSession()` — the studio's derived view: the ordered
 *      parsed files are merged (pure `mergeGpxFiles`) and re-validated
 *      on every change, so the model the map, the statistics, and the
 *      export consume is ALWAYS the current arrangement — reorder a
 *      file or rename the activity and everything downstream follows.
 *      Nothing merged is ever stored (derived-not-stored discipline).
 *
 * The export is the identity exporter over the merged model: every
 * recorded point re-emits from its verbatim capture (§H invariant —
 * merging never rewrites a recorded value).
 *
 * Task 43 — Merge tool. Client-side hook (browser APIs: File#text,
 * DOMParser via the XmlIo adapter).
 */

"use client";

import { useCallback, useMemo } from "react";
import { DEFAULT_GAP_THRESHOLDS } from "@/features/gpx/detectGaps";
import { exportGpxIdentity } from "@/features/gpx/exportGpx";
import { validateGpx } from "@/features/gpx/validate";
import {
  fileSummary,
  mergeGpxFiles,
  type FileSummary,
} from "@/features/gpx/mergeFiles";
import {
  isUsableStatsPoint,
  originalDistanceStats,
  type DistanceStats,
} from "@/features/statistics/distance";
import { originalTimeStats, type TimeStats } from "@/features/statistics/time";
import { reimportStats, type ReimportStats } from "@/features/statistics/reimport";
import { bboxOf, type BBox } from "@/lib/geo/bbox";
import { runParsePipeline } from "@/lib/gpx/parse-client";
import { downloadTextFile } from "@/lib/utils/download";
import { createDomXmlIo } from "@/lib/utils/xml";
import { describeParseError } from "@/hooks/use-gpx-session";
import { translateNow } from "@/i18n/runtime";
import {
  parsedMergeFiles,
  useMergeStore,
  type MergeFileEntry,
  type MergePhase,
} from "@/state/merge-store";
import { useUiStore } from "@/state/ui-store";
import type { OriginalTrackData, ValidationIssue } from "@/types/domain";

// App-layer facade re-exports: the merge section's components type
// their props against this module (the boundary rule every section's
// session hook follows).
export type { FileSummary } from "@/features/gpx/mergeFiles";
export type { MergeFileEntry, MergePhase } from "@/state/merge-store";

// ---------------------------------------------------------------------------
// File intake (the landing's merge tool page entry point)
// ---------------------------------------------------------------------------

/**
 * Read + parse + validate the given files into the merge store, one
 * entry per file. Sequential on purpose: entries land in selection
 * order and a huge file's parse cannot starve the others' status
 * updates. Failures are per-file (`setFileError`), never fatal.
 */
export async function addMergeFiles(files: readonly File[]): Promise<void> {
  const store = useMergeStore.getState();
  const ids = store.beginFiles(files.map((file) => file.name));

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const id = ids[i];
    const live = useMergeStore.getState();

    if (file.size === 0) {
      live.setFileError(id, {
        title: translateNow("hook.parse.emptyTitle"),
        detail: translateNow("hook.parse.emptyDetailTrack", {
          fileName: file.name,
        }),
      });
      continue;
    }

    try {
      // Phase 14 — bytes, not text: the pipeline sniffs GPX/TCX/FIT.
      const bytes = await file.arrayBuffer();
      // Yield once so the parsing state paints before the parse of large
      // files (same contract as the other intakes; the Phase 9 worker
      // then runs the pipeline off-thread — merge needs no gap
      // detection, so the worker skips it).
      await new Promise((resolve) => setTimeout(resolve, 0));

      const result = await runParsePipeline(
        { bytes, fileName: file.name },
        {
          // Thresholds are unused here (merge never detects gaps) — the
          // canonical defaults keep the request contract complete.
          gapThresholds: DEFAULT_GAP_THRESHOLDS,
          detectGaps: false,
        },
      );
      if (!result.ok) {
        live.setFileError(id, describeParseError(result.error, file.name));
        continue;
      }
      live.setParsed(id, {
        model: result.data,
        summary: fileSummary(file.name, result.data),
        distanceM: originalDistanceStats(result.data).totalDistanceM,
      });
    } catch (err) {
      live.setFileError(id, {
        title: translateNow("hook.parse.readTitle"),
        detail: translateNow("hook.parse.readDetail", {
          fileName: file.name,
          reason: err instanceof Error ? err.message : String(err),
        }),
      });
    }
  }
}

// ---------------------------------------------------------------------------
// The derived merge (the studio's single source of truth)
// ---------------------------------------------------------------------------

/** The merged result, derived from the store's current arrangement. */
export interface MergedView {
  /** The validated merged model — what the map, stats, and export use. */
  model: OriginalTrackData;
  /** The merged model's own validation findings (fresh eyes on the join). */
  issues: readonly ValidationIssue[];
  /** Per-source summaries, in merge order. */
  sources: readonly FileSummary[];
  distanceStats: DistanceStats;
  timeStats: TimeStats;
  reimport: ReimportStats;
  /** Extent of usable merged points (Null-Island damage excluded). */
  extent: BBox | null;
  totalPoints: number;
  waypointCount: number;
  routeCount: number;
}

/** Everything the merge section's UI needs. */
export interface MergeSession {
  phase: MergePhase;
  /** All collected files, in merge order (any status). */
  files: readonly MergeFileEntry[];
  /** Files that pass the tool's contract so far. */
  parsedCount: number;
  combinedName: string;
  /** The derived merge; `null` while fewer than one file is parsed. */
  merged: MergedView | null;

  addFiles: (files: readonly File[]) => Promise<void>;
  removeFile: (id: string) => void;
  moveFile: (id: string, direction: -1 | 1) => void;
  sortByStartTime: () => void;
  setCombinedName: (name: string) => void;
  combine: () => void;
  backToIntake: () => void;
  reset: () => void;

  /** Serialize the merged file (identity export); `null` with no merge. */
  exportXml: () => string | null;
  /** Serialize + download; returns the file name handed to the browser. */
  download: () => string | null;
}

/** A download-safe file name from the combined activity name. */
export function mergedFileName(combinedName: string): string {
  const cleaned = combinedName
    .trim()
    // Characters every common filesystem forbids or chokes on.
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 60)
    .trim();
  return `${cleaned || "merged-route"}.gpx`;
}

export function useMergeSession(): MergeSession {
  const phase = useMergeStore((s) => s.phase);
  const files = useMergeStore((s) => s.files);
  const combinedName = useMergeStore((s) => s.combinedName);
  const timeGapMs = useUiStore((s) => s.gapThresholds.timeGapMs);

  // The derived merge: pure function of (ordered parsed files, name).
  // `files` is a fresh array on every store change — identity deps are
  // honest here.
  const merged = useMemo<MergedView | null>(() => {
    const parsed = parsedMergeFiles({ files });
    if (parsed.length === 0) return null;
    const outcome = mergeGpxFiles(
      parsed.map((file) => ({ fileName: file.fileName, model: file.model! })),
      { ...(combinedName.trim() ? { name: combinedName.trim() } : {}) },
    );
    const validated = validateGpx(outcome.model);
    const distanceStats = originalDistanceStats(validated.data);
    const timeStats = originalTimeStats(validated.data, timeGapMs);

    // The merged extent — the same usable-point definition the repair
    // session's extent uses (isUsableStatsPoint, the shared predicate).
    const usable: { lat: number; lon: number }[] = [];
    let totalPoints = 0;
    for (const segment of validated.data.segments) {
      totalPoints += segment.points.length;
      for (const point of segment.points) {
        if (isUsableStatsPoint(point)) usable.push(point);
      }
    }
    const extent = bboxOf(usable);

    return {
      model: validated.data,
      issues: validated.issues,
      sources: outcome.sources,
      distanceStats,
      timeStats,
      reimport: reimportStats(validated.data),
      extent,
      totalPoints,
      waypointCount: validated.data.waypoints.length,
      routeCount: validated.data.routes.length,
    };
  }, [files, combinedName, timeGapMs]);

  const addFiles = useCallback(
    (incoming: readonly File[]) => addMergeFiles(incoming),
    [],
  );

  // Store intents: stable wrappers over the plain store (usable from
  // events and tests alike).
  const removeFile = useCallback(
    (id: string) => useMergeStore.getState().removeFile(id),
    [],
  );
  const moveFile = useCallback(
    (id: string, direction: -1 | 1) =>
      useMergeStore.getState().moveFile(id, direction),
    [],
  );
  const sortByStartTime = useCallback(
    () => useMergeStore.getState().sortByStartTime(),
    [],
  );
  const setCombinedName = useCallback(
    (name: string) => useMergeStore.getState().setCombinedName(name),
    [],
  );
  const combine = useCallback(() => {
    useMergeStore.getState().combine();
  }, []);
  const backToIntake = useCallback(() => {
    useMergeStore.getState().backToIntake();
  }, []);
  const reset = useCallback(() => useMergeStore.getState().reset(), []);

  const exportXml = useCallback((): string | null => {
    // The CURRENT derived merge — serialize exactly what the studio
    // shows (WYSIWYG; a stale arrangement can never download).
    const parsed = parsedMergeFiles(useMergeStore.getState());
    if (parsed.length === 0) return null;
    const currentName = useMergeStore.getState().combinedName.trim();
    const outcome = mergeGpxFiles(
      parsed.map((file) => ({ fileName: file.fileName, model: file.model! })),
      { ...(currentName ? { name: currentName } : {}) },
    );
    return exportGpxIdentity(outcome.model, createDomXmlIo());
  }, []);

  const download = useCallback((): string | null => {
    const xml = exportXml();
    if (xml === null) return null;
    const name = mergedFileName(useMergeStore.getState().combinedName);
    downloadTextFile(name, xml);
    return name;
  }, [exportXml]);

  return {
    phase,
    files,
    parsedCount: parsedMergeFiles({ files }).length,
    combinedName,
    merged,
    addFiles,
    removeFile,
    moveFile,
    sortByStartTime,
    setCombinedName,
    combine,
    backToIntake,
    reset,
    exportXml,
    download,
  };
}
