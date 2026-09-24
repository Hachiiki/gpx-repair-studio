/**
 * useDrawEditor — the React binding for the reconstruction draw editor
 * (docs/MASTER_PLAN.md Phase 4).
 *
 * Responsibilities (and nothing else):
 *   - own the editor-store lifecycle: reset on session change, prune state
 *     for gaps that vanished after re-detection, close the editor when its
 *     gap disappears;
 *   - drive the map controller's draw session imperatively: start when a
 *     gap's editor opens, push every authoritative vertex change, end on
 *     close — the store is the single source of truth, the controller only
 *     renders and reports pointer commits;
 *   - inject the snap magnet (pure `features/reconstruction/snap` over the
 *     active gap's candidates) so the map adapter stays domain-free;
 *   - expose a serializable `DrawEditorBinding` for the editor panel, the
 *     map chrome (distance badge, draw-mode toggle), and the gap list
 *     (derived per-gap repair status).
 *
 * Immutability contract: nothing here ever touches the session's frozen
 * original model — repairs live exclusively in the editor store, keyed by
 * gap id. (Phase 4 acceptance: "original store unchanged".)
 *
 * Phase 4 — Reconstruction Editor: Drawing. Client-side hook.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  isStraightLine,
  MAX_VERTICES,
  reconstructionDistanceMeters,
} from "@/features/reconstruction/drawModel";
import {
  buildSnapCandidates,
  nearestSnap,
  type SnapCandidate,
} from "@/features/reconstruction/snap";
import { isUsableStatsPoint } from "@/features/statistics/distance";
import { geodesicDistanceMeters } from "@/lib/geo/geodesy";
import type { MapController } from "@/lib/map/mapController";
import type {
  DrawCommitPosition,
  PickTarget,
} from "@/lib/map/mapController";
import {
  deriveGapStatus,
  useEditorStore,
  type GapStatus,
} from "@/state/editor-store";
import { useUiStore } from "@/state/ui-store";
import type {
  DrawVertex,
  GapId,
  OriginalTrackPoint,
  PointId,
  SegmentId,
  VertexId,
} from "@/types/domain";
import type { GapRow, GpxSession } from "@/hooks/use-gpx-session";
import type { MapBinding } from "@/hooks/use-map-controller";

/** App-layer facade: the draw-editor view consumed by components. */
export interface DrawEditorBinding {
  /** An editor session is open for a gap. */
  active: boolean;
  /** The joined row of the gap being edited (null when inactive). */
  activeGap: GapRow | null;
  /** Draw mode on = pointer draws; off = normal map navigation. */
  drawMode: boolean;
  /** Snap-to-original-points magnet enabled. */
  snapEnabled: boolean;
  /** The authoritative vertices of the active reconstruction. */
  vertices: readonly DrawVertex[];
  vertexCount: number;
  maxVertices: number;
  /** Hard cap reached — further add/insert commits are refused. */
  atVertexCap: boolean;
  /** Live geodesic path length, anchors included (null when inactive). */
  distanceM: number | null;
  /** Straight-line honesty warning (see drawModel.isStraightLine). */
  straightLine: boolean;
  /** Densification spacing of the active reconstruction. */
  resampleSpacing: number | "off";
  canUndo: boolean;
  canRedo: boolean;
  /** Undoable commands on the stack (for labels). */
  undoCount: number;
  /** Redoable commands (commands undone since the last commit). */
  redoCount: number;
  /** Derived repair status per gap id (join over session + editor state). */
  statusById: Readonly<Record<string, GapStatus>>;
  /** Committed reconstructions across all gaps (count). */
  reconstructedCount: number;
  /** Gaps explicitly marked as skipped (count). */
  skippedCount: number;

  /** Manual repair spans joined into rows (resolved against the model). */
  manualRows: readonly GapRow[];
  /** Span-pick mode: the map is collecting two anchor clicks. */
  pickMode: boolean;

