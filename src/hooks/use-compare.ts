/**
 * useCompareView (Phase 19 — docs/MASTER_PLAN.md §EE 19.1): the
 * before/after compare binding for the repair studio.
 *
 * Three jobs, one hook:
 *   - the DELTA TABLE — original vs outcome (points, distance, moving
 *     time, gain) assembled by the pure `buildCompareStats` from the
 *     SAME view models the statistics panel renders (the one-merge
 *     rule: the after-side distance/moving time reuse
 *     session.distanceStats/timeStats plus the repair join, the gain
 *     reuses the elevation rows; the original side runs the SAME pure
 *     functions over the frozen original — one extra identity merge,
 *     never a second arithmetic);
 *   - the OVERLAY — the original as a ghost under the working copy on
 *     the map, with the edit log's changed stretches in signal
 *     (built from the pure `buildRouteView`/`buildChangedSpans` joins
 *     and handed to `useMapController`'s compare option);
 *   - the SIDE-BY-SIDE — two static SVG snapshots with ONE shared
 *     bounds (same scale, comparable shapes), built by the pure
 *     snapshot module, shown in a dialog.
 *
 * Also owns the repair-summary print intent (§EE 19.2's per-file
 * sheet): `printing-summary` on <body>, window.print(), afterprint
 * cleanup — the Phase 15 print flow's twin.
 *
 * Phase 19 — Compare, summaries & guided flows. Client-side hook.
 */

"use client";

import { useCallback, useEffect, useMemo } from "react";
import { buildCompareStats } from "@/features/compare/compareStats";
import type {
  CompareMode,
  CompareStatRow,
  CompareStats,
} from "@/features/compare/compareStats";
import { buildChangedSpans } from "@/features/compare/changedSpans";
import type { ChangedSpan } from "@/features/compare/changedSpans";
import {
  buildTrackSnapshotSvg,
  snapshotBounds,
  snapshotLinesOf,
  spanCoordinates,
  type SnapshotLine,
} from "@/features/compare/trackSnapshot";
import { buildRepairSummary } from "@/features/compare/repairSummary";
import type { RepairSummary } from "@/features/compare/repairSummary";
import { originalDistanceStats } from "@/features/statistics/distance";
import { originalTimeStats } from "@/features/statistics/time";
import { buildElevationStats } from "@/features/statistics/elevation";
import { mergeRepairs } from "@/features/reconstruction/merge";
import type { ElevationStatsRows } from "@/hooks/use-elevation";
import type { RepairTimeStats } from "@/hooks/use-draw-editor";
import type { GpxSession, GapRow } from "@/hooks/use-gpx-session";
import {
  buildEditorRouteRefs,
  buildRouteView,
  mapOverlayPalette,
  type CompareOverlayData,
} from "@/hooks/use-map-controller";
import { useCompareStore } from "@/state/compare-store";
import { useEditorStore } from "@/state/editor-store";
import { useWorkingStore } from "@/state/working-store";
import { useTheme } from "@/hooks/use-theme";
import type {
  OriginalTrackData,
  SegmentId,
  WorkingEdit,
  WorkingTrackData,
} from "@/types/domain";
import type { RoadLeg } from "@/types/domain";

// The compare vocabulary flows through the hook facade (components
// never import @/features — the ESLint boundary).
export type { CompareMode } from "@/features/compare/compareStats";
export type {
  CompareProvenance,
  CompareRowFormat,
  CompareRowId,
  CompareStatRow,
  CompareStats,
} from "@/features/compare/compareStats";

/** The batch flow never has repair sites in the repair session's merge. */
const EMPTY_SITES: readonly never[] = [];

/** The session-slice `buildCompareOverlay` needs (structural). */
export interface CompareOverlaySessionSlice {
  data: OriginalTrackData | null;
  gapRows: readonly GapRow[];
}

/**
 * Build the map's compare overlay — pure, exported for AppShell's
 * pre-map memo (the map binding needs the overlay before the draw and
 * elevation bindings exist, so this join runs at the top of the shell
 * while the compare hook owns everything else). Null while the mode
 * is off or no file is parsed.
 */
