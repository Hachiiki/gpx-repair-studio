/**
 * useGpxSession — the upload/inspection orchestration hook
 * (docs/MASTER_PLAN.md §D-2 data flow, Phase 2 scope).
 *
 * Owns the runtime pipeline for one file:
 *   File → text → runParsePipeline (inline or Phase 9 worker) → sessionStore
 * and exposes memoized *view models* (gap rows, segment rows, stats) so
 * components stay pure presentation (props in, intents out; no component
 * ever imports feature internals — ESLint boundary).
 *
 * Also wires the "settings re-run detection" rule: whenever the gap
 * thresholds change (uiStore) and a file is loaded, gaps are re-derived
 * from the unchanged original model — a pure recomputation, never a
 * mutation (§D-3.5).
 *
 * Phase 2 — Upload & Inspection UI. Client-side hook (browser APIs:
 * File#text, DOMParser via the XmlIo adapter).
 */

"use client";

import { useCallback, useEffect, useMemo } from "react";
import { detectGaps, type GapThresholds } from "@/features/gpx/detectGaps";
import {
  isUsableStatsPoint,
  originalDistanceStats,
  type DistanceStats,
} from "@/features/statistics/distance";
import { originalTimeStats, type TimeStats } from "@/features/statistics/time";
import { reimportStats, type ReimportStats } from "@/features/statistics/reimport";
import { applyWorkingEdits } from "@/features/validation/workingCopy";
import { runParsePipeline } from "@/lib/gpx/parse-client";
import {
  useSessionStore,
  type SessionError,
  type SessionStatus,
  type SessionView,
} from "@/state/session-store";
import { useUiStore } from "@/state/ui-store";
import { useWorkingStore } from "@/state/working-store";
import type {
  DetectedGap,
  GapId,
  GapKind,
  GapSeverity,
  GpxParseError,
  OriginalSegment,
  OriginalTrackData,
  OriginalTrackPoint,
  PointId,
  SegmentId,
  ValidationIssue,
  WorkingTrackData,
} from "@/types/domain";
import { parsePointIdRef } from "@/types/ids";
import { translateNow } from "@/i18n/runtime";
import { useI18n } from "@/hooks/use-i18n";
import type { TranslatorArg } from "@/hooks/use-i18n";
import type { BBox } from "@/lib/geo/bbox";
import { bboxOf } from "@/lib/geo/bbox";

// Domain result types re-exported as the app-layer facade: components may
// not import feature internals (ESLint boundary, §F), so everything they
// need to type session props flows through this module.
export type { GapThresholds } from "@/features/gpx/detectGaps";
export type {
  DistanceStats,
  ExcludedLegReason,
} from "@/features/statistics/distance";
export type { TimeStats } from "@/features/statistics/time";
export type { ReimportStats } from "@/features/statistics/reimport";

// ---------------------------------------------------------------------------
// View models (app-layer joins of domain data — components render these)
// ---------------------------------------------------------------------------

/** A resolved gap boundary point, ready for display. */
export interface GapBoundaryView {
  pointId: PointId;
  segmentId: SegmentId;
  lat: number;
  lon: number;
  time?: number;
}

/** One detected gap joined with its boundary points' coordinates/times. */
export interface GapRow {
  id: GapId;
  kind: GapKind;
  severity: GapSeverity;
  status: DetectedGap["status"];
  elapsedMs?: number;
  impliedDistanceM?: number;
  impliedSpeed?: number;
  before: GapBoundaryView;
  after: GapBoundaryView;
}

/** One segment joined with its display stats. */
export interface SegmentRow {
  segmentId: SegmentId;
  trackIndex: number;
  trackName: string;
  pointCount: number;
  flaggedPoints: number;
  distanceM: number;
  excludedLegs: number;
  firstTimeMs?: number;
  lastTimeMs?: number;
}

