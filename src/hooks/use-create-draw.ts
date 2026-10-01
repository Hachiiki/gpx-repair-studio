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
import { joinCurveChain, joinDrawChain } from "@/features/reconstruction/roadFollow";
import { simplifyStroke } from "@/features/reconstruction/stroke";
import { polylineLengthMeters } from "@/lib/geo/geodesy";
import type { MapController } from "@/lib/map/mapController";
import { getRoadRouter } from "@/hooks/use-draw-editor";
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
  resampleSpacing: number | "off";

  setPathStyle: (mode: PathStyle) => void;
  setResampleSpacing: (spacing: number | "off") => void;
  undo: () => void;
  redo: () => void;
  clearVertices: () => void;
  deleteVertex: (vertexId: VertexId) => void;

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
  const spacingM = useCreateStore((s) => s.spacingM);

  const mapReady = map.status === "ready";
  const active = phase === "draw";

  // -- controller draw-session driving ----------------------------------------

  const makeJoins = useCallback(
    (legs: readonly RoadLeg[]) => ({
      // Task 46: the curve style joins through the local spline.
      chainJoin: (nodes: readonly LatLon[]) =>
        pathStyle === "curve"
          ? joinCurveChain(nodes)
          : joinDrawChain(nodes, legs),
      // No far anchor ever exists — no closing segment to join.
      closingJoin: null,
    }),
    [pathStyle],
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
      },
    });
    // A session (re)start must never inherit a stale pointer mode —
    // endDrawSession resets the controller to pan, and the store may
    // still say draw (e.g. a path-style switch rebuilt the joins).
    controller.setPointerMode(useCreateStore.getState().pointerMode);
    controller.setPenMode(useCreateStore.getState().pen);
    return () => {
      controller.endDrawSession();
    };
  }, [active, mapReady, map.getController, makeJoins]);

  // Push every authoritative vertex change (and every resolved road leg)
  // into the controller — the store is the single source of truth.
  useEffect(() => {
    map.getController()?.updateDrawSession(vertices, makeJoins(roadLegs));
  }, [vertices, roadLegs, map.getController, makeJoins]);

  // -- road-follow leg resolution (snap to road) --------------------------------

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
    if (pathStyle !== "car" && pathStyle !== "foot") {
      const legs = useCreateStore.getState().roadLegs;
      if (legs.length > 0) useCreateStore.getState().setRoadLegs([]);
      resetRouting();
      return;
    }
    const nodes: LatLon[] = vertices.map((vertex) => ({
      lat: vertex.lat,
      lon: vertex.lon,
    }));
    const pairs: { a: LatLon; b: LatLon }[] = [];
    for (let i = 0; i + 1 < nodes.length; i += 1) {
      pairs.push({ a: nodes[i], b: nodes[i + 1] });
    }
    const router = getRoadRouter();
    const resolved: RoadLeg[] = [];
    const missing: { a: LatLon; b: LatLon }[] = [];
    for (const pair of pairs) {
      const leg = router.cached(pathStyle, pair.a, pair.b);
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
      void router.segment(pathStyle, pair.a, pair.b).then((leg) => {
        if (roadGeneration.current !== generation) return; // stale
        const state = useCreateStore.getState();
        if (state.phase !== "draw" || state.pathStyle !== pathStyle) {
          return;
        }
        pending -= 1;
        if (leg) {
          state.setRoadLegs([...state.roadLegs, leg]);
          state.setRoadRouting({ pending, failed: false });
        } else {
          state.setRoadRouting({ pending, failed: true });
        }
      });
    }
  }, [active, vertices, pathStyle]);

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
  // contract).
  useEffect(() => {
    if (!active) return;
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

  // The drawn distance runs over the RENDERED path (road legs included):
  // the number the line draws is the number the badge and the
  // reconciliation show (WYSIWYG honesty).
  const distanceM = useMemo(() => {
    if (vertices.length < 2) return vertices.length === 1 ? 0 : null;
    const nodes: LatLon[] = vertices.map((vertex) => ({
      lat: vertex.lat,
      lon: vertex.lon,
    }));
    return polylineLengthMeters(makeJoins(roadLegs).chainJoin(nodes).points);
  }, [vertices, roadLegs, makeJoins]);

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
    routingFailed: roadRouting.failed && pathStyle !== "off" && pathStyle !== "curve",
    resampleSpacing: spacingM,
    setPathStyle,
    setResampleSpacing,
    undo,
    redo,
    clearVertices,
    deleteVertex,
    finishRoute,
    canFinish: vertices.length >= 2 && (distanceM ?? 0) > 0,
  };
}