export function buildCompareOverlay(
  mode: CompareMode,
  session: CompareOverlaySessionSlice,
  edits: readonly WorkingEdit[],
): CompareOverlayData | null {
  if (mode !== "overlay" || !session.data) return null;
  // The ghost renders the ORIGINAL through the same join the working
  // copy uses (gap breaks included), so both pictures agree about
  // where nothing was recorded. Re-import marked stretches ride as
  // ghost lines too — they are part of the original file.
  const ghostView = buildRouteView(session.data, session.gapRows);
  const ghost = [
    ...ghostView.lines.map((line) => ({
      segmentId: line.segmentId,
      trackIndex: line.trackIndex,
      coordinates: [...line.coordinates],
    })),
    ...ghostView.reconstructions.map(
      (part): { segmentId: SegmentId; trackIndex: number; coordinates: [number, number][] } => ({
        segmentId: part.gapId as unknown as SegmentId,
        trackIndex: 0,
        coordinates: [...part.coordinates],
      }),
    ),
  ];
  const changed: { segmentId: SegmentId; trackIndex: number; coordinates: [number, number][] }[] = [];
  for (const span of buildChangedSpans(session.data, edits)) {
    const slice = spanCoordinates(
      session.data,
      span.segmentId,
      span.fromIndex,
      span.toIndex,
    );
    if (slice) {
      changed.push({
        segmentId: "changed" as unknown as SegmentId,
        trackIndex: 0,
        coordinates: slice.coordinates.map(
          (coord) => [coord[0], coord[1]] as [number, number],
        ),
      });
    }
  }
  return { ghost, changed };
}

export interface UseCompareInput {
  /** The committed-repair join (draw.repairTimeStats). */
  repair: RepairTimeStats | null;
  /** The outcome's elevation rows (useElevationStats over the merge). */
  elevation: ElevationStatsRows | null;
}

export interface CompareSideBySide {
  originalSvg: string;
  afterSvg: string;
}

export interface CompareBinding {
  mode: CompareMode;
  setMode: (mode: CompareMode) => void;
  /** The delta table's rows (null before a file parses). */
  stats: CompareStats | null;
  /** The edit log's changed spans (original coordinate space). */
  changedSpans: readonly ChangedSpan[];
  /** The side-by-side panels (built while the mode is active). */
  sideBySide: CompareSideBySide | null;
  /** The repair-summary sheet's snapshot (working copy + changes). */
  summarySvg: string | null;
  /** The provenance table (§EE 19.2) — rows + history. */
  summary: RepairSummary | null;
  /** Print the repair-summary sheet (the Phase 15 print flow's twin). */
  printSummary: () => void;
  /** True when the working copy or the repairs differ from the original. */
  hasChanges: boolean;
}

function countPoints(data: { segments: readonly { points: readonly unknown[] }[] }): number {
  let total = 0;
  for (const segment of data.segments) total += segment.points.length;
  return total;
}