/** Everything the panels need about one inspection session. */
export interface GpxSession {
  status: SessionStatus;
  fileName: string | null;
  data: OriginalTrackData | null;
  /**
   * Phase 13 — the working copy: the original with every confirmed
   * deep-validation fix applied (deletions, sorts, elevation
   * overrides). The ORIGINAL object itself while the edit log is
   * empty (identity — effect keys stay quiet for pristine files).
   * Statistics, the map route, the share card, and the export render
   * THIS view; gap detection and the parse report stay on `data`.
   */
  workingData: WorkingTrackData | null;
  issues: readonly ValidationIssue[];
  gapRows: readonly GapRow[];
  segmentRows: readonly SegmentRow[];
  distanceStats: DistanceStats | null;
  timeStats: TimeStats | null;
  /** Re-imported repair stats (all zeros for normal files; Phase 7). */
  reimport: ReimportStats | null;
  /** Recorded extent of usable points (Null Island damage excluded). */
  extent: BBox | null;
  error: SessionError | null;
  /** The workspace a parsed file is open in (Task 20). */
  view: SessionView;
  gapThresholds: GapThresholds;
  loadFile: (file: File) => Promise<void>;
  reset: () => void;
  setView: (view: SessionView) => void;
  setGapThresholds: (patch: Partial<GapThresholds>) => void;
  resetGapThresholds: () => void;
}

// ---------------------------------------------------------------------------
// Error presentation
// ---------------------------------------------------------------------------

/** Map a typed parse error to a user-facing, actionable message. */
export function describeParseError(
  error: GpxParseError,
  fileName: string,
): SessionError {
  switch (error.kind) {
    case "malformed-xml":
      return {
        title: translateNow("hook.parse.malformedXml.title"),
        detail: translateNow("hook.parse.malformedXml.detail", {
          fileName,
          message: error.message,
        }),
        ...(error.line !== undefined ? { line: error.line } : {}),
        ...(error.column !== undefined ? { column: error.column } : {}),
      };
    case "not-a-gpx-document":
      return {
        title: translateNow("hook.parse.notGpx.title"),
        detail: translateNow("hook.parse.notGpx.detail", {
          found: error.rootElement
            ? `<${error.rootElement}>`
            : translateNow("hook.parse.noRootElement"),
        }),
      };
    case "invalid-version":
      return {
        title: translateNow("hook.parse.invalidVersion.title"),
        detail: translateNow("hook.parse.invalidVersion.detail", {
          found: error.found
            ? `"${error.found}"`
            : translateNow("hook.parse.noVersion"),
        }),
      };
    case "unsupported-format":
      return {
        title: translateNow("hook.parse.unsupportedFormat.title"),
        detail: translateNow("hook.parse.unsupportedFormat.detail", {
          fileName,
          reason: error.detail,
        }),
      };
    case "not-a-tcx-document":
      return {
        title: translateNow("hook.parse.notTcx.title"),
        detail: translateNow("hook.parse.notTcx.detail", {
          found: error.rootElement
            ? `<${error.rootElement}>`
            : translateNow("hook.parse.noRootElement"),
        }),
      };
    case "malformed-fitness-file":
      return {
        title: translateNow("hook.parse.malformedFit.title"),
        detail: translateNow("hook.parse.malformedFit.detail", {
          fileName,
          message: error.message,
        }),
      };
  }
}

// ---------------------------------------------------------------------------
// View-model builders (pure; module scope so tests can exercise them)
// ---------------------------------------------------------------------------

function toBoundaryView(
  point: OriginalTrackPoint,
  segmentId: SegmentId,
): GapBoundaryView {
  return {
    pointId: point.id,
    segmentId,
    lat: point.lat,
    lon: point.lon,
    ...(point.time !== undefined ? { time: point.time } : {}),
  };
}

function buildGapRows(
  gaps: readonly DetectedGap[],
  data: OriginalTrackData,
): GapRow[] {
  // Phase 9 — resolve boundary ids directly (O(gaps)) instead of indexing
  // every point of a 100k-point file: segments are few, ids carry their
  // own segment + index (types/ids.ts).
  const segments = new Map<SegmentId, OriginalSegment>();
  for (const segment of data.segments) {
    segments.set(segment.id, segment);
  }
  const resolve = (
    id: PointId,
  ): { point: OriginalTrackPoint; segmentId: SegmentId } | undefined => {
    const ref = parsePointIdRef(id);
    if (ref === null) return undefined;
    const segment = segments.get(ref.segmentId);
    const point = segment?.points[ref.index];
    return point === undefined ? undefined : { point, segmentId: ref.segmentId };
  };

  const rows: GapRow[] = [];
  for (const gap of gaps) {
    const before = resolve(gap.before.pointId);
    const after = resolve(gap.after.pointId);
    // Boundary ids are produced by detectGpx over the same model — always
    // resolvable. Guard defensively without inventing data.
    if (!before || !after) continue;
    rows.push({
      id: gap.id,
      kind: gap.kind,
      severity: gap.severity,
      status: gap.status,
      ...(gap.elapsedMs !== undefined ? { elapsedMs: gap.elapsedMs } : {}),
      ...(gap.impliedDistanceM !== undefined
        ? { impliedDistanceM: gap.impliedDistanceM }
        : {}),
      ...(gap.impliedSpeed !== undefined
        ? { impliedSpeed: gap.impliedSpeed }
        : {}),
      before: toBoundaryView(before.point, before.segmentId),
      after: toBoundaryView(after.point, after.segmentId),
    });
  }
  return rows;
}

