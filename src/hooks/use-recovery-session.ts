/**
 * useRecoverySession — the upload/analysis orchestration hook of the Gap
 * Recovery section (Task 26).
 *
 * Owns the runtime pipeline for one recovery file:
 *   File → text → parseGpx → validateGpx → detectGaps → recoveryStore
 * and exposes the same shape of memoized view models as the repair
 * studio's `useGpxSession` (gap rows, segment rows, statistics, extent),
 * so the section's components render familiar props — pure presentation,
 * no feature internals (ESLint boundary).
 *
 * The pipeline itself is the SAME pure machinery the repair studio runs
 * (parseGpx / validateGpx / detectGaps / the statistics joins) — only the
 * destination store differs. State stays fully isolated: loading a file
 * here never touches the repair studio's session, and vice versa.
 *
 * `loadRecoveryFile` is exported for the AppShell (Task 26 revision):
 * the landing page's "Recover a GPS gap" tab routes its upload into
 * this section's session — the hook itself is also usable standalone
 * (the composition root calls either entry point, never both).
 *
 * Thresholds are deliberately shared with the repair studio (uiStore):
 * "what counts as a gap" is one user preference, not two. Changing them
 * re-runs detection over the unchanged original model — a pure
 * recomputation, never a mutation (§D-3.5).
 *
 * Task 26 — Gap Recovery section. Client-side hook (browser APIs:
 * File#text, DOMParser via the XmlIo adapter).
 */

"use client";

import { useCallback, useEffect, useMemo } from "react";
import {
  detectGaps,
  type GapThresholds,
} from "@/features/gpx/detectGaps";
import { parseGpx } from "@/features/gpx/parse";
import { validateGpx } from "@/features/gpx/validate";
import {
  isUsableStatsPoint,
  originalDistanceStats,
  type DistanceStats,
} from "@/features/statistics/distance";
import { originalTimeStats, type TimeStats } from "@/features/statistics/time";
import { reimportStats, type ReimportStats } from "@/features/statistics/reimport";
import { createDomXmlIo } from "@/lib/utils/xml";
import { useRecoveryStore } from "@/state/recovery-store";
import { describeParseError } from "@/hooks/use-gpx-session";
import type {
  GapBoundaryView,
  GapRow,
  SegmentRow,
} from "@/hooks/use-gpx-session";

// App-layer facade re-exports: the recovery section's components and
// hooks type their props against this module (the same boundary rule the
// repair studio's session hook follows).
export type { GapRow, SegmentRow, GapBoundaryView } from "@/hooks/use-gpx-session";
export type { GapThresholds } from "@/features/gpx/detectGaps";
export type {
  DistanceStats,
  ExcludedLegReason,
} from "@/features/statistics/distance";
export type { TimeStats } from "@/features/statistics/time";
export type { ReimportStats } from "@/features/statistics/reimport";
export type { SessionError, SessionStatus } from "@/state/session-store";
import { useUiStore } from "@/state/ui-store";
import type {
  DetectedGap,
  OriginalTrackData,
  OriginalTrackPoint,
  PointId,
  SegmentId,
  ValidationIssue,
} from "@/types/domain";
import type { BBox } from "@/lib/geo/bbox";
import { bboxOf } from "@/lib/geo/bbox";
import type { SessionError, SessionStatus } from "@/state/session-store";

