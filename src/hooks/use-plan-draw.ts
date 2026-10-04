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
import {
  joinStyledChain,
  routableOf,
  type ChainNode,
  type RoutableRoadMode,
} from "@/features/reconstruction/roadFollow";
import { simplifyStroke } from "@/features/reconstruction/stroke";
import { planJoin } from "@/features/plan/estimate";
import type { MapController } from "@/lib/map/mapController";
import { getRoadRouter } from "@/hooks/road-router";
import { requestRouterConsent } from "@/hooks/road-router";
import { useUiStore, type RouterConsent } from "@/state/ui-store";
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
  /** §EE 17.2: routing is on but this session has not consented yet. */
  routingNeedsConsent: boolean;
  /** §EE 17.2: the session's consent state (never persisted). */
  routerConsent: RouterConsent;
  /** §EE 17.2: open the consent dialog (the enable notice's button). */
  requestRoadConsent: () => void;

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
  // §EE 17.2 — the consent state re-runs the leg effect on grant.
  const routerConsent = useUiStore((s) => s.routerConsent);

  const mapReady = map.status === "ready";
  const active = phase === "studio";
  // The line's remembered style — the whole-line FALLBACK for vertices
  // that carry no legStyle of their own (pre-fix and restored lines).
  const lineStyle = usePlanStore((s) => s.reconstruction.pathStyle ?? "off");

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
          usePlanStore.getState().reconstruction.pathStyle ?? "off",
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

  /*
   * Each pair asks under the profile of the segment it belongs to
   * (the per-segment mode contract): a chip switch never re-runs
   * this effect — placed segments keep their resolved legs; only a
   * vertex edit or a consent grant does.
   */
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
    const fallback = usePlanStore.getState().reconstruction.pathStyle ?? "off";
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
      const legs = usePlanStore.getState().roadLegs;
      if (legs.length > 0) usePlanStore.getState().setRoadLegs([]);
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
      usePlanStore.getState().setRoadLegs(resolved);
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
    usePlanStore.getState().setRoadLegs(resolved);
    usePlanStore.getState().setRoadRouting({
      pending: missing.length,
      failed: false,
    });
    if (missing.length === 0) return;
    const generation = (roadGeneration.current += 1);
    let pending = missing.length;
    for (const pair of missing) {
      void router.segment(pair.mode, pair.a, pair.b).then((leg) => {
        if (roadGeneration.current !== generation) return; // stale
        const state = usePlanStore.getState();
        if (state.phase !== "studio") {
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
        // Pen toggle (user pass 48) — a Draw-mode concern ONLY (user
        // pass 52): toggling the pen while the pointer is in Move or
        // Pan would read as "drawing came back on" when it did not.
        if (usePlanStore.getState().pointerMode !== "draw") return;
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
  // estimates card, and the pace math all use (WYSIWYG honesty) — each
  // segment under the style it was drawn with.
  const distanceM = useMemo(() => {
    if (vertices.length < 2) return vertices.length === 1 ? 0 : null;
    return planJoin(vertices, roadLegs, lineStyle).distanceM;
  }, [vertices, roadLegs, lineStyle]);

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
    routingFailed: roadRouting.failed,
    routingNeedsConsent:
      routerConsent !== "granted" &&
      (routableOf(pathStyle) !== null ||
        vertices.some(
          (vertex) => routableOf(vertex.legStyle ?? lineStyle) !== null,
        )),
    routerConsent,
    requestRoadConsent: requestRouterConsent,
    setPathStyle,
    undo,
    redo,
    clearVertices,
    deleteVertex,
  };
}