function buildSegmentRows(
  data: OriginalTrackData,
  distance: DistanceStats,
  t: TranslatorArg,
): SegmentRow[] {
  const trackNames = new Map<number, string>();
  for (const track of data.tracks) {
    trackNames.set(
      track.trackIndex,
      track.name ?? t("segmentList.trackFallback", {
        number: track.trackIndex + 1,
      }),
    );
  }

  const distanceBySegment = new Map<SegmentId, { distanceM: number; excludedLegs: number }>();
  for (const seg of distance.perSegment) {
    distanceBySegment.set(seg.segmentId, {
      distanceM: seg.distanceM,
      excludedLegs: seg.excludedLegs,
    });
  }

  return data.segments.map((segment) => {
    const dist = distanceBySegment.get(segment.id) ?? {
      distanceM: 0,
      excludedLegs: 0,
    };
    const timed = segment.points.filter((p) => p.time !== undefined);
    const first = timed[0]?.time;
    const last = timed[timed.length - 1]?.time;
    return {
      segmentId: segment.id,
      trackIndex: segment.trackIndex,
      trackName:
        trackNames.get(segment.trackIndex) ??
        t("segmentList.trackFallback", { number: segment.trackIndex + 1 }),
      pointCount: segment.points.length,
      flaggedPoints: segment.points.filter((p) => p.flags.length > 0).length,
      distanceM: dist.distanceM,
      excludedLegs: dist.excludedLegs,
      ...(first !== undefined ? { firstTimeMs: first } : {}),
      ...(last !== undefined ? { lastTimeMs: last } : {}),
    };
  });
}

// ---------------------------------------------------------------------------
// The hook
// ---------------------------------------------------------------------------

/**
 * The repair studio's upload pipeline, exported for the shell (Task 26
 * pattern — `loadRecoveryFile`'s twin) and Phase 10's session restore:
 * File → text → runParsePipeline (inline or Phase 9 worker) → session
 * store. The file itself rides along into the store (`sourceFile`) so
 * the recovery autosave can persist the original bytes.
 */
export async function loadGpxFile(file: File): Promise<void> {
  const session = useSessionStore.getState();
  // The remembered landing intent decides which workspace this file
  // opens into (Task 20); switching later never re-parses. Task 26
  // revision: the toggle's third tab ("recovery") routes its uploads
  // into the recovery session instead — this path never sees it, and
  // the narrowing keeps the store's SessionView honest by construction.
  const remembered = useUiStore.getState().landingMode;
  const view = remembered === "share" ? "share" : "repair";
  session.beginLoad(file.name, view, file);

  if (file.size === 0) {
    session.fail({
      title: translateNow("hook.parse.emptyTitle"),
      detail: translateNow("hook.parse.emptyDetailFormats", {
        fileName: file.name,
      }),
    });
    return;
  }

  try {
    // Phase 14 — bytes, not text: the pipeline sniffs GPX/TCX/FIT from
    // the magic bytes and decodes XML itself (same lossy UTF-8).
    const bytes = await file.arrayBuffer();
    // Yield once more so the loading state paints before the parse of
    // large files (which then runs in the Phase 9 worker off-thread).
    await new Promise((resolve) => setTimeout(resolve, 0));

    const result = await runParsePipeline(
      { bytes, fileName: file.name },
      {
        gapThresholds: useUiStore.getState().gapThresholds,
        onProgress: (progress) =>
          useSessionStore.getState().setProgress(progress),
      },
    );
    if (!result.ok) {
      session.fail(describeParseError(result.error, file.name));
      return;
    }
    session.setParsed(file.name, result.data, result.gaps);
  } catch (err) {
    session.fail({
      title: translateNow("hook.parse.readTitle"),
      detail: translateNow("hook.parse.readDetail", {
        fileName: file.name,
        reason: err instanceof Error ? err.message : String(err),
      }),
    });
  }
}

