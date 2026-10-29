/**
 * useCreateDraw — the React binding for the "create from activity stats"
 * section's route editor.
 *
 * A deliberate mirror of the repair/recovery draw hooks, bound to the
 * create store, with the anchor machinery removed: there is no recorded
 * route, so the chain is purely the user-placed vertices and the first
 * click IS the route's start. The shared logic is the SAME pure modules
 * all three sections consume (drawModel commands, the road-follow router
 * + chain joins, the vertex cap) — one implementation of every drawing
 * edit, three independent stores.
 *
 * Snap-to-recorded-points is deliberately absent (there is nothing to
 * snap to); road-follow is fully wired (drawing along real roads matters
 * most when the whole route is drawn).
 *
 * "Create from activity stats" section. Client-side hook.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { MAX_VERTICES } from "@/features/reconstruction/drawModel";
import {
  contiguousSelectionSpan,
  type PaceSegment,
} from "@/features/create/pace";
import type { WobbleSegment } from "@/features/create/wobble";
export type { WobbleSegment } from "@/features/create/wobble";
import { resamplePath } from "@/features/reconstruction/resample";
import {
  joinStyledChain,
  routableOf,
  type ChainNode,
  type RoutableRoadMode,
} from "@/features/reconstruction/roadFollow";
import { simplifyStroke } from "@/features/reconstruction/stroke";
import { polylineLengthMeters } from "@/lib/geo/geodesy";
import type { MapController } from "@/lib/map/mapController";
import { getRoadRouter } from "@/hooks/road-router";
import { requestRouterConsent } from "@/hooks/road-router";
import { useUiStore, type RouterConsent } from "@/state/ui-store";
import { useCreateStore } from "@/state/create-store";
import type {
  DrawVertex,
  LatLon,
  PathStyle,
  PenMode,
  PointerMode,
  RoadFollowMode,
  RoadLeg,
  VertexId,
} from "@/types/domain";
import type { CreateMapBinding } from "@/hooks/use-create-map";

/** The create section's editor view (consumed by RouteDrawPanel + MapCanvas). */
export interface CreateDrawBinding {
  // -- MapCanvas chrome (the MapDrawChromeBinding subset) --------------------
  /** The drawing phase is active (chrome + panel visible). */
  active: boolean;
  /** The three-way pointer mode: draw adds, move drags, pan navigates. */
  pointerMode: PointerMode;
  /** The draw-mode pen (user pass 48): default clicks, curve strokes. */
  pen: PenMode;
  distanceM: number | null;
  vertexCount: number;
  maxVertices: number;
  pickMode: null;
  setPointerMode: (mode: PointerMode) => void;
  setPenMode: (pen: PenMode) => void;

  // -- panel -----------------------------------------------------------------
  vertices: readonly DrawVertex[];
  atVertexCap: boolean;
  canUndo: boolean;
  canRedo: boolean;
  undoCount: number;
  redoCount: number;
  pathStyle: PathStyle;
  /** A road leg request is in flight for the chain. */
  routingPending: boolean;
  /** The latest road request failed (straight lines until it recovers). */
  routingFailed: boolean;
  /** §EE 17.2: routing is on but this session has not consented yet. */
  routingNeedsConsent: boolean;
  /** §EE 17.2: the session's consent state (never persisted). */
  routerConsent: RouterConsent;
  /** §EE 17.2: open the consent dialog (the enable notice's button). */
  requestRoadConsent: () => void;
  resampleSpacing: number | "off";

  setPathStyle: (mode: PathStyle) => void;
  setResampleSpacing: (spacing: number | "off") => void;
  undo: () => void;
  redo: () => void;
  clearVertices: () => void;
  deleteVertex: (vertexId: VertexId) => void;

  // -- selection + clipboard (Task 72: repeat a loop) ------------------------
  /** The selected vertices' ids (map Shift+click / list ticks). */
  selection: ReadonlySet<VertexId>;
  /** How many vertices are selected. */
  selectedCount: number;
  /** How many points sit on the clipboard. */
  clipboardCount: number;
  /** True when a selection exists to copy. */
  canCopy: boolean;
  /** True when a paste would land at least one point (cap-aware). */
  canPaste: boolean;
  /** Toggle one vertex's selection (checkbox click, map Shift+click). */
  toggleVertexSelection: (vertexId: VertexId) => void;
  /** Select the inclusive index range between two vertices (list Shift+click). */
  selectVertexRange: (fromVertexId: VertexId, toVertexId: VertexId) => void;
  /** Select every vertex. */
  selectAllVertices: () => void;
  /** Empty the selection. */
  clearSelection: () => void;
  /** Copy the selection onto the clipboard (route order). */
  copySelection: () => void;
  /** Paste the clipboard at the chain's end (one undo step per paste). */
  pasteClipboard: () => void;

