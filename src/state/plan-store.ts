/**
 * Plan store — the state container of the "plan a route" section (the
 * route-planner scratchpad, Task 50).
 *
 * The sixth fully independent workflow session (after the repair
 * studio's `session-store`/`editor-store`, the Gap Recovery section's
 * `recovery-store`, the create section's `create-store`, and the merge
 * section's `merge-store`): no file is ever uploaded here and NO file
 * is ever produced — the section's whole contract is draw → read the
 * estimates → discard. There is deliberately:
 *
 *   - no export slice (no track building, no spacing, no distance
 *     basis — nothing to build a file from);
 *   - no share slice (no view split, no share dialog);
 *   - no stats entry (unlike create, the planner takes no inputs up
 *     front — the route IS the input, and the time for the pace math
 *     arrives whenever the user feels like entering it).
 *
 * The editor slice is the SAME compact mirror the create store uses:
 * the pure `features/reconstruction/drawModel` commands (one
 * implementation of every drawing edit, four independent consumers
 * now), one pseudo-reconstruction keyed by `PLAN_ROUTE_ID`, the
 * road-follow side table, and the settings that are never undoable
 * (the path style, the pen, the pointer mode). The one addition is
 * `plannedTimeMs` — the goal time the pace calculator runs on, a
 * transient setting like the others (never undoable, never persisted).
 *
 * Zustand plain-object store, usable outside React (unit tests included).
 */

import { create } from "zustand";
import {
  addVertexCommand,
  clearVerticesCommand,
  commitCommand,
  deleteVertexCommand,
  EMPTY_HISTORY,
  emptyReconstruction,
  insertVertexCommand,
  MAX_VERTICES,
  moveVertexCommand,
  redoCommand,
  undoCommand,
  type DrawCommand,
  type DrawHistory,
  type VertexPosition,
} from "@/features/reconstruction/drawModel";
import { PLAN_ROUTE_ID } from "@/features/plan/estimate";
import type { PlanSessionHydration } from "@/lib/storage/session-record";
import type {
  DrawVertex,
  PenMode,
  PathStyle,
  PointerMode,
  RoadLeg,
  VertexId,
} from "@/types/domain";
import { vertexId } from "@/types/ids";

/** The workflow's two phases: idle (landing) or the studio (drawing). */
export type PlanPhase = "idle" | "studio";

function initialReconstruction() {
  return emptyReconstruction(PLAN_ROUTE_ID);
}

interface PlanState {
  // -- phase -------------------------------------------------------------------
  phase: PlanPhase;
  /** Enter the studio from the landing page's "Start planning" intent. */
  beginPlanning: () => void;
  /** Full reset — leave the studio, clear the route (the header's "Start over"). */
  reset: () => void;
  /**
   * Phase 10 — session recovery: adopt a stored plan (the drawn route +
   * the entered goal time). The session token bumps (a fresh elevation
   * signature); history is not restored — the undo stack spans one
   * editor session by design.
   */
  hydrate: (payload: PlanSessionHydration) => void;

  /**
   * The goal time the pace calculator runs on (ms), or `null` while no
   * usable time has been entered. A transient setting — never undoable,
   * never persisted; the pace it produces is a PLAN, not a measurement.
   */
  plannedTimeMs: number | null;
  setPlannedTime: (ms: number | null) => void;

  // -- route slice (the drawn chain) -----------------------------------------
  reconstruction: ReturnType<typeof initialReconstruction>;
  /**
   * Monotonic session token — bumped by every full reset. Part of the
   * elevation freshness signature: two different routes can land on the
   * same geometryRevision/legs/style tuple, but never on the same token.
   */
  sessionSeq: number;
  history: DrawHistory;
  /** Monotonic vertex-id allocator (never reused within a session). */
  vertexSeq: number;
  /** Resolved road legs of the chain (derived side table; hook-written). */
  roadLegs: readonly RoadLeg[];
  /** Road-routing status of the chain (pending count + failure). */
  roadRouting: { pending: number; failed: boolean };
  pointerMode: PointerMode;
  /** The draw-mode pen (user pass 48): default clicks, curve strokes. */
  pen: PenMode;
  /**
   * The route's path style (Tasks 46–47): road / footpath / straight —
   * the planner offers exactly the three per-line styles, freely
   * combinable with either pen.
   */
  pathStyle: PathStyle;

