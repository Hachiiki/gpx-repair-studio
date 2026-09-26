/**
 * useRecoveryDraw — the React binding for the Gap Recovery section's draw
 * editor (Task 26).
 *
 * A deliberate mirror of the repair studio's `useDrawEditor`, bound to the
 * recovery store instead of the editor store. The existing hook stays
 * byte-for-byte untouched (Task 26's addition-only constraint); the shared
 * logic lives in the pure modules both hooks consume (drawModel commands,
 * snap candidates, road-follow joins, resample, the §J-1 time plan, the
 * pace join). What this mirror drops on purpose: manual repair spans and
 * pick modes — the recovery section repairs DETECTED missing sections,
 * it never authors arbitrary spans.
 *
 * The returned binding implements the SAME `DrawEditorBinding` interface
 * as the repair studio, so the section reuses `DrawEditorPanel`, the map
 * chrome (Draw/Pan chip, distance badge, pick chip), and the undo/redo
 * bar unchanged. The manual-span fields are inert constants (empty rows,
 * no-op intents) — they can never trigger because every recovery row is a
 * detected gap, never a manual kind.
 *
 * Task 26 — Gap Recovery section. Client-side hook.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { MAX_VERTICES } from "@/features/reconstruction/drawModel";
import { resamplePath } from "@/features/reconstruction/resample";
import {
  resolveGapTimePlan,
  type GapTimePlan,
} from "@/features/reconstruction/timestamps";
import { buildPaceRows, type PaceRow } from "@/features/statistics/pace";
import {
  buildSnapCandidates,
  nearestSnap,
  type SnapCandidate,
} from "@/features/reconstruction/snap";
import {
  closingLegCoordinates,
  isStraightLinePath,
  joinDrawChain,
} from "@/features/reconstruction/roadFollow";
import {
  polylineLengthMeters,
} from "@/lib/geo/geodesy";
import type { MapController } from "@/lib/map/mapController";
import type {
  DrawCommitPosition,
} from "@/lib/map/mapController";
import {
  deriveGapStatus,
  type GapStatus,
} from "@/state/editor-store";
import { useRecoveryStore } from "@/state/recovery-store";
import type {
  GapId,
  LatLon,
  RoadFollowMode,
  RoadLeg,
  TimeStrategy,
  VertexId,
} from "@/types/domain";
import type { RecoverySession } from "@/hooks/use-recovery-session";
import type { DrawEditorBinding, RepairTimeStats } from "@/hooks/use-draw-editor";
import { getRoadRouter } from "@/hooks/use-draw-editor";
import type { MapBinding } from "@/hooks/use-map-controller";

export type { GapTimePlan };
export type { PaceRow };
export type { RepairTimeStats as RecoveryRepairTimeStats };

export function useRecoveryDraw(
  session: RecoverySession,
  map: MapBinding,
): DrawEditorBinding {
  const activeGapId = useRecoveryStore((s) => s.activeGapId);
  const drawMode = useRecoveryStore((s) => s.drawMode);
  const snapEnabled = useRecoveryStore((s) => s.snapEnabled);
  const roadFollow = useRecoveryStore((s) => s.roadFollow);
  const roadLegs = useRecoveryStore((s) => s.roadLegs);
  const roadRouting = useRecoveryStore((s) => s.roadRouting);
  const reconstructions = useRecoveryStore((s) => s.reconstructions);
  const skippedGapIds = useRecoveryStore((s) => s.skippedGapIds);
  const history = useRecoveryStore((s) => s.history);
  const fileTiming = useRecoveryStore((s) => s.fileTiming);

  const gapRows = session.gapRows;
  const mapReady = map.status === "ready";

  // Recovery rows are always bounded detected gaps — both boundaries
  // exist by construction (detection produced them from adjacent points).
  const activeGap = useMemo(
    () =>
      activeGapId === null
        ? null
        : (gapRows.find((row) => row.id === activeGapId) ?? null),
    [activeGapId, gapRows],
  );

  const activeRecon =
    activeGapId === null ? null : reconstructions[activeGapId] ?? null;
  const vertices = activeRecon?.vertices ?? [];

  /** Resolved road legs of the ACTIVE section (empty when none/off). */
  const activeRoadLegs = useMemo(
    () => (activeGapId === null ? [] : (roadLegs[activeGapId] ?? [])),
    [activeGapId, roadLegs],
  );

  const nearAnchor = activeGap?.before ?? null;
  const farAnchor = activeGap?.after ?? null;

  // -- session lifecycle hygiene ---------------------------------------------

  // Re-detection may remove sections: drop their repairs (gap ids are
  // deterministic per boundary pair, so surviving sections keep theirs).
  useEffect(() => {
    const known = gapRows.map((row) => row.id);
    useRecoveryStore.getState().prune(known);
  }, [gapRows]);

  // -- snap magnet (pure domain, injected into the controller) ----------------

  const snapCandidates = useMemo<SnapCandidate[]>(
    () =>
      nearAnchor && session.data
        ? buildSnapCandidates(session.data, {
            before: { lat: nearAnchor.lat, lon: nearAnchor.lon },
            ...(farAnchor
              ? { after: { lat: farAnchor.lat, lon: farAnchor.lon } }
              : {}),
          })
        : [],
    [nearAnchor, farAnchor, session.data],
  );

  const snapRef = useRef(snapCandidates);
  useEffect(() => {
    snapRef.current = snapCandidates;
  }, [snapCandidates]);

  const snapFn = useCallback(
    (target: { lat: number; lon: number }, maxDistanceM: number) => {
      if (!useRecoveryStore.getState().snapEnabled) return null;
      const snapped = nearestSnap(snapRef.current, target, maxDistanceM);
      if (!snapped) return null;
      return {
        lat: snapped.lat,
        lon: snapped.lon,
        ...(snapped.pointId !== undefined
          ? { snappedTo: snapped.pointId }
          : {}),
      } satisfies DrawCommitPosition;
    },
    [],
  );

  // -- controller draw-session driving ----------------------------------------

  const makeJoins = useCallback(
    (legs: readonly RoadLeg[]) => ({
      chainJoin: (nodes: readonly LatLon[]) => joinDrawChain(nodes, legs),
      closingJoin: (from: LatLon, to: LatLon) =>
        closingLegCoordinates(from, to, legs),
    }),
    [],
  );

  // Open/switch/close the controller session when the active section
  // changes (also fires once the map becomes ready). The chain always
  // starts at the section's before anchor and closes at its after
  // anchor — a missing GPS section is bounded by definition.
  useEffect(() => {
    const controller: MapController | null = map.getController();
    if (!controller) return;
    if (!activeGap || !nearAnchor || !farAnchor) {
      controller.endDrawSession();
      return;
    }
    const store = useRecoveryStore.getState();
    const initial = store.reconstructions[activeGap.id]?.vertices ?? [];
    const initialLegs = store.roadLegs[activeGap.id] ?? [];
    controller.startDrawSession({
      gapId: activeGap.id,
      anchors: {
        before: { lat: nearAnchor.lat, lon: nearAnchor.lon },
        after: { lat: farAnchor.lat, lon: farAnchor.lon },
      },
      vertices: initial,
      snap: snapFn,
      ...makeJoins(initialLegs),
      callbacks: {
        onVertexAdd: (position) =>
          useRecoveryStore.getState().addVertex(position),
        onVertexMove: (vertexId, position) =>
          useRecoveryStore.getState().moveVertex(vertexId, position),
        onVertexInsert: (index, position) =>
          useRecoveryStore.getState().insertVertex(index, position),
        onVertexDelete: (vertexId) =>
          useRecoveryStore.getState().deleteVertex(vertexId),
      },
    });
    return () => {
      controller.endDrawSession();
    };
  }, [activeGap, nearAnchor, farAnchor, mapReady, map.getController, snapFn, makeJoins]);

  // Push every authoritative vertex change (and every resolved road leg)
  // into the controller — the store is the single source of truth.
  useEffect(() => {
    map.getController()?.updateDrawSession(vertices, makeJoins(activeRoadLegs));
  }, [vertices, activeRoadLegs, map.getController, makeJoins]);

  // -- road-follow leg resolution (snap to road) --------------------------------

  const roadGeneration = useRef(0);

  useEffect(() => {
    const resetRouting = () => {
      const state = useRecoveryStore.getState();
      if (state.roadRouting.pending !== 0 || state.roadRouting.failed) {
        state.setRoadRouting({ pending: 0, failed: false });
      }
    };
    if (!activeGap || !nearAnchor || !farAnchor) {
      resetRouting();
      return;
    }
    const gapId = activeGap.id;
    if (roadFollow === "off") {
      const legs = useRecoveryStore.getState().roadLegs[gapId] ?? [];
      if (legs.length > 0) useRecoveryStore.getState().setRoadLegs(gapId, []);
      resetRouting();
      return;
    }
    const nodes: LatLon[] = [
      { lat: nearAnchor.lat, lon: nearAnchor.lon },
      ...vertices,
      { lat: farAnchor.lat, lon: farAnchor.lon },
    ];
    const pairs: { a: LatLon; b: LatLon }[] = [];
    for (let i = 0; i + 1 < nodes.length; i += 1) {
      pairs.push({ a: nodes[i], b: nodes[i + 1] });
    }
    const router = getRoadRouter();
    const resolved: RoadLeg[] = [];
    const missing: { a: LatLon; b: LatLon }[] = [];
    for (const pair of pairs) {
      const leg = router.cached(roadFollow, pair.a, pair.b);
      if (leg) resolved.push(leg);
      else missing.push(pair);
    }
    useRecoveryStore.getState().setRoadLegs(gapId, resolved);
    useRecoveryStore.getState().setRoadRouting({
      pending: missing.length,
      failed: false,
    });
    if (missing.length === 0) return;
    const generation = (roadGeneration.current += 1);
    let pending = missing.length;
    for (const pair of missing) {
      void router.segment(roadFollow, pair.a, pair.b).then((leg) => {
        if (roadGeneration.current !== generation) return; // stale
        const state = useRecoveryStore.getState();
        if (state.activeGapId !== gapId || state.roadFollow !== roadFollow) {
          return;
        }
        pending -= 1;
        if (leg) {
          state.setRoadLegs(gapId, [...(state.roadLegs[gapId] ?? []), leg]);
          state.setRoadRouting({ pending, failed: false });
        } else {
          state.setRoadRouting({ pending, failed: true });
        }
      });
    }
  }, [activeGap, nearAnchor, farAnchor, vertices, roadFollow]);

  // Draw/Pan toggle → controller interaction handlers.
  useEffect(() => {
    map.getController()?.setDrawMode(drawMode);
  }, [drawMode, map.getController, mapReady]);

  // Keyboard accelerators (QoL): D = draw, P = pan — active only while an
  // editor session is open, never while typing in a form control.
  useEffect(() => {
    if (activeGapId === null) return;
    const onKeydown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "d") {
        event.preventDefault();
        useRecoveryStore.getState().setDrawMode(true);
      } else if (key === "p") {
        event.preventDefault();
        useRecoveryStore.getState().setDrawMode(false);
      }
    };
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [activeGapId]);

  // -- derived view data --------------------------------------------------------

  // Distance runs over the RENDERED path (nodes with road legs
  // substituted) — WYSIWYG, the same honesty rule as the repair studio.
  const distanceM = useMemo(() => {
    if (!nearAnchor || !farAnchor) return null;
    const nodes: LatLon[] = [
      { lat: nearAnchor.lat, lon: nearAnchor.lon },
      ...vertices,
      { lat: farAnchor.lat, lon: farAnchor.lon },
    ];
    return polylineLengthMeters(joinDrawChain(nodes, activeRoadLegs).points);
  }, [nearAnchor, farAnchor, vertices, activeRoadLegs]);

  const straightLine = useMemo(() => {
    if (!nearAnchor || !farAnchor || vertices.length === 0) return false;
    const nodes: LatLon[] = [
      { lat: nearAnchor.lat, lon: nearAnchor.lon },
      ...vertices,
      { lat: farAnchor.lat, lon: farAnchor.lon },
    ];
    return isStraightLinePath(
      joinDrawChain(nodes, activeRoadLegs).points,
      { lat: nearAnchor.lat, lon: nearAnchor.lon },
      { lat: farAnchor.lat, lon: farAnchor.lon },
    );
  }, [nearAnchor, farAnchor, vertices, activeRoadLegs]);

  const statusById = useMemo(() => {
    const byId: Record<string, GapStatus> = {};
    for (const row of gapRows) {
      byId[row.id] = deriveGapStatus({
        gapId: row.id,
        activeGapId,
        reconstruction: reconstructions[row.id],
        skipped: skippedGapIds.includes(row.id),
      });
    }
    return byId;
  }, [gapRows, activeGapId, reconstructions, skippedGapIds]);

  const reconstructedCount = useMemo(
    () =>
      gapRows.filter((row) => {
        const recon = reconstructions[row.id];
        return (
          row.id !== activeGapId &&
          !skippedGapIds.includes(row.id) &&
          (recon?.vertices.length ?? 0) > 0
        );
      }).length,
    [gapRows, reconstructions, activeGapId, skippedGapIds],
  );

  const skippedCount = useMemo(
    () => gapRows.filter((row) => skippedGapIds.includes(row.id)).length,
    [gapRows, skippedGapIds],
  );

  // -- time & pace -------------------------------------------------------------

  // The resolved §J-1 plan of the ACTIVE section: which case applies, the
  // duration feeding the live pace, the Case-4 discrepancy.
  const timePlan = useMemo<GapTimePlan | null>(() => {
    if (!activeGap) return null;
    const strategy: TimeStrategy =
      activeRecon?.timeStrategy ?? { kind: "distance-proportional" };
    return resolveGapTimePlan(
      {
        routeBeforeMs: activeGap.before?.time,
        routeAfterMs: activeGap.after?.time,
      },
      strategy,
      fileTiming,
    );
  }, [activeGap, activeRecon, fileTiming]);

  // Committed repairs → the stats join (rendered path lengths; durations
  // from the case matrix — the same population the map's committed lines
  // and the export use).
  const repairTimeStats = useMemo<RepairTimeStats>(() => {
    let reconstructedDistanceM = 0;
    let reconstructedTimeMs: number | null = null;
    let gapsWithoutDuration = 0;
    const discrepancies: RepairTimeStats["discrepancies"][number][] = [];
    let gapCount = 0;

    for (const row of gapRows) {
      if (row.id === activeGapId || skippedGapIds.includes(row.id)) continue;
      const recon = reconstructions[row.id];
      if (!recon || recon.vertices.length === 0) continue;

      const path = resamplePath(
        { lat: row.before.lat, lon: row.before.lon },
        recon.vertices,
        { lat: row.after.lat, lon: row.after.lon },
        recon.resampleSpacingM,
        roadLegs[row.id] ?? [],
      );
      reconstructedDistanceM += path.length > 0 ? path[path.length - 1].cumDistanceM : 0;

      const plan = resolveGapTimePlan(
        {
          routeBeforeMs: row.before?.time,
          routeAfterMs: row.after?.time,
        },
        recon.timeStrategy,
        fileTiming,
      );
      gapCount += 1;
      if (plan.durationMs === null) {
        gapsWithoutDuration += 1;
      } else {
        reconstructedTimeMs = (reconstructedTimeMs ?? 0) + plan.durationMs;
      }
      if (
        plan.discrepancyMs !== null &&
        plan.durationMs !== null &&
        plan.recordedSpanMs !== null
      ) {
        discrepancies.push({
          gapId: row.id,
          manualMs: plan.durationMs,
          recordedMs: plan.recordedSpanMs,
        });
      }
    }

    return {
      gapCount,
      reconstructedDistanceM,
      reconstructedTimeMs,
      gapsWithoutDuration,
      discrepancies,
    };
  }, [gapRows, activeGapId, skippedGapIds, reconstructions, roadLegs, fileTiming]);

  const paceRows = useMemo<readonly PaceRow[]>(
    () =>
      buildPaceRows({
        hasTimingData: session.timeStats?.hasTimingData ?? false,
        recordedMovingTimeMs: session.timeStats?.recordedMovingTimeMs ?? 0,
        recordedDistanceM: session.distanceStats?.totalDistanceM ?? 0,
        repairDistanceM: repairTimeStats.reconstructedDistanceM,
        repairTimeMs: repairTimeStats.reconstructedTimeMs,
        repairsWithoutDuration: repairTimeStats.gapsWithoutDuration,
        hasRepairs: repairTimeStats.gapCount > 0,
        manualTotalDurationMs: fileTiming.totalDurationMs,
      }),
    [session.timeStats, session.distanceStats, repairTimeStats, fileTiming],
  );

  // -- intents -------------------------------------------------------------------

  const openEditor = useCallback((gapId: GapId) => {
    useRecoveryStore.getState().openEditor(gapId);
  }, []);

  const closeEditor = useCallback(() => {
    useRecoveryStore.getState().closeEditor();
  }, []);

  const setDrawMode = useCallback((on: boolean) => {
    useRecoveryStore.getState().setDrawMode(on);
  }, []);

  const setSnapEnabled = useCallback((on: boolean) => {
    useRecoveryStore.getState().setSnapEnabled(on);
  }, []);

  const setRoadFollow = useCallback((mode: RoadFollowMode) => {
    useRecoveryStore.getState().setRoadFollow(mode);
  }, []);

  const undo = useCallback(() => useRecoveryStore.getState().undo(), []);
  const redo = useCallback(() => useRecoveryStore.getState().redo(), []);
  const clearVertices = useCallback(
    () => useRecoveryStore.getState().clearVertices(),
    [],
  );

  const setResampleSpacing = useCallback(
    (spacing: number | "off") => {
      const gapId = useRecoveryStore.getState().activeGapId;
      if (gapId === null) return;
      useRecoveryStore.getState().setResampleSpacing(gapId, spacing);
    },
    [],
  );

  const setTimeStrategy = useCallback((strategy: TimeStrategy) => {
    const gapId = useRecoveryStore.getState().activeGapId;
    if (gapId === null) return;
    useRecoveryStore.getState().setTimeStrategy(gapId, strategy);
  }, []);

  const setFileTiming = useCallback(
    (patch: { startMs?: number | null; totalDurationMs?: number | null }) => {
      useRecoveryStore.getState().setFileTiming(patch);
    },
    [],
  );

  const toggleSkip = useCallback(() => {
    const gapId = useRecoveryStore.getState().activeGapId;
    if (gapId === null) return;
    useRecoveryStore.getState().toggleSkip(gapId);
  }, []);

  const deleteVertex = useCallback((vertexId: VertexId) => {
    useRecoveryStore.getState().deleteVertex(vertexId);
  }, []);

  // Manual-span intents are inert in this section: recovery repairs
  // detected missing sections only, so no row is ever a manual kind and
  // no pick mode can start.
  const noop = useCallback(() => {}, []);

  return {
    active: activeGap !== null,
    activeGap,
    drawMode,
    snapEnabled,
    roadFollow,
    routingPending: roadRouting.pending > 0,
    routingFailed: roadRouting.failed && roadFollow !== "off",
    vertices,
    vertexCount: vertices.length,
    maxVertices: MAX_VERTICES,
    atVertexCap: vertices.length >= MAX_VERTICES,
    distanceM,
    straightLine,
    resampleSpacing: activeRecon?.resampleSpacingM ?? "off",
    timePlan,
    fileTiming,
    canUndo: history.undo.length > 0,
    canRedo: history.redo.length > 0,
    undoCount: history.undo.length,
    redoCount: history.redo.length,
    statusById,
    reconstructedCount,
    skippedCount,
    repairTimeStats,
    paceRows,
    manualRows: [],
    pickMode: null,
    openEditor,
    closeEditor,
    beginPickAnchor: noop,
    beginPickPair: noop,
    cancelPickSpan: noop,
    removeManualSpan: noop,
    setDrawMode,
    setSnapEnabled,
    setRoadFollow,
    undo,
    redo,
    clearVertices,
    setResampleSpacing,
    setTimeStrategy,
    setFileTiming,
    toggleSkip,
    deleteVertex,
  };
}