export function useCompareView(
  session: GpxSession,
  input: UseCompareInput,
): CompareBinding {
  const mode = useCompareStore((s) => s.mode);
  const setMode = useCompareStore((s) => s.setMode);
  const workingEdits = useWorkingStore((s) => s.edits);
  const fileTiming = useEditorStore((s) => s.fileTiming);
  const editorReconstructions = useEditorStore((s) => s.reconstructions);
  const editorRoadLegs = useEditorStore((s) => s.roadLegs);
  const editorSkipped = useEditorStore((s) => s.skippedGapIds);
  const editorActiveGapId = useEditorStore((s) => s.activeGapId);
  const editorManualSpans = useEditorStore((s) => s.manualSpans);
  const { resolved: resolvedTheme } = useTheme();

  // A new file starts compare fresh (the card's mode is session-scoped).
  const dataId = session.data;
  useEffect(() => {
    useCompareStore.getState().reset();
  }, [dataId]);

  // ---- the ORIGINAL side ------------------------------------------------
  const originalSide = useMemo(() => {
    const data = session.data;
    if (!data) return null;
    const distance = originalDistanceStats(data);
    const time = originalTimeStats(
      data,
      session.gapThresholds.timeGapMs,
    );
    // The identity merge — the same pipeline the export runs, zero
    // repair sites — so the original's gain uses the SAME hysteresis
    // arithmetic the outcome's rows use.
    const merge = mergeRepairs(data, EMPTY_SITES, {
      fileTiming,
      fileHasTimingData: time.hasTimingData,
    });
    const elevation = buildElevationStats(merge);
    return {
      pointCount: countPoints(data),
      distanceM: distance.totalDistanceM,
      movingTimeMs: time.hasTimingData ? time.recordedMovingTimeMs : null,
      gainM: elevation.mixed?.gainM ?? null,
      elevationInsufficient: elevation.insufficient,
    };
  }, [session.data, session.gapThresholds.timeGapMs, fileTiming]);

  // ---- the OUTCOME side ---------------------------------------------------
  const afterSide = useMemo(() => {
    const working = session.workingData;
    if (!working || !session.distanceStats || !session.timeStats) {
      return null;
    }
    const repair = input.repair;
    const liveRepairDistance = repair?.reconstructedDistanceM ?? 0;
    const liveRepairTime = repair?.reconstructedTimeMs ?? null;
    const liveRepairsLackDuration =
      (repair?.gapCount ?? 0) > 0 && liveRepairTime === null;
    return {
      pointCount: countPoints(working),
      // The stats panel's outcome banner arithmetic, one place
      // removed: working-copy total + the repairs' authored distance.
      distanceM: session.distanceStats.totalDistanceM + liveRepairDistance,
      movingTimeMs: session.timeStats.hasTimingData
        ? liveRepairsLackDuration
          ? null
          : session.timeStats.recordedMovingTimeMs + (liveRepairTime ?? 0)
        : null,
      gainM: input.elevation?.mixed?.gainM ?? null,
    };
  }, [
    session.workingData,
    session.distanceStats,
    session.timeStats,
    input.repair,
    input.elevation,
  ]);

  // ---- the delta table ------------------------------------------------------
  const stats = useMemo(() => {
    if (!originalSide || !afterSide) return null;
    const workingMeta =
      session.workingData && session.workingData !== session.data
        ? (session.workingData as WorkingTrackData).working ?? null
        : null;
    return buildCompareStats({
      original: originalSide,
      after: afterSide,
      working: workingMeta,
      repair: input.repair
        ? {
            gapCount: input.repair.gapCount,
            reconstructedDistanceM: input.repair.reconstructedDistanceM,
            reconstructedTimeMs: input.repair.reconstructedTimeMs,
          }
        : null,
      elevationEstimated:
        (input.elevation?.insufficient ?? true) ||
        (input.elevation?.estimatedFrom.length ?? 0) > 0,
    });
  }, [originalSide, afterSide, session.workingData, session.data, input.repair, input.elevation]);

  // ---- the changed spans + overlay ---------------------------------------
  const changedSpans = useMemo(
    () =>
      session.data ? buildChangedSpans(session.data, workingEdits) : [],
    [session.data, workingEdits],
  );

  const changedLines = useMemo<SnapshotLine[]>(() => {
    const data = session.data;
    if (!data || changedSpans.length === 0) return [];
    const lines: SnapshotLine[] = [];
    for (const span of changedSpans) {
      const slice = spanCoordinates(
        data,
        span.segmentId,
        span.fromIndex,
        span.toIndex,
      );
      if (slice) lines.push(slice);
    }
    return lines;
  }, [session.data, changedSpans]);

  // ---- the committed repairs (the same pure join the map runs) ----------
  const editorRefs = useMemo(
    () =>
      buildEditorRouteRefs({
        data: session.data,
        gapRows: session.gapRows,
        manualSpans: editorManualSpans,
        skippedGapIds: editorSkipped,
        activeGapId: editorActiveGapId,
        reconstructions: editorReconstructions,
        roadLegs: editorRoadLegs,
      }),
    [
      session.data,
      session.gapRows,
      editorManualSpans,
      editorSkipped,
      editorActiveGapId,
      editorReconstructions,
      editorRoadLegs,
    ],
  );

  /** The outcome's committed reconstruction lines (signal picture). */
  const reconLines = useMemo<SnapshotLine[]>(() => {
    if (!session.workingData) return [];
    const view = buildRouteView(
      session.workingData,
      session.gapRows,
      editorRefs.reconstructionRefs,
      editorRefs.manualGapRefs,
      editorRefs.extendGapRefs,
    );
    return view.reconstructions.map((part) => ({
      coordinates: [...part.coordinates],
    }));
  }, [session.workingData, session.gapRows, editorRefs]);

  // ---- the side-by-side panels ------------------------------------------
  const sideBySide = useMemo<CompareSideBySide | null>(() => {
    if (mode !== "side-by-side" || !session.data || !session.workingData) {
      return null;
    }
    const breaks = {
      beforePointIds: new Set(
        session.gapRows.map((row) => row.before.pointId as string),
      ),
      afterPointIds: new Set(
        session.gapRows.map((row) => row.after.pointId as string),
      ),
    };
    const originalLines = snapshotLinesOf(session.data, breaks);
    const afterLines = snapshotLinesOf(session.workingData, breaks);
    const bounds = snapshotBounds(
      originalLines,
      afterLines,
      changedLines,
      reconLines,
    );
    const palette = mapOverlayPalette(resolvedTheme === "dark");
    const originalSvg = buildTrackSnapshotSvg({
      lines: originalLines,
      changed: changedLines,
      colors: { base: palette.route, changed: palette.recon },
      bounds,
      simplifyToleranceM: 15,
      label: "Original recording",
      emitChangedGroup: true,
    });
    const afterSvg = buildTrackSnapshotSvg({
      lines: afterLines,
      changed: [...changedLines, ...reconLines],
      under: originalLines,
      colors: {
        base: palette.route,
        changed: palette.recon,
        under: palette.ghost,
      },
      bounds,
      simplifyToleranceM: 15,
      label: "After edits and repairs",
      emitChangedGroup: true,
    });
    return { originalSvg, afterSvg };
  }, [
    mode,
    session.data,
    session.workingData,
    session.gapRows,
    changedLines,
    reconLines,
    resolvedTheme,
  ]);

  // ---- the repair-summary sheet ------------------------------------------
  /*
   * Road-follow legs of COMMITTED repairs only (a leg without a
   * reconstruction never renders; the summary counts what shipped).
   */
  const committedSnappedLegs = useMemo<readonly RoadLeg[]>(() => {
    const legs: RoadLeg[] = [];
    for (const [gapId, gapLegs] of Object.entries(editorRoadLegs)) {
      if (editorReconstructions[gapId] && gapLegs.length > 0) {
        legs.push(...gapLegs);
      }
    }
    return legs;
  }, [editorRoadLegs, editorReconstructions]);

  const summary = useMemo(() => {
    if (!session.data) return null;
    return buildRepairSummary({
      edits: workingEdits,
      repair: input.repair
        ? {
            gapCount: input.repair.gapCount,
            snappedLegs: committedSnappedLegs,
          }
        : null,
      skippedGapIds: editorSkipped,
      reimportMarkerCount: session.reimport?.markerCount ?? 0,
    });
  }, [
    session.data,
    session.reimport,
    workingEdits,
    input.repair,
    committedSnappedLegs,
    editorSkipped,
  ]);

  const summarySvg = useMemo<string | null>(() => {
    if (!session.data || !session.workingData) return null;
    const breaks = {
      beforePointIds: new Set(
        session.gapRows.map((row) => row.before.pointId as string),
      ),
      afterPointIds: new Set(
        session.gapRows.map((row) => row.after.pointId as string),
      ),
    };
    // The sheet prints on paper: the LIGHT anchors, whatever the screen
    // theme is (the print CSS re-pins the palette the same way).
    const palette = mapOverlayPalette(false);
    const afterLines = snapshotLinesOf(session.workingData, breaks);
    const originalLines = snapshotLinesOf(session.data, breaks);
    return buildTrackSnapshotSvg({
      lines: afterLines,
      changed: [...changedLines, ...reconLines],
      under: originalLines,
      colors: {
        base: palette.route,
        changed: palette.recon,
        under: palette.ghost,
      },
      simplifyToleranceM: 15,
      label: "Track snapshot — after edits, original as ghost",
      emitChangedGroup: true,
    });
  }, [
    session.data,
    session.workingData,
    session.gapRows,
    changedLines,
    reconLines,
  ]);

  // ---- the print intent (the Phase 15 twin) ------------------------------
  const printSummary = useCallback(() => {
    if (typeof window === "undefined" || typeof window.print !== "function") {
      return;
    }
    const cleanup = () => {
      document.body.classList.remove("printing-summary");
      window.removeEventListener("afterprint", cleanup);
      if (backstop !== undefined) window.clearTimeout(backstop);
    };
    let backstop: number | undefined;
    if (typeof window.setTimeout === "function") {
      backstop = window.setTimeout(cleanup, 10_000);
    }
    window.addEventListener("afterprint", cleanup);
    document.body.classList.add("printing-summary");
    window.print();
  }, []);

  return {
    mode,
    setMode,
    stats,
    changedSpans,
    sideBySide,
    summarySvg,
    summary,
    printSummary,
    hasChanges: stats?.hasChanges ?? false,
  };
}