  // -- pace plan (Task 73: stretches at a stated pace) ----------------------
  /** The planned pace stretches, in route order. */
  paceSegments: readonly PaceSegment[];
  /** Each segment's span distance on the drawn chain (meters, id → m). */
  paceSegmentDistances: ReadonlyMap<string, number>;
  /** The chain index of each segment's endpoints (id → [from, to]). */
  paceSegmentIndices: ReadonlyMap<string, [number, number]>;
  /** The selection as a plannable contiguous run (null when scattered/single). */
  selectionPaceSpan: {
    fromVertexId: VertexId;
    toVertexId: VertexId;
    fromIndex: number;
    toIndex: number;
    distanceM: number;
  } | null;
  /** Plan (or re-plan) the selected stretch's pace. */
  applyPaceSegment: (
    fromVertexId: VertexId,
    toVertexId: VertexId,
    paceMsPerMeter: number,
  ) => void;
  /** Change one segment's stated pace (span untouched). */
  updatePaceSegment: (id: string, paceMsPerMeter: number) => void;
  /** Remove one segment. */
  removePaceSegment: (id: string) => void;

  // -- human-like GPS plan (Task 74: wobbled stretches) ---------------------
  /** The planned wobble stretches, in route order. */
  wobbleSegments: readonly WobbleSegment[];
  /** Each stretch's span distance on the drawn chain (meters, id → m). */
  wobbleSegmentDistances: ReadonlyMap<string, number>;
  /** The chain index of each stretch's endpoints (id → [from, to]). */
  wobbleSegmentIndices: ReadonlyMap<string, [number, number]>;
  /** Plan (or re-plan) the selected stretch's wobble. */
  applyWobble: (
    fromVertexId: VertexId,
    toVertexId: VertexId,
    intensity: WobbleSegment["intensity"],
  ) => void;
  /** Remove one wobble stretch (the line returns to ruler-straight). */
  removeWobbleSegment: (id: string) => void;

  /** Finish drawing → the review phase (disabled below 2 vertices). */
  finishRoute: () => void;
  canFinish: boolean;
}