  setPointerMode: (mode: PointerMode) => void;
  setPenMode: (pen: PenMode) => void;
  setPathStyle: (mode: PathStyle) => void;
  /** Replace the resolved road legs (no-op when unchanged). */
  setRoadLegs: (legs: readonly RoadLeg[]) => void;
  setRoadRouting: (status: { pending: number; failed: boolean }) => void;

  addVertex: (position: VertexPosition) => void;
  insertVertex: (index: number, position: VertexPosition) => void;
  moveVertex: (vertexId: VertexId, to: VertexPosition) => void;
  deleteVertex: (vertexId: VertexId) => void;
  /**
   * Commit one freehand stroke (Curve pen, user pass 48): append the
   * processed nodes as ONE `set-vertices` command — a single undo step
   * removes the whole stroke. A local ("off") route flips to "curve" so
   * the Task-46 spline smooths it; routed routes keep their routing.
   */
  commitStroke: (points: readonly { lat: number; lon: number }[]) => void;
  clearVertices: () => void;
  undo: () => void;
  redo: () => void;
}

const INITIAL = {
  phase: "idle" as PlanPhase,
  plannedTimeMs: null as number | null,

  reconstruction: initialReconstruction(),
  history: EMPTY_HISTORY,
  vertexSeq: 0,
  sessionSeq: 0,
  roadLegs: [] as readonly RoadLeg[],
  roadRouting: { pending: 0, failed: false },
  pointerMode: "draw" as PointerMode,
  pen: "default" as PenMode,
  pathStyle: "car" as PathStyle,
};