/** Everything the recovery section's panels need about its session. */
export interface RecoverySession {
  status: SessionStatus;
  fileName: string | null;
  data: OriginalTrackData | null;
  issues: readonly ValidationIssue[];
  /** Detected missing GPS sections, joined for display. */
  gapRows: readonly GapRow[];
  segmentRows: readonly SegmentRow[];
  distanceStats: DistanceStats | null;
  timeStats: TimeStats | null;
  /** Re-imported repair markers (an already-repaired file re-analyzed). */
  reimport: ReimportStats | null;
  extent: BBox | null;
  error: SessionError | null;
  gapThresholds: GapThresholds;
  loadFile: (file: File) => Promise<void>;
  reset: () => void;
  setGapThresholds: (patch: Partial<GapThresholds>) => void;
  resetGapThresholds: () => void;
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

/** Join detected gaps with their boundary points (mirrors useGpxSession). */
export function buildRecoveryGapRows(
  gaps: readonly DetectedGap[],
  data: OriginalTrackData,
): GapRow[] {
  const points = new Map<
    PointId,
    { point: OriginalTrackPoint; segmentId: SegmentId }
  >();
  for (const segment of data.segments) {
    for (const point of segment.points) {
      points.set(point.id, { point, segmentId: segment.id });
    }
  }

  const rows: GapRow[] = [];
  for (const gap of gaps) {
    const before = points.get(gap.before.pointId);
    const after = points.get(gap.after.pointId);
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

/** Join segments with their display stats (mirrors useGpxSession). */
export function buildRecoverySegmentRows(
  data: OriginalTrackData,
  distance: DistanceStats,
): SegmentRow[] {
  const trackNames = new Map<number, string>();
  for (const track of data.tracks) {
    trackNames.set(
      track.trackIndex,
      track.name ?? `Track ${track.trackIndex + 1}`,
    );
  }

  const distanceBySegment = new Map<
    SegmentId,
    { distanceM: number; excludedLegs: number }
  >();
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
        trackNames.get(segment.trackIndex) ?? `Track ${segment.trackIndex + 1}`,
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
// The upload pipeline (module scope so the composition root can route the
// landing page's "Recover a GPS gap" tab here — Task 26 revision)
// ---------------------------------------------------------------------------

/**
 * Read, parse, validate, and gap-detect one file into the recovery
 * session — the section's counterpart of `useGpxSession.loadFile`, with
 * the same error taxonomy (empty file / parse failure / read failure)
 * and the same yield so the loading state paints first.
 */
export async function loadRecoveryFile(file: File): Promise<void> {
  const store = useRecoveryStore.getState();
  store.beginLoad(file.name);

  if (file.size === 0) {
    store.fail({
      title: "Empty file",
      detail: `"${file.name}" contains no data. Choose a non-empty GPX export.`,
    });
    return;
  }

  try {
    const text = await file.text();
    // Yield once so the loading state paints before the synchronous
    // parse of large files (same contract as the repair studio).
    await new Promise((resolve) => setTimeout(resolve, 0));

    const outcome = parseGpx(text, createDomXmlIo());
    if (!outcome.ok) {
      store.fail(describeParseError(outcome.error, file.name));
      return;
    }
    const validated = validateGpx(outcome.data);
    const detected = detectGaps(
      validated.data,
      useUiStore.getState().gapThresholds,
    );
    store.setParsed(file.name, validated.data, detected);
  } catch (err) {
    store.fail({
      title: "Could not read file",
      detail:
        `"${file.name}" could not be read: ` +
        `${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

// ---------------------------------------------------------------------------
// The hook
// ---------------------------------------------------------------------------

export function useRecoverySession(): RecoverySession {
  const status = useRecoveryStore((s) => s.status);
  const fileName = useRecoveryStore((s) => s.fileName);
  const data = useRecoveryStore((s) => s.data);
  const gaps = useRecoveryStore((s) => s.gaps);
  const error = useRecoveryStore((s) => s.error);
  const gapThresholds = useUiStore((s) => s.gapThresholds);

  // Same pipeline as the landing-tab entry point, wrapped for the stable
  // binding (the hook rule wants the inline expression).
  const loadFile = useCallback(
    (file: File) => loadRecoveryFile(file),
    [],
  );

  const reset = useCallback(() => {
    useRecoveryStore.getState().reset();
  }, []);

  const setGapThresholds = useCallback((patch: Partial<GapThresholds>) => {
    useUiStore.getState().setGapThresholds(patch);
  }, []);

  const resetGapThresholds = useCallback(() => {
    useUiStore.getState().resetGapThresholds();
  }, []);

  // Settings change → re-run detection over the unchanged original model
  // (runs on mount too — a no-op without a loaded file, exactly like the
  // repair studio's contract).
  useEffect(() => {
    const { status: current, data: currentData } = useRecoveryStore.getState();
    if (current === "parsed" && currentData) {
      useRecoveryStore
        .getState()
        .setGaps(detectGaps(currentData, gapThresholds));
    }
  }, [gapThresholds]);

  // Derived view models — recomputed only when the model or gaps change.
  const distanceStats = useMemo(
    () => (data ? originalDistanceStats(data) : null),
    [data],
  );
  const timeStats = useMemo(
    () => (data ? originalTimeStats(data, gapThresholds.timeGapMs) : null),
    [data, gapThresholds.timeGapMs],
  );
  const reimport = useMemo(
    () => (data ? reimportStats(data) : null),
    [data],
  );
  const gapRows = useMemo(
    () => (data && gaps.length > 0 ? buildRecoveryGapRows(gaps, data) : []),
    [gaps, data],
  );
  const segmentRows = useMemo(
    () =>
      data && distanceStats ? buildRecoverySegmentRows(data, distanceStats) : [],
    [data, distanceStats],
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
    issues: data?.issues ?? [],
    gapRows,
    segmentRows,
    distanceStats,
    timeStats,
    reimport,
    extent,
    error,
    gapThresholds,
    loadFile,
    reset,
    setGapThresholds,
    resetGapThresholds,
  };
}
