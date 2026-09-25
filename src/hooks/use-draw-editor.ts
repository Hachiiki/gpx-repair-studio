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
  type PickMode,
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
  activeGap: RepairRow | null;
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
  manualRows: readonly RepairRow[];
  /** Span-pick mode: which repair tool is collecting map clicks (null = off). */
  pickMode: PickMode | null;

  openEditor: (gapId: GapId) => void;
  closeEditor: () => void;
  /** Enter ONE-click pick mode ("add missing route"). */
  beginPickAnchor: () => void;
  /** Enter two-click pick mode ("redraw a stretch"). */
  beginPickPair: () => void;
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

/**
 * A repair row: a detected `GapRow` or a manual-span row. Manual EXTEND
 * spans are open-ended — exactly ONE boundary exists (the picked anchor);
 * the missing side is `undefined`. Detected gaps and pair/insert spans
 * always carry both boundaries, so existing `GapRow`s assign directly.
 */
export type RepairRow = Omit<GapRow, "before" | "after"> & {
  before?: GapRow["before"];
  after?: GapRow["after"];
};

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
  // order, track, and each usable point's usable NEIGHBORS in the same
  // segment — everything needed to turn a picked anchor or pair into a
  // row (and to derive the one-anchor span shape).
  const pointIndex = useMemo(() => {
    const byId = new Map<
      PointId,
      {
        point: OriginalTrackPoint;
        segmentId: SegmentId;
        ordinal: number;
        trackIndex: number;
        /** Next usable point in the same segment (null at the segment end). */
        nextUsableId: PointId | null;
        /** Previous usable point in the same segment (null at the start). */
        prevUsableId: PointId | null;
      }
    >();
    let ordinal = 0;
    if (session.data) {
      for (const segment of session.data.segments) {
        const usable = segment.points.filter(isUsableStatsPoint);
        const nextUsable = new Map<PointId, PointId | null>();
        const prevUsable = new Map<PointId, PointId | null>();
        usable.forEach((point, i) => {
          nextUsable.set(point.id, usable[i + 1]?.id ?? null);
          prevUsable.set(point.id, usable[i - 1]?.id ?? null);
        });
        for (const point of segment.points) {
          byId.set(point.id, {
            point,
            segmentId: segment.id,
            ordinal: ordinal++,
            trackIndex: segment.trackIndex,
            nextUsableId: nextUsable.get(point.id) ?? null,
            prevUsableId: prevUsable.get(point.id) ?? null,
          });
        }
      }
    }
    return byId;
  }, [session.data]);

  const manualRows = useMemo<RepairRow[]>(() => {
    const rows: RepairRow[] = [];
    const boundaryOf = (pointId: PointId) => {
      const entry = pointIndex.get(pointId);
      if (!entry) return null;
      return {
        pointId: entry.point.id,
        segmentId: entry.segmentId,
        lat: entry.point.lat,
        lon: entry.point.lon,
        ...(entry.point.time !== undefined ? { time: entry.point.time } : {}),
      };
    };
    for (const span of manualSpans) {
      if (span.kind === "extend") {
        // Open-ended: one boundary (the anchor). Side "after" anchors the
        // chain's start; side "before" anchors its end (route order —
        // the geometry is the same chain either way).
        const anchor = boundaryOf(span.anchorPointId);
        if (!anchor) continue;
        rows.push({
          id: span.id,
          kind: "manual-insert",
          severity: "info",
          status: "new",
          ...(span.side === "after" ? { before: anchor } : { after: anchor }),
        });
        continue;
      }
      const b = pointIndex.get(span.beforePointId);
      const a = pointIndex.get(span.afterPointId);
      if (!b || !a) continue;
      rows.push({
        id: span.id,
        kind: span.kind === "insert" ? "manual-insert" : "manual",
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
  const allRows = useMemo<RepairRow[]>(
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

  // Resolved anchors of the active row: the near anchor always exists (it
  // is the picked/recorded point the chain attaches to); the far anchor
  // only for bounded rows (detected gaps, pair/insert spans) — open
  // extensions have no far boundary and no closing segment.
  const nearAnchor = activeGap ? (activeGap.before ?? activeGap.after) : null;
  const farAnchor =
    activeGap?.before && activeGap?.after ? activeGap.after : null;

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
  // points. Pair mode: the picked pair becomes a replace span (document-
  // order fixing happens here — the map layer knows nothing of the file's
  // order). Anchor mode: ONE click — the point's position in its segment
  // derives the shape: route start → open "before" extension; route end →
  // open "after" extension; mid-route → insert at the [anchor, next]
  // boundary (same id scheme as a picked pair, so it deduplicates into any
  // existing repair there — detected or manual).
  useEffect(() => {
    const controller: MapController | null = map.getController();
    if (!controller) return;
    if (!pickMode || !session.data) {
      controller.endPickSession();
      return;
    }
    const targets: PickTarget[] = [];
    for (const segment of session.data.segments) {
      // Endpoint flagging: the first/last usable point of each segment wins
      // pick near-ties (clicking the visible route end = the endpoint, even
      // when its neighbor sits a sub-pixel away).
      const usableIds = new Set(
        segment.points.filter(isUsableStatsPoint).map((point) => point.id),
      );
      let firstUsableId: PointId | null = null;
      let lastUsableId: PointId | null = null;
      for (const point of segment.points) {
        if (!usableIds.has(point.id)) continue;
        if (firstUsableId === null) firstUsableId = point.id;
        lastUsableId = point.id;
      }
      for (const point of segment.points) {
        if (!isUsableStatsPoint(point)) continue;
        targets.push({
          pointId: point.id,
          lat: point.lat,
          lon: point.lon,
          trackIndex: segment.trackIndex,
          ...(point.id === firstUsableId || point.id === lastUsableId
            ? { isSegmentEnd: true }
            : {}),
        });
      }
    }
    controller.startPickSession({
      mode: pickMode,
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
        onAnchorPicked: (pointId) => {
          const entry = pointIndex.get(pointId);
          if (!entry) return;
          const store = useEditorStore.getState();
          if (entry.prevUsableId === null && entry.nextUsableId !== null) {
            // The route's first usable point: the missing HEAD precedes it.
            store.addExtendSpan(pointId, "before");
          } else if (entry.nextUsableId !== null) {
            store.addInsertSpan(pointId, entry.nextUsableId);
          } else {
            // No next usable point: the segment's end — the missing TAIL.
            store.addExtendSpan(pointId, "after");
          }
        },
        onCancel: () => useEditorStore.getState().cancelPickMode(),
      },
    });
    return () => controller.endPickSession();
    // pointIndex is derived from session.data — stable per file.
  }, [pickMode, mapReady, map.getController, session.data, pointIndex]);

  // -- snap magnet (pure domain, injected into the controller) ----------------

  // The near anchor is always present; the far anchor only for bounded
  // rows (detected gaps, pair/insert spans). Open extensions snap around
  // their single anchor.
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
  // internally until then). The chain always starts at the row's anchor;
  // the far boundary exists only for bounded rows — open extensions draw
  // with NO closing segment at all.
  useEffect(() => {
    const controller: MapController | null = map.getController();
    if (!controller) return;
    if (!activeGap || !nearAnchor) {
      controller.endDrawSession();
      return;
    }
    const store = useEditorStore.getState();
    const initial = store.reconstructions[activeGap.id]?.vertices ?? [];
    controller.startDrawSession({
      gapId: activeGap.id,
      anchors: {
        before: { lat: nearAnchor.lat, lon: nearAnchor.lon },
        after: farAnchor
          ? { lat: farAnchor.lat, lon: farAnchor.lon }
          : null,
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
  }, [activeGap, nearAnchor, farAnchor, mapReady, map.getController, snapFn]);

  // Push every authoritative vertex change into the controller.
  useEffect(() => {
    map.getController()?.updateDrawSession(vertices);
  }, [vertices, map.getController]);

  // Draw/Pan toggle → controller interaction handlers.
  useEffect(() => {
    map.getController()?.setDrawMode(drawMode);
  }, [drawMode, map.getController, mapReady]);

  // -- derived view data --------------------------------------------------------

  // Distance runs anchor-to-anchor for bounded rows; an open extension
  // measures its chain (anchor → vertices) and nothing beyond — the number
  // is exactly the drawn route.
  const distanceM = useMemo(
    () =>
      nearAnchor
        ? reconstructionDistanceMeters(
            vertices,
            { lat: nearAnchor.lat, lon: nearAnchor.lon },
            farAnchor ? { lat: farAnchor.lat, lon: farAnchor.lon } : null,
          )
        : null,
    [vertices, nearAnchor, farAnchor],
  );

  // Open extensions have no straight line to hug — the warning only
  // applies to bounded rows.
  const straightLine = useMemo(
    () =>
      nearAnchor && farAnchor
        ? isStraightLine(
            vertices,
            { lat: nearAnchor.lat, lon: nearAnchor.lon },
            { lat: farAnchor.lat, lon: farAnchor.lon },
          )
        : false,
    [vertices, nearAnchor, farAnchor],
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

  const beginPickAnchor = useCallback(() => {
    useEditorStore.getState().startPickMode("anchor");
  }, []);

  const beginPickPair = useCallback(() => {
    useEditorStore.getState().startPickMode("pair");
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
    beginPickAnchor,
    beginPickPair,
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