export function useCreateDraw(map: CreateMapBinding): CreateDrawBinding {
  const phase = useCreateStore((s) => s.phase);
  const pointerMode = useCreateStore((s) => s.pointerMode);
  const pen = useCreateStore((s) => s.pen);
  const pathStyle = useCreateStore((s) => s.pathStyle);
  const roadLegs = useCreateStore((s) => s.roadLegs);
  const roadRouting = useCreateStore((s) => s.roadRouting);
  const vertices = useCreateStore((s) => s.reconstruction.vertices);
  const history = useCreateStore((s) => s.history);
  // Task 72 — the copy/paste selection + clipboard.
  const selection = useCreateStore((s) => s.selection);
  const clipboard = useCreateStore((s) => s.clipboard);
  // Task 73 — the pace plan.
  const paceSegments = useCreateStore((s) => s.paceSegments);
  // Task 74 — the human-like GPS plan.
  const wobbleSegments = useCreateStore((s) => s.wobbleSegments);
  // §EE 17.2 — the consent state re-runs the leg effect on grant.
  const routerConsent = useUiStore((s) => s.routerConsent);
  const spacingM = useCreateStore((s) => s.spacingM);

  const mapReady = map.status === "ready";
  const active = phase === "draw";
  // The line's remembered style — the whole-line FALLBACK for vertices
  // that carry no legStyle of their own (pre-fix and restored lines).
  const lineStyle = useCreateStore((s) => s.reconstruction.pathStyle ?? "off");

  // -- controller draw-session driving ----------------------------------------

  /*
   * The joins the controller renders with — STABLE identity: the
   * inputs that change (the legs, the line's fallback style) are read
   * from the store at CALL time, never captured. A path-style chip
   * switch rebuilds NOTHING: the draw session lives across mode
   * switches and the placed route never flickers, resets, or
   * re-resolves (the per-segment mode contract — the style only
   * decides how the NEXT segment generates).
   */
  const makeJoins = useCallback(
    (legs: readonly RoadLeg[]) => ({
      chainJoin: (nodes: readonly ChainNode[]) =>
        joinStyledChain(
          nodes,
          legs,
          useCreateStore.getState().reconstruction.pathStyle ?? "off",
        ),
      // No far anchor ever exists — no closing segment to join.
      closingJoin: null,
    }),
    [],
  );

  // Open/close the controller session with the phase (also fires once the
  // map becomes ready — startDrawSession defers internally until then).
  // Anchor-less: the chain is exactly the user's vertices.
  useEffect(() => {
    const controller: MapController | null = map.getController();
    if (!controller) return;
    if (!active) {
      controller.endDrawSession();
      return;
    }
    const store = useCreateStore.getState();
    controller.startDrawSession({
      gapId: "create/route",
      anchors: { before: null, after: null },
      vertices: store.reconstruction.vertices,
      snap: null,
      ...makeJoins(store.roadLegs),
      callbacks: {
        onVertexAdd: (position) =>
          useCreateStore.getState().addVertex(position),
        onVertexMove: (vertexId, position) =>
          useCreateStore.getState().moveVertex(vertexId, position),
        onVertexInsert: (index, position) =>
          useCreateStore.getState().insertVertex(index, position),
        onVertexDelete: (vertexId) =>
          useCreateStore.getState().deleteVertex(vertexId),
        // The Curve pen (user pass 48): simplify + commit as ONE undo step.
        onStrokeCommit: (points) => {
          const store = useCreateStore.getState();
          const budget = MAX_VERTICES - store.reconstruction.vertices.length;
          const nodes = simplifyStroke(points, {
            routing: store.pathStyle === "car" || store.pathStyle === "foot",
            budget,
          });
          if (nodes.length >= 2) store.commitStroke(nodes);
        },
        // Task 72 — Shift+click (Move mode) toggles the selection.
        onVertexSelectToggle: (vertexId) =>
          useCreateStore.getState().toggleVertexSelection(vertexId),
      },
    });
    // A session (re)start must never inherit a stale pointer mode —
    // endDrawSession resets the controller to pan, and the store may
    // still say draw (e.g. a path-style switch rebuilt the joins).
    controller.setPointerMode(useCreateStore.getState().pointerMode);
    controller.setPenMode(useCreateStore.getState().pen);
    // The store's selection outlives a session restart (retreats to the
    // form keep it) — re-push it so the handles repaint it.
    controller.setSelectedVertices([...useCreateStore.getState().selection]);
    return () => {
      controller.endDrawSession();
    };
  }, [active, mapReady, map.getController, makeJoins]);

  // Push every authoritative vertex change (and every resolved road leg)
  // into the controller — the store is the single source of truth.
  useEffect(() => {
    map.getController()?.updateDrawSession(vertices, makeJoins(roadLegs));
  }, [vertices, roadLegs, map.getController, makeJoins]);

  // Task 72 — the selection paints on the map (signal-filled handles).
  useEffect(() => {
    map.getController()?.setSelectedVertices([...selection]);
  }, [selection, map.getController, mapReady]);

  // -- road-follow leg resolution (snap to road) --------------------------------

  /*
   * Each pair asks under the profile of the segment it belongs to
   * (the per-segment mode contract): a chip switch never re-runs
   * this effect — placed segments keep their resolved legs; only a
   * vertex edit or a consent grant does.
   */
  const roadGeneration = useRef(0);

  useEffect(() => {
    const resetRouting = () => {
      const state = useCreateStore.getState();
      if (state.roadRouting.pending !== 0 || state.roadRouting.failed) {
        state.setRoadRouting({ pending: 0, failed: false });
      }
    };
    if (!active) {
      resetRouting();
      return;
    }
    const fallback =
      useCreateStore.getState().reconstruction.pathStyle ?? "off";
    const pairs: { a: LatLon; b: LatLon; mode: RoutableRoadMode }[] = [];
    for (let i = 1; i < vertices.length; i += 1) {
      const mode = routableOf(vertices[i].legStyle ?? fallback);
      if (mode) {
        pairs.push({
          a: { lat: vertices[i - 1].lat, lon: vertices[i - 1].lon },
          b: { lat: vertices[i].lat, lon: vertices[i].lon },
          mode,
        });
      }
    }
    if (pairs.length === 0) {
      const legs = useCreateStore.getState().roadLegs;
      if (legs.length > 0) useCreateStore.getState().setRoadLegs([]);
      resetRouting();
      return;
    }
    /* §EE 17.2 — the honest consent gate (the editor hook's twin). */
    const router = getRoadRouter();
    if (useUiStore.getState().routerConsent !== "granted") {
      const resolved: RoadLeg[] = [];
      for (const pair of pairs) {
        const leg = router.cached(pair.mode, pair.a, pair.b);
        if (leg) resolved.push(leg);
      }
      useCreateStore.getState().setRoadLegs(resolved);
      resetRouting();
      return;
    }
    const resolved: RoadLeg[] = [];
    const missing: typeof pairs = [];
    for (const pair of pairs) {
      const leg = router.cached(pair.mode, pair.a, pair.b);
      if (leg) resolved.push(leg);
      else missing.push(pair);
    }
    useCreateStore.getState().setRoadLegs(resolved);
    useCreateStore.getState().setRoadRouting({
      pending: missing.length,
      failed: false,
    });
    if (missing.length === 0) return;
    const generation = (roadGeneration.current += 1);
    let pending = missing.length;
    for (const pair of missing) {
      void router.segment(pair.mode, pair.a, pair.b).then((leg) => {
        if (roadGeneration.current !== generation) return; // stale
        const state = useCreateStore.getState();
        if (state.phase !== "draw") {
          return;
        }
        // A STYLE SWITCH DOES NOT invalidate — the leg belongs to its
        // own segment, whichever chip is active now.
        pending -= 1;
        if (leg) {
          state.setRoadLegs([...state.roadLegs, leg]);
          state.setRoadRouting({ pending, failed: false });
        } else {
          state.setRoadRouting({ pending, failed: true });
        }
      });
    }
  }, [active, vertices, routerConsent]);

  // Pointer mode (Draw / Move / Pan — Task 45) and the pen (user pass
  // 48) → controller handlers.
  useEffect(() => {
    map.getController()?.setPointerMode(pointerMode);
  }, [pointerMode, map.getController, mapReady]);

  useEffect(() => {
    map.getController()?.setPenMode(pen);
  }, [pen, map.getController, mapReady]);

  // Keyboard accelerators (QoL): D = draw, M = move, P = pan — active only
  // while drawing, never while typing in a form control (the shared
  // contract). Task 72 adds the loop-repeat pair: Ctrl/Cmd+C copies the
  // selection, Ctrl/Cmd+V pastes — claimed ONLY when they would do
  // something, so the browser's own copy stays untouched otherwise.
  useEffect(() => {
    if (!active) return;
    const onKeydown = (event: KeyboardEvent) => {
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
      if (event.metaKey || event.ctrlKey) {
        if (key === "c") {
          const store = useCreateStore.getState();
          if (store.selection.size > 0) {
            event.preventDefault();
            store.copySelection();
          }
        } else if (key === "v") {
          const store = useCreateStore.getState();
          if (
            store.clipboard.length > 0 &&
            store.reconstruction.vertices.length < MAX_VERTICES
          ) {
            event.preventDefault();
            store.pasteClipboard();
          }
        }
        return;
      }
      if (event.altKey) return;
      if (key === "d") {
        event.preventDefault();
        useCreateStore.getState().setPointerMode("draw");
      } else if (key === "m") {
        event.preventDefault();
        useCreateStore.getState().setPointerMode("move");
      } else if (key === "p") {
        event.preventDefault();
        useCreateStore.getState().setPointerMode("pan");
      } else if (key === "c") {
        // Pen toggle (user pass 48) — a Draw-mode concern ONLY (user
        // pass 52): toggling the pen while the pointer is in Move or
        // Pan would read as "drawing came back on" when it did not.
        if (useCreateStore.getState().pointerMode !== "draw") return;
        event.preventDefault();
        const store = useCreateStore.getState();
        store.setPenMode(store.pen === "curve" ? "default" : "curve");
      }
    };
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [active]);

  // -- derived view data --------------------------------------------------------

  // The drawn distance runs over the RENDERED path (road legs
  // included): the number the line draws is the number the badge and the
  // reconciliation show (WYSIWYG honesty) — each segment under the style
  // it was drawn with.
  const distanceM = useMemo(() => {
    if (vertices.length < 2) return vertices.length === 1 ? 0 : null;
    const nodes: ChainNode[] = vertices.map((vertex) => ({
      lat: vertex.lat,
      lon: vertex.lon,
      ...(vertex.legStyle !== undefined
        ? { legStyle: vertex.legStyle }
        : {}),
    }));
    return polylineLengthMeters(makeJoins(roadLegs).chainJoin(nodes).points);
  }, [vertices, roadLegs, makeJoins]);

  // Task 73 — every vertex's cumulative distance along the drawn chain
  // (the same pure resample the final track builds on: road legs and
  // curve splines included, vertices kept exactly). The pace plan's
  // spans and distances hang off this one map, so the panel's numbers
  // and the review's timeline can never disagree about where a stretch
  // starts or ends.
  const vertexCumM = useMemo(() => {
    const cum = new Map<VertexId, number>();
    if (vertices.length < 2) return cum;
    const path = resamplePath(
      null,
      vertices,
      null,
      spacingM,
      roadLegs,
      useCreateStore.getState().reconstruction.pathStyle ?? "off",
    );
    for (const point of path) {
      if (point.vertexId !== undefined && !cum.has(point.vertexId)) {
        cum.set(point.vertexId, point.cumDistanceM);
      }
    }
    return cum;
  }, [vertices, roadLegs, spacingM]);

  // The segments' span distances + chain indices (route order views).
  const paceSegmentDistances = useMemo(() => {
    const distances = new Map<string, number>();
    for (const segment of paceSegments) {
      const fromM = vertexCumM.get(segment.fromVertexId);
      const toM = vertexCumM.get(segment.toVertexId);
      if (fromM !== undefined && toM !== undefined && toM > fromM) {
        distances.set(segment.id, toM - fromM);
      }
    }
    return distances;
  }, [paceSegments, vertexCumM]);

  const paceSegmentIndices = useMemo(() => {
    const indices = new Map<string, [number, number]>();
    paceSegments.forEach((segment) => {
      const from = vertices.findIndex((v) => v.id === segment.fromVertexId);
      const to = vertices.findIndex((v) => v.id === segment.toVertexId);
      if (from !== -1 && to !== -1 && from < to) indices.set(segment.id, [from, to]);
    });
    return indices;
  }, [paceSegments, vertices]);

  // Task 74 — the wobble plan's span distances + chain indices (the
  // pace views' arithmetic, one implementation each).
  const wobbleSegmentDistances = useMemo(() => {
    const distances = new Map<string, number>();
    for (const segment of wobbleSegments) {
      const fromM = vertexCumM.get(segment.fromVertexId);
      const toM = vertexCumM.get(segment.toVertexId);
      if (fromM !== undefined && toM !== undefined && toM > fromM) {
        distances.set(segment.id, toM - fromM);
      }
    }
    return distances;
  }, [wobbleSegments, vertexCumM]);

  const wobbleSegmentIndices = useMemo(() => {
    const indices = new Map<string, [number, number]>();
    wobbleSegments.forEach((segment) => {
      const from = vertices.findIndex((v) => v.id === segment.fromVertexId);
      const to = vertices.findIndex((v) => v.id === segment.toVertexId);
      if (from !== -1 && to !== -1 && from < to) indices.set(segment.id, [from, to]);
    });
    return indices;
  }, [wobbleSegments, vertices]);

  // The selection as a plannable run — the same contiguous rule the
  // pace input enforces (scattered selections plan nothing).
  const selectionPaceSpan = useMemo(() => {
    const span = contiguousSelectionSpan(vertices, selection);
    if (!span) return null;
    const fromM = vertexCumM.get(span.fromVertexId) ?? 0;
    const toM = vertexCumM.get(span.toVertexId) ?? 0;
    return { ...span, distanceM: Math.max(0, toM - fromM) };
  }, [vertices, selection, vertexCumM]);

  // -- intents -------------------------------------------------------------------

  const setPointerMode = useCallback((mode: PointerMode) => {
    useCreateStore.getState().setPointerMode(mode);
  }, []);

  const setPenMode = useCallback((pen: PenMode) => {
    useCreateStore.getState().setPenMode(pen);
  }, []);

  const setPathStyle = useCallback((mode: PathStyle) => {
    useCreateStore.getState().setPathStyle(mode);
  }, []);

  const setResampleSpacing = useCallback((spacing: number | "off") => {
    useCreateStore.getState().setSpacing(spacing);
  }, []);

  const undo = useCallback(() => useCreateStore.getState().undo(), []);
  const redo = useCallback(() => useCreateStore.getState().redo(), []);
  const clearVertices = useCallback(
    () => useCreateStore.getState().clearVertices(),
    [],
  );
  const deleteVertex = useCallback((vertexId: VertexId) => {
    useCreateStore.getState().deleteVertex(vertexId);
  }, []);

  const toggleVertexSelection = useCallback((vertexId: VertexId) => {
    useCreateStore.getState().toggleVertexSelection(vertexId);
  }, []);
  const selectVertexRange = useCallback(
    (fromVertexId: VertexId, toVertexId: VertexId) => {
      useCreateStore.getState().selectVertexRange(fromVertexId, toVertexId);
    },
    [],
  );
  const selectAllVertices = useCallback(() => {
    useCreateStore.getState().selectAllVertices();
  }, []);
  const clearSelection = useCallback(() => {
    useCreateStore.getState().clearSelection();
  }, []);
  const copySelection = useCallback(() => {
    useCreateStore.getState().copySelection();
  }, []);
  const pasteClipboard = useCallback(() => {
    useCreateStore.getState().pasteClipboard();
  }, []);

  const applyPaceSegment = useCallback(
    (fromVertexId: VertexId, toVertexId: VertexId, paceMsPerMeter: number) => {
      useCreateStore
        .getState()
        .applyPaceSegment(fromVertexId, toVertexId, paceMsPerMeter);
    },
    [],
  );
  const updatePaceSegment = useCallback((id: string, paceMsPerMeter: number) => {
    useCreateStore.getState().updatePaceSegment(id, paceMsPerMeter);
  }, []);
  const removePaceSegment = useCallback((id: string) => {
    useCreateStore.getState().removePaceSegment(id);
  }, []);

  const applyWobble = useCallback(
    (
      fromVertexId: VertexId,
      toVertexId: VertexId,
      intensity: WobbleSegment["intensity"],
    ) => {
      useCreateStore.getState().applyWobble(fromVertexId, toVertexId, intensity);
    },
    [],
  );
  const removeWobbleSegment = useCallback((id: string) => {
    useCreateStore.getState().removeWobbleSegment(id);
  }, []);

  const finishRoute = useCallback(() => {
    useCreateStore.getState().finishRoute();
  }, []);

  return {
    active,
    pointerMode,
    pen,
    distanceM,
    vertexCount: vertices.length,
    maxVertices: MAX_VERTICES,
    pickMode: null,
    setPointerMode,
    setPenMode,
    vertices,
    atVertexCap: vertices.length >= MAX_VERTICES,
    canUndo: history.undo.length > 0,
    canRedo: history.redo.length > 0,
    undoCount: history.undo.length,
    redoCount: history.redo.length,
    pathStyle,
    routingPending: roadRouting.pending > 0,
    routingFailed: roadRouting.failed,
    routingNeedsConsent:
      routerConsent !== "granted" &&
      (routableOf(pathStyle) !== null ||
        vertices.some(
          (vertex) => routableOf(vertex.legStyle ?? lineStyle) !== null,
        )),
    routerConsent,
    requestRoadConsent: requestRouterConsent,
    resampleSpacing: spacingM,
    setPathStyle,
    setResampleSpacing,
    undo,
    redo,
    clearVertices,
    deleteVertex,
    selection,
    selectedCount: selection.size,
    clipboardCount: clipboard.length,
    canCopy: selection.size > 0,
    canPaste: clipboard.length > 0 && vertices.length < MAX_VERTICES,
    toggleVertexSelection,
    selectVertexRange,
    selectAllVertices,
    clearSelection,
    copySelection,
    pasteClipboard,
    paceSegments,
    paceSegmentDistances,
    paceSegmentIndices,
    selectionPaceSpan,
    applyPaceSegment,
    updatePaceSegment,
    removePaceSegment,
    wobbleSegments,
    wobbleSegmentDistances,
    wobbleSegmentIndices,
    applyWobble,
    removeWobbleSegment,
    finishRoute,
    canFinish: vertices.length >= 2 && (distanceM ?? 0) > 0,
  };
}
