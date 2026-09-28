/**
 * Create store — the state container of the "Create from activity stats"
 * section (a watch that recorded the workout statistics but no GPS map).
 *
 * The third fully independent workflow session (after the repair studio's
 * `session-store`/`editor-store` and the Gap Recovery section's
 * `recovery-store`): no file is ever uploaded here, so there is no session
 * slice at all — the workflow runs in three phases around one stats entry
 * and one user-drawn route:
 *
 *   form   → the landing page's statistics entry (ActivityStatsForm)
 *   draw   → the map workspace: the user draws the whole route
 *   review → reconciliation + summary + export
 *
 * The editor slice is a compact mirror of the recovery store's: the SAME
 * pure `features/reconstruction/drawModel` commands (one implementation of
 * every drawing edit, three independent stores), one pseudo-reconstruction
 * keyed by `CREATE_ROUTE_ID`, the road-follow side table, and the settings
 * that are never undoable (spacing, road-follow mode, the reconciliation
 * choice). Time strategy machinery is deliberately absent — the duration
 * comes from the entered statistics, full stop. The distance basis is the
 * DRAWN route by default (`matchDistance` off); the watch's distance is
 * the explicit escape hatch.
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
import {
  checkStatsConsistency,
  type ActivityStats,
  type ConsistencyNotice,
} from "@/features/create/stats";
import { CREATE_ROUTE_ID } from "@/features/create/track";
import type {
  DrawVertex,
  PenMode,
  PathStyle,
  PointerMode,
  RoadFollowMode,
  RoadLeg,
  VertexId,
} from "@/types/domain";
import { vertexId } from "@/types/ids";

/** The workflow's three phases (form lives on the landing page). */
export type CreatePhase = "form" | "draw" | "review";

/**
 * The in-section view: the studio (map + draw panel / review card) or the
 * share card (the review's companion view — same track, same numbers, a
 * Strava-style graphic). Mirrors the repair session's `view` split.
 */
export type CreateView = "studio" | "share";

/**
 * The default point spacing of the generated track — denser than the
 * repair editor's "off" default because a from-scratch file has no
 * recorded points to carry it; 25 m reads like a watch on a normal run.
 */
export const DEFAULT_CREATE_SPACING_M = 25;

function initialReconstruction() {
  return emptyReconstruction(CREATE_ROUTE_ID);
}

interface CreateState {
  // -- phase + statistics ----------------------------------------------------
  phase: CreatePhase;
  /** The in-section view (studio or share); share is reachable from review. */
  view: CreateView;
  /** The confirmed statistics (null until the form submits). */
  stats: ActivityStats | null;
  /**
   * The time ≈ distance × pace cross-check of the confirmed statistics
   * (computed once at confirmation). Informational, never blocking: the
   * studio's cards render it so the user actually SEES it — the landing
   * form unmounts the moment it submits.
   */
  consistency: ConsistencyNotice | null;

  /** Confirm the statistics and enter the drawing phase. */
  beginDrawing: (stats: ActivityStats) => void;
  /** Return to the statistics form (stats and route are kept). */
  backToForm: () => void;
  /** Finish drawing → review (no-op below the two-vertex minimum). */
  finishRoute: () => void;
  /** Leave the review → back to the map to keep drawing. */
  editRoute: () => void;
  /** Full reset — new activity, empty form (the header's "Start over"). */
  reset: () => void;

  /** Switch the in-section view (studio ⇄ share; share only from review). */
  setView: (view: CreateView) => void;
  /** The header's Share intent — opens the warning dialog (review only). */
  openShareDialog: () => void;
  /** Close the warning dialog (no export, no view change). */
  closeShareDialog: () => void;

  /** The header's Share warning dialog (open state only). */
  shareDialogOpen: boolean;