/** Format helper shared by the compare surfaces (rows → words). */
export function formatCompareCell(
  row: CompareStatRow,
): { original: string; after: string; delta: string } {
  const fmt = (value: number | null): string => {
    if (value === null) return "—";
    switch (row.format) {
      case "count":
        return value.toLocaleString();
      case "distance":
        return formatDistanceShort(value);
      case "duration":
        return formatDurationShort(value);
      case "elevation":
        return `${Math.round(value).toLocaleString()} m`;
    }
  };
  const delta = row.delta;
  let deltaText = "—";
  if (delta !== null) {
    const sign = delta > 0 ? "+" : delta < 0 ? "−" : "±";
    const abs = Math.abs(delta);
    deltaText =
      row.format === "count"
        ? `${sign}${abs.toLocaleString()}`
        : row.format === "distance"
          ? `${sign}${formatDistanceShort(abs)}`
          : row.format === "duration"
            ? `${sign}${formatDurationShort(abs)}`
            : `${sign}${Math.round(abs).toLocaleString()} m`;
  }
  return { original: fmt(row.original), after: fmt(row.after), delta: deltaText };
}

function formatDistanceShort(meters: number): string {
  if (Math.abs(meters) >= 1000) {
    return `${(meters / 1000).toFixed(meters >= 10000 ? 1 : 2)} km`;
  }
  return `${Math.round(meters)} m`;
}

function formatDurationShort(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
