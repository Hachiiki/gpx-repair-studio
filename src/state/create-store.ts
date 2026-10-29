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
  clipboardFromSelection,
  commitCommand,
  deleteVertexCommand,
  EMPTY_HISTORY,
  emptyReconstruction,
  insertVertexCommand,
  MAX_VERTICES,
  moveVertexCommand,
  pasteAppendCommand,
  redoCommand,
  undoCommand,
  type DrawClipboardPoint,
  type DrawCommand,
  type DrawHistory,
  type VertexPosition,
} from "@/features/reconstruction/drawModel";
import {
  checkStatsConsistency,
  type ActivityStats,
  type ConsistencyNotice,
} from "@/features/create/stats";
import {
  makeRoomForSegment,
  prunePaceSegments,
  type PaceSegment,
} from "@/features/create/pace";
import { CREATE_ROUTE_ID } from "@/features/create/track";
import type { CreateSessionHydration } from "@/lib/storage/session-record";
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
  /**
   * Phase 10 — session recovery: adopt a stored create session (the
   * confirmed statistics + the drawn route + its settings). The session
   * token bumps (a fresh elevation signature); history is not restored —
   * the undo stack spans one editor session by design. Always reopens
   * in the studio view (a view is not work).
   */
  hydrate: (payload: CreateSessionHydration) => void;

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

  // -- selection + clipboard (Task 72: repeat a loop) -------------------------
  /** The currently selected vertices (map Shift+click / list ticks). */
  selection: ReadonlySet<VertexId>;
  /** The copied fragment (route order), pasted at the chain's end. */
  clipboard: readonly DrawClipboardPoint[];
  /** Toggle one vertex's membership in the selection. */
  toggleVertexSelection: (vertexId: VertexId) => void;
  /** Select the inclusive index range between two vertices (either order). */
  selectVertexRange: (fromVertexId: VertexId, toVertexId: VertexId) => void;
  /** Select every vertex of the chain. */
  selectAllVertices: () => void;
  /** Empty the selection. */
  clearSelection: () => void;
  /** Copy the selected vertices (route order) onto the clipboard. */
  copySelection: () => void;
  /**
   * Paste the clipboard at the END of the chain — ONE undoable step per
   * paste, repeatable until the distance target is met. Only what fits
   * under the vertex cap lands; the selection survives (repeat pastes
   * are one keystroke each).
   */
  pasteClipboard: () => void;

  // -- pace plan (Task 73: stretches at a stated pace) --------------------
  /** The planned pace stretches (route order, non-overlapping after make-room). */
  paceSegments: readonly PaceSegment[];
  /** Monotonic pace-segment id allocator (never reused within a session). */
  paceSeq: number;
  /**
   * Plan (or re-plan) the pace of the inclusive span between two drawn
   * points — the paint-over rule absorbs/trims any overlapping segment,
   * and the LAST assignment wins where spans overlap. A no-op when the
   * span is not a valid earlier→later pair or the pace is not positive.
   */
  applyPaceSegment: (
    fromVertexId: VertexId,
    toVertexId: VertexId,
    paceMsPerMeter: number,
  ) => void;
  /** Change one segment's stated pace (span untouched). */
  updatePaceSegment: (id: string, paceMsPerMeter: number) => void;
  /** Remove one segment (the unplanned stretch returns to the remainder). */
  removePaceSegment: (id: string) => void;

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
  // Task 72 — transient like history: a selection/clipboard is an editor
  // session's working state, never persisted (INITIAL is never mutated
  // in place; every change allocates a fresh Set/array).
  selection: new Set<VertexId>() as ReadonlySet<VertexId>,
  clipboard: [] as readonly DrawClipboardPoint[],
  // Task 73 — the pace plan is WORK like the route itself (it survives
  // reloads through the session record); the allocator follows the
  // vertex sequence's never-reuse contract.
  paceSegments: [] as readonly PaceSegment[],
  paceSeq: 0,
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

  hydrate: (payload) =>
    set((state) => ({
      stats: payload.stats,
      consistency: checkStatsConsistency(payload.stats),
      phase: payload.phase,
      view: "studio" as CreateView,
      shareDialogOpen: false,
      reconstruction: payload.reconstruction,
      roadLegs: payload.roadLegs,
      spacingM: payload.spacingM,
      matchDistance: payload.matchDistance,
      vertexSeq: payload.vertexSeq,
      // The chips adopt the style the route was drawn with (the same
      // contract as reopening a line); ready to draw when phase is draw.
      pathStyle: payload.reconstruction.pathStyle ?? state.pathStyle,
      pointerMode: payload.phase === "draw" ? ("draw" as PointerMode) : ("pan" as PointerMode),
      history: EMPTY_HISTORY,
      roadRouting: { pending: 0, failed: false },
      sessionSeq: state.sessionSeq + 1,
      // Selection and clipboard are editor-session state like history —
      // a restored route reopens unselected with an empty clipboard.
      selection: new Set<VertexId>() as ReadonlySet<VertexId>,
      clipboard: [] as readonly DrawClipboardPoint[],
      // Task 73 — a restored route keeps its pace plan; the payload's
      // segments were validated at read time and are pruned against the
      // restored chain here (stale ids can never claim spans the chain
      // does not have).
      paceSegments: prunePaceSegments(
        payload.reconstruction.vertices,
        payload.paceSegments,
      ),
      paceSeq: payload.paceSeq,
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
  setPathStyle: (pathStyle) => set({ pathStyle }),

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
    // The placed segment's mode is decided HERE — the chip state at
    // click time becomes the segment's legStyle, permanently.
    const style = state.pathStyle;
    const command = addVertexCommand(
      state.reconstruction,
      position,
      vertexId(seq),
      style,
    );
    if (!command) return;
    const next = commitCommand(
      { reconstruction: state.reconstruction, history: state.history },
      command,
    );
    set({
      vertexSeq: seq,
      // The line's remembered style = the last placed segment's style.
      reconstruction: withLineStyle(next.reconstruction, style),
      history: next.history,
    });
  },

  insertVertex: (index, position) => {
    const state = get();
    const seq = state.vertexSeq + 1;
    // Mid-list inserts inherit the split leg's style; an APPEND takes
    // the chip state, like addVertex.
    const appending = index >= state.reconstruction.vertices.length;
    const style = state.pathStyle;
    const command = insertVertexCommand(
      state.reconstruction,
      index,
      position,
      vertexId(seq),
      style,
    );
    if (!command) return;
    const next = commitCommand(
      { reconstruction: state.reconstruction, history: state.history },
      command,
    );
    set({
      vertexSeq: seq,
      reconstruction: appending
        ? withLineStyle(next.reconstruction, style)
        : next.reconstruction,
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
    // A deleted vertex cannot stay selected (the map and the list both
    // prune their views through the store's own set) — and no pace
    // segment may keep a vanished endpoint.
    const selection = new Set(state.selection);
    selection.delete(vertexId);
    set({
      reconstruction: next.reconstruction,
      history: next.history,
      selection,
      paceSegments: prunePaceSegments(
        next.reconstruction.vertices,
        state.paceSegments,
      ),
    });
  },

  commitStroke: (points) => {
    const state = get();
    if (state.phase !== "draw" || points.length === 0) return;
    const current = state.reconstruction;
    const budget = MAX_VERTICES - current.vertices.length;
    if (budget < 2) return; // a stroke is a curve — it needs two nodes minimum
    // The stroke's segment style: routed styles keep the router's
    // geometry; a local (off/curve) stroke becomes a smooth CURVE
    // segment — the per-segment form of the Task-46 flip.
    const active = state.pathStyle;
    const strokeStyle: PathStyle =
      active === "car" || active === "foot" ? active : "curve";
    let seq = state.vertexSeq;
    const added = points.slice(0, budget).map((point) => {
      seq += 1;
      return {
        id: vertexId(seq),
        lat: point.lat,
        lon: point.lon,
        legStyle: strokeStyle,
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
      reconstruction: withLineStyle(next.reconstruction, strokeStyle),
      history: next.history,
    });
    // The curve pen's chip continuity (Task 46): a LOCAL stroke moves
    // the active style to "curve" — the panel renders it as the
    // Straight chip pressed, and the next segment continues smoothly.
    // Routed styles keep the router's geometry.
    if (strokeStyle !== active) {
      get().setPathStyle(strokeStyle);
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
    // Every selected id is gone — the selection empties with the chain,
    // and with it the pace plan (a chain of zero points has no spans).
    set({
      reconstruction: next.reconstruction,
      history: next.history,
      selection: new Set<VertexId>(),
      paceSegments: [],
    });
  },

  undo: () => {
    const state = get();
    const next = undoCommand({
      reconstruction: state.reconstruction,
      history: state.history,
    });
    set({
      reconstruction: next.reconstruction,
      history: next.history,
      selection: pruneSelection(next.reconstruction.vertices, state.selection),
      paceSegments: prunePaceSegments(
        next.reconstruction.vertices,
        state.paceSegments,
      ),
    });
  },

  redo: () => {
    const state = get();
    const next = redoCommand({
      reconstruction: state.reconstruction,
      history: state.history,
    });
    set({
      reconstruction: next.reconstruction,
      history: next.history,
      selection: pruneSelection(next.reconstruction.vertices, state.selection),
      paceSegments: prunePaceSegments(
        next.reconstruction.vertices,
        state.paceSegments,
      ),
    });
  },

  // -- pace plan (Task 73) ---------------------------------------------

  applyPaceSegment: (fromVertexId, toVertexId, paceMsPerMeter) =>
    set((state) => {
      if (!Number.isFinite(paceMsPerMeter) || paceMsPerMeter <= 0) return state;
      const vertices = state.reconstruction.vertices;
      const from = vertices.findIndex((v) => v.id === fromVertexId);
      const to = vertices.findIndex((v) => v.id === toVertexId);
      if (from === -1 || to === -1 || from >= to) return state;
      const seq = state.paceSeq + 1;
      const segment: PaceSegment = {
        id: `ps${seq}`,
        fromVertexId,
        toVertexId,
        paceMsPerMeter,
      };
      return {
        paceSeq: seq,
        paceSegments: [
          ...makeRoomForSegment(
            state.paceSegments,
            fromVertexId,
            toVertexId,
            vertices,
          ),
          segment,
        ],
      };
    }),

  updatePaceSegment: (id, paceMsPerMeter) =>
    set((state) => {
      if (!Number.isFinite(paceMsPerMeter) || paceMsPerMeter <= 0) return state;
      let changed = false;
      const paceSegments = state.paceSegments.map((segment) => {
        if (segment.id !== id) return segment;
        if (segment.paceMsPerMeter === paceMsPerMeter) return segment;
        changed = true;
        return { ...segment, paceMsPerMeter };
      });
      return changed ? { paceSegments } : state;
    }),

  removePaceSegment: (id) =>
    set((state) => {
      const paceSegments = state.paceSegments.filter(
        (segment) => segment.id !== id,
      );
      return paceSegments.length === state.paceSegments.length
        ? state
        : { paceSegments };
    }),

  // -- selection + clipboard (Task 72) ----------------------------------

  toggleVertexSelection: (vertexId) =>
    set((state) => {
      // Unknown ids (a stale map feature, an undone vertex) are refused —
      // the set can never claim a vertex the chain no longer has.
      if (!state.reconstruction.vertices.some((v) => v.id === vertexId)) {
        return state;
      }
      const selection = new Set(state.selection);
      if (selection.has(vertexId)) selection.delete(vertexId);
      else selection.add(vertexId);
      return { selection };
    }),

  selectVertexRange: (fromVertexId, toVertexId) =>
    set((state) => {
      const vertices = state.reconstruction.vertices;
      const from = vertices.findIndex((v) => v.id === fromVertexId);
      const to = vertices.findIndex((v) => v.id === toVertexId);
      if (from === -1 || to === -1) return state;
      const [lo, hi] = from <= to ? [from, to] : [to, from];
      const selection = new Set(state.selection);
      for (let i = lo; i <= hi; i += 1) selection.add(vertices[i].id);
      return { selection };
    }),

  selectAllVertices: () =>
    set((state) => ({
      selection: new Set(state.reconstruction.vertices.map((v) => v.id)),
    })),

  clearSelection: () =>
    set((state) =>
      state.selection.size === 0 ? state : { selection: new Set<VertexId>() },
    ),

  copySelection: () =>
    set((state) => {
      if (state.selection.size === 0) return state;
      const clipboard = clipboardFromSelection(
        state.reconstruction.vertices,
        (vertex) => state.selection.has(vertex.id),
      );
      if (clipboard.length === 0) return state;
      return { clipboard };
    }),

  pasteClipboard: () => {
    const state = get();
    if (state.clipboard.length === 0) return;
    let seq = state.vertexSeq;
    const command = pasteAppendCommand(
      state.reconstruction,
      state.clipboard,
      (offset) => vertexId(seq + 1 + offset),
    );
    if (!command) return; // at the cap — the panel's limit notice shows
    const next = commitCommand(
      { reconstruction: state.reconstruction, history: state.history },
      command,
    );
    if (next.reconstruction === state.reconstruction) return;
    // The allocator reserved one id per point that actually landed
    // (a partial paste reserves only its part).
    seq +=
      next.reconstruction.vertices.length - state.reconstruction.vertices.length;
    set({
      vertexSeq: seq,
      reconstruction: next.reconstruction,
      history: next.history,
      // The selection SURVIVES a paste — repeat pastes (the loop the
      // feature exists for) stay one keystroke each.
    });
  },
}));

/** The vertices of the drawn chain (convenience selector). */
export function createVertices(
  state: Pick<CreateState, "reconstruction">,
): readonly DrawVertex[] {
  return state.reconstruction.vertices;
}

/**
 * The per-segment fix's line-style tracking: the route's remembered
 * style becomes the style of the most recently PLACED segment — the
 * style the chips re-adopt when the studio reopens. A pure settings
 * patch; undo never restores it (§D-3.5).
 */
function withLineStyle(
  reconstruction: CreateState["reconstruction"],
  style: PathStyle,
): CreateState["reconstruction"] {
  return reconstruction.pathStyle === style
    ? reconstruction
    : { ...reconstruction, pathStyle: style };
}

/** Drop selection ids the chain no longer has (undo/redo pruning). */
function pruneSelection(
  vertices: readonly DrawVertex[],
  selection: ReadonlySet<VertexId>,
): ReadonlySet<VertexId> {
  if (selection.size === 0) return selection;
  const valid = new Set(vertices.map((v) => v.id));
  let changed = false;
  for (const id of selection) {
    if (!valid.has(id)) changed = true;
  }
  if (!changed) return selection;
  const next = new Set<VertexId>();
  for (const id of selection) {
    if (valid.has(id)) next.add(id);
  }
  return next;
}
