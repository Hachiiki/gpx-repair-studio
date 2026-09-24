/**
 * useGpxSession — the upload/inspection orchestration hook
 * (docs/MASTER_PLAN.md §D-2 data flow, Phase 2 scope).
 *
 * Owns the runtime pipeline for one file:
 *   File → text → parseGpx → validateGpx → detectGaps → sessionStore
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
import { createDomXmlIo } from "@/lib/utils/xml";
import {
  useSessionStore,
  type SessionError,
  type SessionStatus,
} from "@/state/session-store";
import { useUiStore } from "@/state/ui-store";
import type {
  DetectedGap,
  GapId,
  GapKind,
  GapSeverity,
  GpxParseError,
  OriginalTrackData,
  OriginalTrackPoint,
  PointId,
  SegmentId,
  ValidationIssue,
} from "@/types/domain";
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
  issues: readonly ValidationIssue[];
  gapRows: readonly GapRow[];
  segmentRows: readonly SegmentRow[];
  distanceStats: DistanceStats | null;
  timeStats: TimeStats | null;
  /** Recorded extent of usable points (Null Island damage excluded). */
  extent: BBox | null;
  error: SessionError | null;
  gapThresholds: GapThresholds;
  loadFile: (file: File) => Promise<void>;
  reset: () => void;
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
        title: "Not well-formed XML",
        detail:
          `"${fileName}" could not be parsed as XML. The file may be ` +
          `truncated or not a GPX export at all. ${error.message}`,
        ...(error.line !== undefined ? { line: error.line } : {}),
        ...(error.column !== undefined ? { column: error.column } : {}),
      };
    case "not-a-gpx-document":
      return {
        title: "Not a GPX file",
        detail:
          `Expected a <gpx> root element but found ` +
          `${error.rootElement ? `<${error.rootElement}>` : "no root element"}. ` +
          `Re-export the activity as a GPX file and try again.`,
      };
    case "invalid-version":
      return {
        title: "Unsupported GPX version",
        detail:
          `GPX files must declare version "1.0" or "1.1"; this file ` +
          `declares ${error.found ? `"${error.found}"` : "no version"}. ` +
          `Re-export from your device or platform with a standard GPX version.`,
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
  // Index points by id once (O(n)); gaps reference boundaries by id.
  const points = new Map<PointId, { point: OriginalTrackPoint; segmentId: SegmentId }>();
  for (const segment of data.segments) {
    for (const point of segment.points) {
      points.set(point.id, { point, segmentId: segment.id });
    }
  }

  const rows: GapRow[] = [];
  for (const gap of gaps) {
    const before = points.get(gap.before.pointId);
    const after = points.get(gap.after.pointId);
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
): SegmentRow[] {
  const trackNames = new Map<number, string>();
  for (const track of data.tracks) {
    trackNames.set(
      track.trackIndex,
      track.name ?? `Track ${track.trackIndex + 1}`,
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
      trackName: trackNames.get(segment.trackIndex) ?? `Track ${segment.trackIndex + 1}`,
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

export function useGpxSession(): GpxSession {
  const status = useSessionStore((s) => s.status);
  const fileName = useSessionStore((s) => s.fileName);
  const data = useSessionStore((s) => s.data);
  const gaps = useSessionStore((s) => s.gaps);
  const error = useSessionStore((s) => s.error);
  const gapThresholds = useUiStore((s) => s.gapThresholds);

  const loadFile = useCallback(async (file: File) => {
    const session = useSessionStore.getState();
    session.beginLoad(file.name);

    if (file.size === 0) {
      session.fail({
        title: "Empty file",
        detail: `"${file.name}" contains no data. Choose a non-empty GPX export.`,
      });
      return;
    }

    try {
      const text = await file.text();
      // Yield once more so the loading state paints before the synchronous
      // parse of large files (Web Worker offload arrives in Phase 9).
      await new Promise((resolve) => setTimeout(resolve, 0));

      const outcome = parseGpx(text, createDomXmlIo());
      if (!outcome.ok) {
        session.fail(describeParseError(outcome.error, file.name));
        return;
      }
      const validated = validateGpx(outcome.data);
      const detected = detectGaps(
        validated.data,
        useUiStore.getState().gapThresholds,
      );
      session.setParsed(file.name, validated.data, detected);
    } catch (err) {
      session.fail({
        title: "Could not read file",
        detail:
          `"${file.name}" could not be read: ` +
          `${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }, []);

  const reset = useCallback(() => {
    useSessionStore.getState().reset();
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

  // Derived view models — recomputed only when the model or gaps change.
  const distanceStats = useMemo(
    () => (data ? originalDistanceStats(data) : null),
    [data],
  );
  const timeStats = useMemo(
    () => (data ? originalTimeStats(data, gapThresholds.timeGapMs) : null),
    [data, gapThresholds.timeGapMs],
  );
  const gapRows = useMemo(
    () => (data && gaps.length > 0 ? buildGapRows(gaps, data) : []),
    [gaps, data],
  );
  const segmentRows = useMemo(
    () =>
      data && distanceStats ? buildSegmentRows(data, distanceStats) : [],
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
    extent,
    error,
    gapThresholds,
    loadFile,
    reset,
    setGapThresholds,
    resetGapThresholds,
  };
}