export function useGpxSession(): GpxSession {
  const { t } = useI18n();
  const status = useSessionStore((s) => s.status);
  const fileName = useSessionStore((s) => s.fileName);
  const data = useSessionStore((s) => s.data);
  const gaps = useSessionStore((s) => s.gaps);
  const error = useSessionStore((s) => s.error);
  const view = useSessionStore((s) => s.view);
  const gapThresholds = useUiStore((s) => s.gapThresholds);
  const workingEdits = useWorkingStore((s) => s.edits);

  // The hook's upload intent — the shared pipeline above (Phase 10 made
  // the same function the restore path uses, so a restored session is
  // byte-for-byte an ordinary upload).
  const loadFile = useCallback((file: File) => loadGpxFile(file), []);

  const reset = useCallback(() => {
    useSessionStore.getState().reset();
  }, []);

  const setView = useCallback((next: SessionView) => {
    useSessionStore.getState().setView(next);
  }, []);

  const setGapThresholds = useCallback((patch: Partial<GapThresholds>) => {
    useUiStore.getState().setGapThresholds(patch);
  }, []);

  const resetGapThresholds = useCallback(() => {
    useUiStore.getState().resetGapThresholds();
  }, []);

  // Settings change → re-run detection over the unchanged original model.
  // Runs on mount too (no-op without a loaded file) and after settings
  // rehydration, which is exactly the desired behavior.
  useEffect(() => {
    const { status: current, data: currentData } = useSessionStore.getState();
    if (current === "parsed" && currentData) {
      useSessionStore
        .getState()
        .setGaps(detectGaps(currentData, gapThresholds));
    }
  }, [gapThresholds]);

  // Phase 13 — the working copy: pure derivation of (original, edit
  // log). Identity-stable while the log is empty (applyWorkingEdits
  // returns the original itself), so every downstream memo keyed on
  // the model stays quiet for pristine files.
  const workingData = useMemo<WorkingTrackData | null>(
    () => (data ? applyWorkingEdits(data, workingEdits) : null),
    [data, workingEdits],
  );

  // Derived view models — recomputed only when the model or gaps change.
  // Phase 13: the stats and the segment rows recompute from the WORKING
  // copy (§EE 13.2 — exports and stats recompute from the working copy);
  // gap detection and the parse report stay on the original.
  const distanceStats = useMemo(
    () => (workingData ? originalDistanceStats(workingData) : null),
    [workingData],
  );
  const timeStats = useMemo(
    () =>
      workingData
        ? originalTimeStats(workingData, gapThresholds.timeGapMs)
        : null,
    [workingData, gapThresholds.timeGapMs],
  );
  const reimport = useMemo(
    () => (workingData ? reimportStats(workingData) : null),
    [workingData],
  );
  const gapRows = useMemo(
    () => (data && gaps.length > 0 ? buildGapRows(gaps, data) : []),
    [gaps, data],
  );
  const segmentRows = useMemo(
    () =>
      workingData && distanceStats
        ? buildSegmentRows(workingData, distanceStats, t)
        : [],
    [workingData, distanceStats, t],
  );
  const extent = useMemo(() => {
    if (!data) return null;
    const usable: { lat: number; lon: number }[] = [];
    for (const segment of data.segments) {
      for (const point of segment.points) {
        if (isUsableStatsPoint(point)) usable.push(point);
      }
    }
    return bboxOf(usable);
  }, [data]);

  return {
    status,
    fileName,
    data,
    workingData,
    issues: data?.issues ?? [],
    gapRows,
    segmentRows,
    distanceStats,
    timeStats,
    reimport,
    extent,
    error,
    view,
    gapThresholds,
    loadFile,
    reset,
    setView,
    setGapThresholds,
    resetGapThresholds,
  };
}
