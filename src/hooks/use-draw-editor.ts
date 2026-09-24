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
import type { MapController } from "@/lib/map/mapController";
import type { DrawCommitPosition } from "@/lib/map/mapController";
import {
  deriveGapStatus,
  useEditorStore,
  type GapStatus,
} from "@/state/editor-store";
import { useUiStore } from "@/state/ui-store";
import type {
  DrawVertex,
  GapId,
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

  openEditor: (gapId: GapId) => void;
  closeEditor: () => void;
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

  const gapRows = session.gapRows;
  const mapReady = map.status === "ready";

  const activeGap = useMemo(
    () =>
      activeGapId === null
        ? null
        : (gapRows.find((row) => row.id === activeGapId) ?? null),
    [activeGapId, gapRows],
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

  // Re-detection may remove gaps: drop their repairs (gap ids are
  // deterministic per boundary pair, so surviving gaps keep theirs) and
  // close the editor if its gap vanished.
  useEffect(() => {
    if (gapRows.length === 0) return;
    useEditorStore.getState().prune(gapRows.map((row) => row.id));
  }, [gapRows]);

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
    () =>
      gapRows.filter((row) => skippedGapIds.includes(row.id)).length,
    [gapRows, skippedGapIds],
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
    openEditor,
    closeEditor,
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