export const usePlanStore = create<PlanState>()((set, get) => ({
  ...INITIAL,

  beginPlanning: () =>
    set({
      phase: "studio",
      // A fresh entry starts on the map ready to click (the same
      // contract as every other editor's opener).
      pointerMode: "draw",
    }),

  reset: () =>
    set((state) => ({
      ...INITIAL,
      sessionSeq: state.sessionSeq + 1,
      reconstruction: initialReconstruction(),
    })),

  hydrate: (payload) =>
    set((state) => ({
      phase: "studio" as PlanPhase,
      plannedTimeMs: payload.plannedTimeMs,
      reconstruction: payload.reconstruction,
      roadLegs: payload.roadLegs,
      vertexSeq: payload.vertexSeq,
      // The chips adopt the style the route was drawn with; the studio
      // reopens ready to draw.
      pathStyle: payload.reconstruction.pathStyle ?? state.pathStyle,
      pointerMode: "draw" as PointerMode,
      history: EMPTY_HISTORY,
      roadRouting: { pending: 0, failed: false },
      sessionSeq: state.sessionSeq + 1,
    })),

  setPlannedTime: (plannedTimeMs) => set({ plannedTimeMs }),

  setPointerMode: (pointerMode) => set({ pointerMode }),
  setPenMode: (pen) => set({ pen }),

  setPathStyle: (pathStyle) =>
    set((state) => {
      // The drawn route remembers its style (a settings change — the
      // geometryRevision and so the elevation signature inputs stay
      // covered by the style the signature carries).
      const recon = state.reconstruction;
      if (recon.pathStyle === pathStyle) {
        return state.pathStyle === pathStyle ? state : { pathStyle };
      }
      return {
        pathStyle,
        reconstruction: { ...recon, pathStyle },
      };
    }),

  setRoadLegs: (legs) =>
    set((state) => {
      const current = state.roadLegs;
      const unchanged =
        current.length === legs.length &&
        current.every((leg, index) => leg === legs[index]);
      if (unchanged) return state;
      return { roadLegs: legs };
    }),

  setRoadRouting: (roadRouting) => set({ roadRouting }),

  addVertex: (position) => {
    const state = get();
    const seq = state.vertexSeq + 1;
    const command = addVertexCommand(
      state.reconstruction,
      position,
      vertexId(seq),
    );
    if (!command) return;
    const next = commitCommand(
      { reconstruction: state.reconstruction, history: state.history },
      command,
    );
    set({
      vertexSeq: seq,
      reconstruction: next.reconstruction,
      history: next.history,
    });
  },

  insertVertex: (index, position) => {
    const state = get();
    const seq = state.vertexSeq + 1;
    const command = insertVertexCommand(
      state.reconstruction,
      index,
      position,
      vertexId(seq),
    );
    if (!command) return;
    const next = commitCommand(
      { reconstruction: state.reconstruction, history: state.history },
      command,
    );
    set({
      vertexSeq: seq,
      reconstruction: next.reconstruction,
      history: next.history,
    });
  },

  moveVertex: (vertexId, to) => {
    const state = get();
    const command = moveVertexCommand(state.reconstruction, vertexId, to);
    if (!command) return;
    const next = commitCommand(
      { reconstruction: state.reconstruction, history: state.history },
      command,
    );
    set({ reconstruction: next.reconstruction, history: next.history });
  },

  deleteVertex: (vertexId) => {
    const state = get();
    const command = deleteVertexCommand(state.reconstruction, vertexId);
    if (!command) return;
    const next = commitCommand(
      { reconstruction: state.reconstruction, history: state.history },
      command,
    );
    set({ reconstruction: next.reconstruction, history: next.history });
  },

  commitStroke: (points) => {
    const state = get();
    if (state.phase !== "studio" || points.length === 0) return;
    const current = state.reconstruction;
    const budget = MAX_VERTICES - current.vertices.length;
    if (budget < 2) return; // a stroke is a curve — it needs two nodes minimum
    let seq = state.vertexSeq;
    const added = points.slice(0, budget).map((point) => {
      seq += 1;
      return {
        id: vertexId(seq),
        lat: point.lat,
        lon: point.lon,
      };
    });
    const command: DrawCommand = {
      kind: "set-vertices",
      previous: current.vertices,
      next: [...current.vertices, ...added],
    };
    const next = commitCommand(
      { reconstruction: current, history: state.history },
      command,
    );
    if (next.reconstruction === current) return;
    set({
      vertexSeq: seq,
      reconstruction: next.reconstruction,
      history: next.history,
    });
    // The curve pen's signature: a local straight route becomes a smooth
    // curve route (the spline). Routed styles keep the router's geometry.
    const style = next.reconstruction.pathStyle;
    if (style === undefined || style === "off") {
      get().setPathStyle("curve");
    }
  },

  clearVertices: () => {
    const state = get();
    const command = clearVerticesCommand(state.reconstruction);
    if (!command) return;
    const next = commitCommand(
      { reconstruction: state.reconstruction, history: state.history },
      command,
    );
    set({ reconstruction: next.reconstruction, history: next.history });
  },

  undo: () => {
    const state = get();
    const next = undoCommand({
      reconstruction: state.reconstruction,
      history: state.history,
    });
    set({ reconstruction: next.reconstruction, history: next.history });
  },

  redo: () => {
    const state = get();
    const next = redoCommand({
      reconstruction: state.reconstruction,
      history: state.history,
    });
    set({ reconstruction: next.reconstruction, history: next.history });
  },
}));

/** The vertices of the drawn chain (convenience selector). */
export function planVertices(
  state: Pick<PlanState, "reconstruction">,
): readonly DrawVertex[] {
  return state.reconstruction.vertices;
}
