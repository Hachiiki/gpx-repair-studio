/**
 * usePlanDraw — the React binding for the "plan a route" section's
 * route editor.
 *
 * A deliberate mirror of the create section's draw hook (the closest
 * sibling: no anchors, no snap targets — the first click IS the route's
 * start), bound to the plan store, with the review/export machinery
 * removed: the planner has no finish (the estimates are live), no
 * spacing (no track is generated), and no output of any kind. The
 * shared logic is the SAME pure modules every section consumes
 * (drawModel commands, the road-follow router + chain joins, the
 * stroke simplifier, the vertex cap) — one implementation of every
 * drawing edit, four independent stores.
 *
 * "Plan a route" section. Client-side hook.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { MAX_VERTICES } from "@/features/reconstruction/drawModel";
import { joinCurveChain, joinDrawChain } from "@/features/reconstruction/roadFollow";
import { simplifyStroke } from "@/features/reconstruction/stroke";
import { planJoin } from "@/features/plan/estimate";
import type { MapController } from "@/lib/map/mapController";
import { getRoadRouter } from "@/hooks/use-draw-editor";
import { usePlanStore } from "@/state/plan-store";
import type {
  DrawVertex,
  LatLon,
  PathStyle,
  PenMode,
  PointerMode,
  RoadLeg,
  VertexId,
} from "@/types/domain";
import type { PlanMapBinding } from "@/hooks/use-plan-map";

/** The planner's editor view (consumed by PlanDrawPanel + MapCanvas). */
export interface PlanDrawBinding {
  // -- MapCanvas chrome (the MapDrawChromeBinding subset) --------------------
  /** The planning studio is active (chrome + panel visible). */
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

  setPathStyle: (mode: PathStyle) => void;
  undo: () => void;
  redo: () => void;
  clearVertices: () => void;
  deleteVertex: (vertexId: VertexId) => void;
}

export function usePlanDraw(map: PlanMapBinding): PlanDrawBinding {
  const phase = usePlanStore((s) => s.phase);
  const pointerMode = usePlanStore((s) => s.pointerMode);
  const pen = usePlanStore((s) => s.pen);
  const pathStyle = usePlanStore((s) => s.pathStyle);
  const roadLegs = usePlanStore((s) => s.roadLegs);
  const roadRouting = usePlanStore((s) => s.roadRouting);
  const vertices = usePlanStore((s) => s.reconstruction.vertices);
  const history = usePlanStore((s) => s.history);

  const mapReady = map.status === "ready";
  const active = phase === "studio";

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
    const store = usePlanStore.getState();
    controller.startDrawSession({
      gapId: "plan/route",
      anchors: { before: null, after: null },
      vertices: store.reconstruction.vertices,
      snap: null,
      ...makeJoins(store.roadLegs),
      callbacks: {
        onVertexAdd: (position) => usePlanStore.getState().addVertex(position),
        onVertexMove: (vertexId, position) =>
          usePlanStore.getState().moveVertex(vertexId, position),
        onVertexInsert: (index, position) =>
          usePlanStore.getState().insertVertex(index, position),
        onVertexDelete: (vertexId) =>
          usePlanStore.getState().deleteVertex(vertexId),
        // The Curve pen (user pass 48): simplify + commit as ONE undo step.
        onStrokeCommit: (points) => {
          const store = usePlanStore.getState();
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
    controller.setPointerMode(usePlanStore.getState().pointerMode);
    controller.setPenMode(usePlanStore.getState().pen);
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
      const state = usePlanStore.getState();
      if (state.roadRouting.pending !== 0 || state.roadRouting.failed) {
        state.setRoadRouting({ pending: 0, failed: false });
      }
    };
    if (!active) {
      resetRouting();
      return;
    }
    if (pathStyle !== "car" && pathStyle !== "foot") {
      const legs = usePlanStore.getState().roadLegs;
      if (legs.length > 0) usePlanStore.getState().setRoadLegs([]);
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
    usePlanStore.getState().setRoadLegs(resolved);
    usePlanStore.getState().setRoadRouting({
      pending: missing.length,
      failed: false,
    });
    if (missing.length === 0) return;
    const generation = (roadGeneration.current += 1);
    let pending = missing.length;
    for (const pair of missing) {
      void router.segment(pathStyle, pair.a, pair.b).then((leg) => {
        if (roadGeneration.current !== generation) return; // stale
        const state = usePlanStore.getState();
        if (state.phase !== "studio" || state.pathStyle !== pathStyle) {
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

  // Keyboard accelerators (QoL): D = draw, M = move, P = pan, C = pen —
  // active only while planning, never while typing in a form control
  // (the shared contract — the pace calculator's inputs must not eat
  // keystrokes or be eaten by them).
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
        usePlanStore.getState().setPointerMode("draw");
      } else if (key === "m") {
        event.preventDefault();
        usePlanStore.getState().setPointerMode("move");
      } else if (key === "p") {
        event.preventDefault();
        usePlanStore.getState().setPointerMode("pan");
      } else if (key === "c") {
        event.preventDefault();
        const store = usePlanStore.getState();
        store.setPenMode(store.pen === "curve" ? "default" : "curve");
      }
    };
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [active]);

  // -- derived view data --------------------------------------------------------

  // The planned distance runs over the RENDERED path (road legs
  // included): the number the line draws is the number the badge, the
  // estimates card, and the pace math all use (WYSIWYG honesty).
  const distanceM = useMemo(() => {
    if (vertices.length < 2) return vertices.length === 1 ? 0 : null;
    return planJoin(vertices, roadLegs, pathStyle).distanceM;
  }, [vertices, roadLegs, pathStyle]);

  // -- intents -------------------------------------------------------------------

  const setPointerMode = useCallback((mode: PointerMode) => {
    usePlanStore.getState().setPointerMode(mode);
  }, []);

  const setPenMode = useCallback((pen: PenMode) => {
    usePlanStore.getState().setPenMode(pen);
  }, []);

  const setPathStyle = useCallback((mode: PathStyle) => {
    usePlanStore.getState().setPathStyle(mode);
  }, []);

  const undo = useCallback(() => usePlanStore.getState().undo(), []);
  const redo = useCallback(() => usePlanStore.getState().redo(), []);
  const clearVertices = useCallback(
    () => usePlanStore.getState().clearVertices(),
    [],
  );
  const deleteVertex = useCallback((vertexId: VertexId) => {
    usePlanStore.getState().deleteVertex(vertexId);
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
    setPathStyle,
    undo,
    redo,
    clearVertices,
    deleteVertex,
  };
}