  openEditor: (gapId: GapId) => void;
  closeEditor: () => void;
  /** Enter span-pick mode (draw-anywhere — see ManualSpan). */
  beginPickSpan: () => void;
  /** Leave span-pick mode without creating a span. */
  cancelPickSpan: () => void;
  /** Remove a manual repair span and all of its repair state. */
  removeManualSpan: (gapId: GapId) => void;
  setDrawMode: (on: boolean) => void;
  setSnapEnabled: (on: boolean) => void;
  undo: () => void;
  redo: () => void;
  clearVertices: () => void;
  setResampleSpacing: (spacing: number | "off") => void;
  /** Toggle the skip mark of the ACTIVE gap. */
  toggleSkip: () => void;
  deleteVertex: (vertexId: VertexId) => void;
}

export function useDrawEditor(
  session: GpxSession,
  map: MapBinding,
): DrawEditorBinding {
  const activeGapId = useEditorStore((s) => s.activeGapId);
  const drawMode = useEditorStore((s) => s.drawMode);
  const snapEnabled = useEditorStore((s) => s.snapEnabled);
  const reconstructions = useEditorStore((s) => s.reconstructions);
  const skippedGapIds = useEditorStore((s) => s.skippedGapIds);
  const history = useEditorStore((s) => s.history);
  const manualSpans = useEditorStore((s) => s.manualSpans);
  const pickMode = useEditorStore((s) => s.pickMode);

  const gapRows = session.gapRows;
  const mapReady = map.status === "ready";

  // Point index for manual-span joins: coordinates, segment, document
  // order, and track — everything needed to turn a picked pair into a row
  // (and to fix which point is "before").
  const pointIndex = useMemo(() => {
    const byId = new Map<
      PointId,
      {
        point: OriginalTrackPoint;
        segmentId: SegmentId;
        ordinal: number;
        trackIndex: number;
      }
    >();
    let ordinal = 0;
    if (session.data) {
      for (const segment of session.data.segments) {
        for (const point of segment.points) {
          byId.set(point.id, {
            point,
            segmentId: segment.id,
            ordinal: ordinal++,
            trackIndex: segment.trackIndex,
          });
        }
      }
    }
    return byId;
  }, [session.data]);

  const manualRows = useMemo<GapRow[]>(() => {
    const rows: GapRow[] = [];
    for (const span of manualSpans) {
      const b = pointIndex.get(span.beforePointId);
      const a = pointIndex.get(span.afterPointId);
      if (!b || !a) continue;
      rows.push({
        id: span.id,
        kind: "manual",
        severity: "info",
        status: "new",
        ...(isUsableStatsPoint(b.point) && isUsableStatsPoint(a.point)
          ? {
              impliedDistanceM: geodesicDistanceMeters(b.point, a.point),
            }
          : {}),
        before: {
          pointId: b.point.id,
          segmentId: b.segmentId,
          lat: b.point.lat,
          lon: b.point.lon,
          ...(b.point.time !== undefined ? { time: b.point.time } : {}),
        },
        after: {
          pointId: a.point.id,
          segmentId: a.segmentId,
          lat: a.point.lat,
          lon: a.point.lon,
          ...(a.point.time !== undefined ? { time: a.point.time } : {}),
        },
      });
    }
    return rows;
  }, [manualSpans, pointIndex]);

  // Every repairable row, detected or manual — the join basis for the
  // active editor session and the status map.
  const allRows = useMemo(
    () => [...gapRows, ...manualRows],
    [gapRows, manualRows],
  );

  const activeGap = useMemo(
    () =>
      activeGapId === null
        ? null
        : (allRows.find((row) => row.id === activeGapId) ?? null),
    [activeGapId, allRows],
  );

  const activeRecon = activeGapId === null ? null : reconstructions[activeGapId] ?? null;
  const vertices = activeRecon?.vertices ?? [];

  // -- session lifecycle hygiene ---------------------------------------------

  // A new file (or reset) wipes all repair state — repairs belong to the
  // file they were drawn on, never to the next one.
  useEffect(() => {
    if (session.status !== "parsed") {
      useEditorStore.getState().reset();
    }
  }, [session.status]);

  // Re-detection may remove gaps: drop their repairs. Manual spans anchor
  // their own repairs — their ids join the known set, so a repair over a
  // user-picked stretch survives threshold changes even when detection
  // stops flagging anything there. Gap ids are deterministic per boundary
  // pair, so surviving gaps keep theirs.
  useEffect(() => {
    const known = [
      ...gapRows.map((row) => row.id),
      ...manualSpans.map((span) => span.id),
    ];
    useEditorStore.getState().prune(known);
  }, [gapRows, manualSpans]);

  // -- span-pick session driving (draw-anywhere) ------------------------------

  // While pickMode is on, the controller collects clicks on recorded
  // points; the hook turns the picked pair into a manual span + editor
  // session. Document-order fixing happens here — the map layer knows
  // nothing of the file's order.
  useEffect(() => {
    const controller: MapController | null = map.getController();
    if (!controller) return;
    if (!pickMode || !session.data) {
      controller.endPickSession();
      return;
    }
    const targets: PickTarget[] = [];
    for (const segment of session.data.segments) {
      for (const point of segment.points) {
        if (!isUsableStatsPoint(point)) continue;
        targets.push({
          pointId: point.id,
          lat: point.lat,
          lon: point.lon,
          trackIndex: segment.trackIndex,
        });
      }
    }
    controller.startPickSession({
      targets,
      callbacks: {
        onSpanPicked: (a, b) => {
          const entryA = pointIndex.get(a);
          const entryB = pointIndex.get(b);
          if (!entryA || !entryB) return;
          const [before, after] =
            entryA.ordinal <= entryB.ordinal ? [a, b] : [b, a];
          useEditorStore.getState().addManualSpan(before, after);
        },
        onCancel: () => useEditorStore.getState().cancelPickMode(),
      },
    });
    return () => controller.endPickSession();
    // pointIndex is derived from session.data — stable per file.
  }, [pickMode, mapReady, map.getController, session.data, pointIndex]);

  // -- snap magnet (pure domain, injected into the controller) ----------------

  const snapCandidates = useMemo<SnapCandidate[]>(
    () =>
      activeGap && session.data
        ? buildSnapCandidates(session.data, {
            before: { lat: activeGap.before.lat, lon: activeGap.before.lon },
            after: { lat: activeGap.after.lat, lon: activeGap.after.lon },
          })
        : [],
    [activeGap, session.data],
  );

  const snapRef = useRef(snapCandidates);
  // Refs are never written during render (react-hooks/refs): the effect
  // keeps the mutable candidate cache in sync after commit; snapFn reads
  // it at event time, which is always after the effect has run.
  useEffect(() => {
    snapRef.current = snapCandidates;
  }, [snapCandidates]);

  const snapFn = useCallback(
    (target: { lat: number; lon: number }, maxDistanceM: number) => {
      if (!useEditorStore.getState().snapEnabled) return null;
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

  // Open/switch/close the controller session when the active gap changes
  // (also fires once the map becomes ready — startDrawSession is deferred
  // internally until then).
  useEffect(() => {
    const controller: MapController | null = map.getController();
    if (!controller) return;
    if (!activeGap) {
      controller.endDrawSession();
      return;
    }
    const store = useEditorStore.getState();
    const initial = store.reconstructions[activeGap.id]?.vertices ?? [];
    controller.startDrawSession({
      gapId: activeGap.id,
      anchors: {
        before: { lat: activeGap.before.lat, lon: activeGap.before.lon },
        after: { lat: activeGap.after.lat, lon: activeGap.after.lon },
      },
      vertices: initial,
      snap: snapFn,
      callbacks: {
        onVertexAdd: (position) =>
          useEditorStore.getState().addVertex(position),
        onVertexMove: (vertexId, position) =>
          useEditorStore.getState().moveVertex(vertexId, position),
        onVertexInsert: (index, position) =>
          useEditorStore.getState().insertVertex(index, position),
        onVertexDelete: (vertexId) =>
          useEditorStore.getState().deleteVertex(vertexId),
      },
    });
    return () => {
      controller.endDrawSession();
    };
  }, [activeGap, mapReady, map.getController, snapFn]);

  // Push every authoritative vertex change into the controller.
  useEffect(() => {
    map.getController()?.updateDrawSession(vertices);
  }, [vertices, map.getController]);

  // Draw/Pan toggle → controller interaction handlers.
  useEffect(() => {
    map.getController()?.setDrawMode(drawMode);
  }, [drawMode, map.getController, mapReady]);

  // -- derived view data --------------------------------------------------------

  const distanceM = useMemo(
    () =>
      activeGap
        ? reconstructionDistanceMeters(
            vertices,
            { lat: activeGap.before.lat, lon: activeGap.before.lon },
            { lat: activeGap.after.lat, lon: activeGap.after.lon },
          )
        : null,
    [vertices, activeGap],
  );

  const straightLine = useMemo(
    () =>
      activeGap
        ? isStraightLine(
            vertices,
            { lat: activeGap.before.lat, lon: activeGap.before.lon },
            { lat: activeGap.after.lat, lon: activeGap.after.lon },
          )
        : false,
    [vertices, activeGap],
  );

  const statusById = useMemo(() => {
    const byId: Record<string, GapStatus> = {};
    for (const row of allRows) {
      byId[row.id] = deriveGapStatus({
        gapId: row.id,
        activeGapId,
        reconstruction: reconstructions[row.id],
        skipped: skippedGapIds.includes(row.id),
      });
    }
    return byId;
  }, [allRows, activeGapId, reconstructions, skippedGapIds]);

  const reconstructedCount = useMemo(
    () =>
      allRows.filter((row) => {
        const recon = reconstructions[row.id];
        return (
          row.id !== activeGapId &&
          !skippedGapIds.includes(row.id) &&
          (recon?.vertices.length ?? 0) > 0
        );
      }).length,
    [allRows, reconstructions, activeGapId, skippedGapIds],
  );

  const skippedCount = useMemo(
    () =>
      allRows.filter((row) => skippedGapIds.includes(row.id)).length,
    [allRows, skippedGapIds],
  );

  // -- intents -------------------------------------------------------------------

  const openEditor = useCallback((gapId: GapId) => {
    useEditorStore.getState().openEditor(gapId);
    // Share the selection so the map focuses the gap being repaired.
    useUiStore.getState().selectGap(gapId);
  }, []);

  const closeEditor = useCallback(() => {
    useEditorStore.getState().closeEditor();
  }, []);

  const beginPickSpan = useCallback(() => {
    useEditorStore.getState().startPickMode();
  }, []);

  const cancelPickSpan = useCallback(() => {
    useEditorStore.getState().cancelPickMode();
  }, []);

  const removeManualSpan = useCallback((gapId: GapId) => {
    useEditorStore.getState().removeManualSpan(gapId);
  }, []);

  const setDrawMode = useCallback((on: boolean) => {
    useEditorStore.getState().setDrawMode(on);
  }, []);

  const setSnapEnabled = useCallback((on: boolean) => {
    useEditorStore.getState().setSnapEnabled(on);
  }, []);

  const undo = useCallback(() => useEditorStore.getState().undo(), []);
  const redo = useCallback(() => useEditorStore.getState().redo(), []);
  const clearVertices = useCallback(
    () => useEditorStore.getState().clearVertices(),
    [],
  );

  const setResampleSpacing = useCallback(
    (spacing: number | "off") => {
      const gapId = useEditorStore.getState().activeGapId;
      if (gapId === null) return;
      useEditorStore.getState().setResampleSpacing(gapId, spacing);
    },
    [],
  );

  const toggleSkip = useCallback(() => {
    const gapId = useEditorStore.getState().activeGapId;
    if (gapId === null) return;
    useEditorStore.getState().toggleSkip(gapId);
  }, []);

  const deleteVertex = useCallback((vertexId: VertexId) => {
    useEditorStore.getState().deleteVertex(vertexId);
  }, []);

  return {
    active: activeGap !== null,
    activeGap,
    drawMode,
    snapEnabled,
    vertices,
    vertexCount: vertices.length,
    maxVertices: MAX_VERTICES,
    atVertexCap: vertices.length >= MAX_VERTICES,
    distanceM,
    straightLine,
    resampleSpacing: activeRecon?.resampleSpacingM ?? "off",
    canUndo: history.undo.length > 0,
    canRedo: history.redo.length > 0,
    undoCount: history.undo.length,
    redoCount: history.redo.length,
    statusById,
    reconstructedCount,
    skippedCount,
    manualRows,
    pickMode,
    openEditor,
    closeEditor,
    beginPickSpan,
    cancelPickSpan,
    removeManualSpan,
    setDrawMode,
    setSnapEnabled,
    undo,
    redo,
    clearVertices,
    setResampleSpacing,
    toggleSkip,
    deleteVertex,
  };
}