  // -- route slice (the drawn chain) -----------------------------------------
  reconstruction: ReturnType<typeof initialReconstruction>;
  /**
   * Monotonic session token — bumped by every full reset, kept by
   * "Back to statistics" (same route, same session). Part of the
   * elevation freshness signature: two different routes can land on the
   * same geometryRevision/legs/basis tuple, but never on the same token.
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
   * The route's path style (Tasks 46–47: road / footpath / curve /
   * straight). Mirrored onto the single reconstruction so the committed
   * route remembers it (the export bakes it).
   */
  pathStyle: PathStyle;
  /** Densification spacing of the generated track. */
  spacingM: number | "off";
  /**
   * Scale the drawn route to the recorded distance — the review's "use
   * my watch's distance" choice. OFF by default: the drawn geometry (the
   * line on the map, what Strava will measure) is the file's distance.
   */
  matchDistance: boolean;

  setPointerMode: (mode: PointerMode) => void;
  /** The draw-mode pen (user pass 48; transient, never undoable). */
  setPenMode: (pen: PenMode) => void;
  setPathStyle: (mode: PathStyle) => void;
  setSpacing: (spacing: number | "off") => void;
  setMatchDistance: (on: boolean) => void;
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
  phase: "form" as CreatePhase,
  view: "studio" as CreateView,
  shareDialogOpen: false,
  stats: null as ActivityStats | null,
  consistency: null as ConsistencyNotice | null,

  reconstruction: initialReconstruction(),
  history: EMPTY_HISTORY,
  vertexSeq: 0,
  sessionSeq: 0,
  roadLegs: [] as readonly RoadLeg[],
  roadRouting: { pending: 0, failed: false },
  pointerMode: "draw" as PointerMode,
  pen: "default" as PenMode,
  pathStyle: "car" as PathStyle,
  spacingM: DEFAULT_CREATE_SPACING_M as number | "off",
  matchDistance: false,
};

export const useCreateStore = create<CreateState>()((set, get) => ({
  ...INITIAL,

  beginDrawing: (stats) =>
    set({
      stats,
      consistency: checkStatsConsistency(stats),
      phase: "draw",
      // A fresh entry starts on the map ready to click (the same contract
      // as opening a repair editor) — and in the studio view (a previous
      // share visit can never leak into a new activity).
      pointerMode: "draw",
      view: "studio",
      shareDialogOpen: false,
    }),

  backToForm: () =>
    set({
      phase: "form",
      pointerMode: "pan" as PointerMode,
      view: "studio",
      shareDialogOpen: false,
    }),

  finishRoute: () => {
    if (get().reconstruction.vertices.length < 2) return;
    set({ phase: "review", pointerMode: "pan" as PointerMode });
  },

  editRoute: () =>
    set({
      phase: "draw",
      pointerMode: "draw",
      view: "studio",
      shareDialogOpen: false,
    }),

  reset: () =>
    set((state) => ({
      ...INITIAL,
      sessionSeq: state.sessionSeq + 1,
      reconstruction: initialReconstruction(),
    })),

  setView: (view) => set({ view }),

  openShareDialog: () =>
    set((state) =>
      state.phase === "review" && state.view === "studio"
        ? { shareDialogOpen: true }
        : state,
    ),

  closeShareDialog: () => set({ shareDialogOpen: false }),

  setPointerMode: (pointerMode) => set({ pointerMode }),
  setPenMode: (pen) => set({ pen }),
  setPathStyle: (pathStyle) =>
    set((state) => {
      // The drawn route remembers its style (settings change — the
      // geometryRevision and so the elevation signature stay valid).
      const recon = state.reconstruction;
      if (recon.pathStyle === pathStyle) {
        return state.pathStyle === pathStyle ? state : { pathStyle };
      }
      return {
        pathStyle,
        reconstruction: { ...recon, pathStyle },
      };
    }),

  setSpacing: (spacingM) =>
    set((state) => {
      if (state.spacingM === spacingM) return state;
      return {
        spacingM,
        reconstruction: { ...state.reconstruction, resampleSpacingM: spacingM },
      };
    }),

  setMatchDistance: (matchDistance) => set({ matchDistance }),

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
    if (state.phase !== "draw" || points.length === 0) return;
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
export function createVertices(
  state: Pick<CreateState, "reconstruction">,
): readonly DrawVertex[] {
  return state.reconstruction.vertices;
}
