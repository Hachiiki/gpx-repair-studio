/**
 * Editor store (docs/MASTER_PLAN.md §D-4, Phase 4) — the state container
 * for reconstruction editing.
 *
 * Holds:
 *   - `activeGapId` — the gap whose draw session is open (transient);
 *   - `reconstructions` — the per-gap user repairs (vertices + settings),
 *     keyed by `GapId`. Small by construction; replaced immutably, never
 *     mutated in place;
 *   - `skippedGapIds` — gaps the user explicitly declined to repair;
 *   - `history` — the undo/redo command stack of the ACTIVE gap only
 *     (closing the editor drops it — undo does not span sessions);
 *   - `drawMode` / `snapEnabled` — transient editing aids (not persisted:
 *     they are about the interaction, not the data);
 *   - `roadFollow` — the road-follow mode for drawn legs (transient aid,
 *     same contract as snapEnabled);
 *   - `roadLegs` — per-gap RESOLVED road legs (derived, network data in a
 *     SIDE TABLE: never inside the undoable Reconstruction — §D-3). The
 *     draw-editor hook is the only writer; rendering, the distance badge,
 *     and the committed reconstruction read it.
 *
 * The store is a thin wrapper over the pure `features/reconstruction/
 * drawModel` command machinery — every vertex edit flows through
 * `commitCommand`, so the stack invariants hold by construction.
 *
 * Gap status (§G `DetectedGap.status`) is DERIVED, never stored: the pure
 * `deriveGapStatus` join below maps (base detection status, editor state)
 * → the user-facing status. The detected gaps in the session store stay
 * untouched — re-running detection with different thresholds does not
 * corrupt repair state (gap ids are deterministic per boundary pair, so
 * surviving gaps keep their reconstructions; vanished ones are pruned).
 *
 * Phase 4 — Reconstruction Editor: Drawing. Zustand store, usable outside
 * React (unit tests included).
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
  moveVertexCommand,
  redoCommand,
  undoCommand,
  type DrawCommand,
  type DrawHistory,
  type VertexPosition,
} from "@/features/reconstruction/drawModel";
import type { FileTimingContext } from "@/features/reconstruction/timestamps";
import type {
  GapId,
  ManualSpan,
  PointId,
  Reconstruction,
  RoadFollowMode,
  RoadLeg,
  TimeStrategy,
  VertexId,
} from "@/types/domain";
import { gapId, gapIdEnd, gapIdStart, vertexId } from "@/types/ids";

/** The user-facing repair status of a gap (§G `DetectedGap.status`). */
export type GapStatus =
  | "new"
  | "in-progress"
  | "reconstructed"
  | "skipped";

/**
 * The active span-pick mode: which repair tool is collecting map clicks.
 * `anchor` — one click on a recorded point starts an open "add missing
 * route" session (the click's position derives the shape); `pair` — the
 * two-click "redraw a stretch" selection.
 */
export type PickMode = "anchor" | "pair";

interface EditorState {
  activeGapId: GapId | null;
  drawMode: boolean;
  snapEnabled: boolean;
  reconstructions: Readonly<Record<string, Reconstruction>>;
  skippedGapIds: readonly GapId[];
  history: DrawHistory;
  /** Monotonic vertex-id allocator (never reused within a session). */
  vertexSeq: number;
  /** User-created repair spans (draw-anywhere; see ManualSpan). */
  manualSpans: readonly ManualSpan[];
  /** Span-pick mode: which repair tool is collecting map clicks (null = off). */
  pickMode: PickMode | null;
  /** Road-follow mode for drawn legs (transient editing aid). */
  roadFollow: RoadFollowMode;
  /** Resolved road legs per gap (derived side table; hook-written). */
  roadLegs: Readonly<Record<string, readonly RoadLeg[]>>;
  /** Road-routing status of the active chain (pending count + last failure). */
  roadRouting: { pending: number; failed: boolean };
  /**
   * File-level timing entries for files without usable timestamps
   * (§J-1 Case 3, Phase 5): an activity start time and/or a total
   * duration, entered once per file. Repair state — reset with the
   * session, never persisted.
   */
  fileTiming: FileTimingContext;

  /** Replace the file-level timing entries (patch semantics). */
  setFileTiming: (patch: Partial<FileTimingContext>) => void;

  /** Open the draw editor for a gap (creates an empty repair if needed). */
  openEditor: (gapId: GapId) => void;
  /** Close the active editor (keeps the reconstruction; drops history). */
  closeEditor: () => void;
  /** Enter span-pick mode (closes any open editor — picking replaces it). */
  startPickMode: (mode: PickMode) => void;
  /** Leave span-pick mode without creating a span. */
  cancelPickMode: () => void;
  /**
   * Create (or reopen) the manual REPLACE span for a boundary pair and open
   * its editor. Idempotent per boundary: an existing span — detected or
   * manual — keeps its repair state and is simply reopened.
   */
  addManualSpan: (beforePointId: PointId, afterPointId: PointId) => void;
  /**
   * One-anchor "add missing route": the picked point with a derived next
   * recorded point. Same id scheme as replace spans — the same dedupe and
   * editor session — the second pick click was simply skipped.
   */
  addInsertSpan: (anchorPointId: PointId, nextPointId: PointId) => void;
  /**
   * One-anchor OPEN extension: the drawn path attaches at the anchor and
   * ends in the open (route end/start). No far boundary exists.
   */
  addExtendSpan: (anchorPointId: PointId, side: "after" | "before") => void;
  /** Remove a manual span and all of its repair state. */
  removeManualSpan: (gapId: GapId) => void;
  setDrawMode: (on: boolean) => void;
  setSnapEnabled: (on: boolean) => void;
  /** Road-follow mode for drawn legs (transient, never undoable). */
  setRoadFollow: (mode: RoadFollowMode) => void;
  /** Replace the resolved road legs of one gap (no-op when unchanged). */
  setRoadLegs: (gapId: GapId, legs: readonly RoadLeg[]) => void;
  /** Update the road-routing status of the active chain. */
  setRoadRouting: (status: { pending: number; failed: boolean }) => void;
  /** Commit a command for the active gap (pure drawModel underneath). */
  submitCommand: (command: DrawCommand | null) => void;
  addVertex: (position: VertexPosition) => void;
  insertVertex: (index: number, position: VertexPosition) => void;
  moveVertex: (vertexId: VertexId, to: VertexPosition) => void;
  deleteVertex: (vertexId: VertexId) => void;
  clearVertices: () => void;
  undo: () => void;
  redo: () => void;
  /** Settings (§D-3.5) — not commands, never undoable. */
  setResampleSpacing: (gapId: GapId, spacing: number | "off") => void;
  /** Time strategy of one reconstruction — a setting, never undoable. */
  setTimeStrategy: (gapId: GapId, strategy: TimeStrategy) => void;
  /** Toggle the skip mark; skipping the active gap closes its editor. */
  toggleSkip: (gapId: GapId) => void;
  /** Drop state for gaps that no longer exist after re-detection. */
  prune: (knownGapIds: readonly GapId[]) => void;
  /** Full reset (new file / session reset). */
  reset: () => void;
}

const INITIAL = {
  activeGapId: null,
  drawMode: false,
  snapEnabled: true,
  reconstructions: {} as Readonly<Record<string, Reconstruction>>,
  skippedGapIds: [] as readonly GapId[],
  history: EMPTY_HISTORY,
  vertexSeq: 0,
  manualSpans: [] as readonly ManualSpan[],
  pickMode: null as PickMode | null,
  roadFollow: "car" as RoadFollowMode,
  roadLegs: {} as Readonly<Record<string, readonly RoadLeg[]>>,
  roadRouting: { pending: 0, failed: false },
  fileTiming: { startMs: null, totalDurationMs: null } as FileTimingContext,
};

/** The reconstruction of the active gap, or `null` when none is open. */
export function activeReconstruction(
  state: Pick<EditorState, "activeGapId" | "reconstructions">,
): Reconstruction | null {
  return state.activeGapId === null
    ? null
    : (state.reconstructions[state.activeGapId] ?? null);
}

export const useEditorStore = create<EditorState>()((set, get) => ({
  ...INITIAL,

  openEditor: (gapId) =>
    set((state) => {
      const existing = state.reconstructions[gapId];
      return {
        activeGapId: gapId,
        drawMode: true,
        history: EMPTY_HISTORY,
        reconstructions: existing
          ? state.reconstructions
          : {
              ...state.reconstructions,
              [gapId]: emptyReconstruction(gapId),
            },
        // Editing a gap implies repairing it — an explicit skip mark from
        // before is withdrawn (the derived status shows "in-progress").
        skippedGapIds: state.skippedGapIds.filter((id) => id !== gapId),
      };
    }),

  closeEditor: () =>
    set({
      activeGapId: null,
      history: EMPTY_HISTORY,
      drawMode: false,
    }),

  startPickMode: (mode) =>
    set({
      pickMode: mode,
      // Picking replaces any open editor session (the panel closes; the
      // abandoned reconstruction is kept, as with closeEditor).
      activeGapId: null,
      history: EMPTY_HISTORY,
      drawMode: false,
    }),

  cancelPickMode: () => set({ pickMode: null }),

  addManualSpan: (beforePointId, afterPointId) => {
    if (beforePointId === afterPointId) return;
    const id = gapId(beforePointId, afterPointId);
    set((state) => ({
      pickMode: null,
      // The same openEditor contract as gap rows: editing implies
      // repairing, an empty reconstruction is created on first touch, and
      // a stale skip mark is withdrawn.
      activeGapId: id,
      drawMode: true,
      history: EMPTY_HISTORY,
      manualSpans: state.manualSpans.some((span) => span.id === id)
        ? state.manualSpans
        : [
            ...state.manualSpans,
            { id, kind: "replace", beforePointId, afterPointId },
          ],
      reconstructions: state.reconstructions[id]
        ? state.reconstructions
        : { ...state.reconstructions, [id]: emptyReconstruction(id) },
      skippedGapIds: state.skippedGapIds.filter((skipped) => skipped !== id),
    }));
  },

  addInsertSpan: (anchorPointId, nextPointId) => {
    if (anchorPointId === nextPointId) return;
    const id = gapId(anchorPointId, nextPointId);
    set((state) => ({
      pickMode: null,
      activeGapId: id,
      drawMode: true,
      history: EMPTY_HISTORY,
      manualSpans: state.manualSpans.some((span) => span.id === id)
        ? state.manualSpans
        : [
            ...state.manualSpans,
            {
              id,
              kind: "insert",
              beforePointId: anchorPointId,
              afterPointId: nextPointId,
            },
          ],
      reconstructions: state.reconstructions[id]
        ? state.reconstructions
        : { ...state.reconstructions, [id]: emptyReconstruction(id) },
      skippedGapIds: state.skippedGapIds.filter((skipped) => skipped !== id),
    }));
  },

  addExtendSpan: (anchorPointId, side) => {
    const id = side === "before" ? gapIdStart(anchorPointId) : gapIdEnd(anchorPointId);
    set((state) => ({
      pickMode: null,
      activeGapId: id,
      drawMode: true,
      history: EMPTY_HISTORY,
      manualSpans: state.manualSpans.some((span) => span.id === id)
        ? state.manualSpans
        : [...state.manualSpans, { id, kind: "extend", anchorPointId, side }],
      reconstructions: state.reconstructions[id]
        ? state.reconstructions
        : { ...state.reconstructions, [id]: emptyReconstruction(id) },
      skippedGapIds: state.skippedGapIds.filter((skipped) => skipped !== id),
    }));
  },

  removeManualSpan: (gapIdToRemove) =>
    set((state) => {
      if (!state.manualSpans.some((span) => span.id === gapIdToRemove)) {
        return state;
      }
      const reconstructions = { ...state.reconstructions };
      delete reconstructions[gapIdToRemove];
      const roadLegs = { ...state.roadLegs };
      delete roadLegs[gapIdToRemove];
      return {
        manualSpans: state.manualSpans.filter(
          (span) => span.id !== gapIdToRemove,
        ),
        reconstructions,
        roadLegs,
        skippedGapIds: state.skippedGapIds.filter(
          (skipped) => skipped !== gapIdToRemove,
        ),
        ...(state.activeGapId === gapIdToRemove
          ? { activeGapId: null, history: EMPTY_HISTORY, drawMode: false }
          : {}),
      };
    }),

  setDrawMode: (drawMode) => set({ drawMode }),
  setSnapEnabled: (snapEnabled) => set({ snapEnabled }),

  setRoadFollow: (roadFollow) => set({ roadFollow }),

  setRoadLegs: (gapId, legs) =>
    set((state) => {
      const current = state.roadLegs[gapId] ?? [];
      const unchanged =
        current.length === legs.length &&
        current.every((leg, index) => leg === legs[index]);
      if (unchanged) return state;
      return { roadLegs: { ...state.roadLegs, [gapId]: legs } };
    }),

  setRoadRouting: (roadRouting) => set({ roadRouting }),

  setFileTiming: (patch) =>
    set((state) => ({
      fileTiming: { ...state.fileTiming, ...patch },
    })),

  submitCommand: (command) => {
    const state = get();
    const current = activeReconstruction(state);
    if (!current || !command) return;
    const next = commitCommand(
      { reconstruction: current, history: state.history },
      command,
    );
    set({
      reconstructions: {
        ...state.reconstructions,
        [current.gapId]: next.reconstruction,
      },
      history: next.history,
    });
  },

  addVertex: (position) => {
    const state = get();
    const current = activeReconstruction(state);
    if (!current) return;
    const seq = state.vertexSeq + 1;
    const command = addVertexCommand(current, position, vertexId(seq));
    if (!command) return;
    const next = commitCommand(
      { reconstruction: current, history: state.history },
      command,
    );
    set({
      vertexSeq: seq,
      reconstructions: {
        ...state.reconstructions,
        [current.gapId]: next.reconstruction,
      },
      history: next.history,
    });
  },

  insertVertex: (index, position) => {
    const state = get();
    const current = activeReconstruction(state);
    if (!current) return;
    const seq = state.vertexSeq + 1;
    const command = insertVertexCommand(
      current,
      index,
      position,
      vertexId(seq),
    );
    if (!command) return;
    const next = commitCommand(
      { reconstruction: current, history: state.history },
      command,
    );
    set({
      vertexSeq: seq,
      reconstructions: {
        ...state.reconstructions,
        [current.gapId]: next.reconstruction,
      },
      history: next.history,
    });
  },

  moveVertex: (vertexId, to) => {
    const state = get();
    const current = activeReconstruction(state);
    if (!current) return;
    const command = moveVertexCommand(current, vertexId, to);
    get().submitCommand(command);
  },

  deleteVertex: (vertexId) => {
    const state = get();
    const current = activeReconstruction(state);
    if (!current) return;
    const command = deleteVertexCommand(current, vertexId);
    get().submitCommand(command);
  },

  clearVertices: () => {
    const state = get();
    const current = activeReconstruction(state);
    if (!current) return;
    const command = clearVerticesCommand(current);
    get().submitCommand(command);
  },

  undo: () => {
    const state = get();
    const current = activeReconstruction(state);
    if (!current) return;
    const next = undoCommand({
      reconstruction: current,
      history: state.history,
    });
    set({
      reconstructions: {
        ...state.reconstructions,
        [current.gapId]: next.reconstruction,
      },
      history: next.history,
    });
  },

  redo: () => {
    const state = get();
    const current = activeReconstruction(state);
    if (!current) return;
    const next = redoCommand({
      reconstruction: current,
      history: state.history,
    });
    set({
      reconstructions: {
        ...state.reconstructions,
        [current.gapId]: next.reconstruction,
      },
      history: next.history,
    });
  },

  setResampleSpacing: (gapId, spacing) =>
    set((state) => {
      const current = state.reconstructions[gapId];
      if (!current || current.resampleSpacingM === spacing) return state;
      // A settings change, not geometry: geometryRevision stays untouched
      // (§D-3.5 — elevation fetched for the vertices stays valid).
      return {
        reconstructions: {
          ...state.reconstructions,
          [gapId]: { ...current, resampleSpacingM: spacing },
        },
      };
    }),

  setTimeStrategy: (gapId, strategy) =>
    set((state) => {
      const current = state.reconstructions[gapId];
      if (!current || current.timeStrategy === strategy) return state;
      // Settings, not commands (§D-3.5): switching a strategy or editing
      // a manual duration must never pollute the undo stack. Deep-equal
      // enough for the object shapes TimeStrategy allows.
      const unchanged =
        current.timeStrategy.kind === strategy.kind &&
        (current.timeStrategy.kind !== "manual-duration" ||
          strategy.kind !== "manual-duration" ||
          current.timeStrategy.durationMs === strategy.durationMs);
      if (unchanged) return state;
      return {
        reconstructions: {
          ...state.reconstructions,
          [gapId]: { ...current, timeStrategy: strategy },
        },
      };
    }),

  toggleSkip: (gapId) =>
    set((state) => {
      const skipped = state.skippedGapIds.includes(gapId);
      return {
        skippedGapIds: skipped
          ? state.skippedGapIds.filter((id) => id !== gapId)
          : [...state.skippedGapIds, gapId],
        // Skipping the gap being edited abandons the session (the
        // reconstruction itself is kept — unskipping brings it back).
        ...(state.activeGapId === gapId && !skipped
          ? { activeGapId: null, history: EMPTY_HISTORY, drawMode: false }
          : {}),
      };
    }),

  prune: (knownGapIds) =>
    set((state) => {
      const known = new Set<string>(knownGapIds);
      const reconstructions = Object.fromEntries(
        Object.entries(state.reconstructions).filter(([id]) =>
          known.has(id),
        ),
      );
      const roadLegs = Object.fromEntries(
        Object.entries(state.roadLegs).filter(([id]) => known.has(id)),
      );
      const skippedGapIds = state.skippedGapIds.filter((id) =>
        known.has(id),
      );
      const activeGone =
        state.activeGapId !== null && !known.has(state.activeGapId);
      const changed =
        Object.keys(reconstructions).length !==
          Object.keys(state.reconstructions).length ||
        Object.keys(roadLegs).length !== Object.keys(state.roadLegs).length ||
        skippedGapIds.length !== state.skippedGapIds.length ||
        activeGone;
      if (!changed) return state;
      return {
        reconstructions,
        roadLegs,
        skippedGapIds,
        ...(activeGone
          ? { activeGapId: null, history: EMPTY_HISTORY, drawMode: false }
          : {}),
      };
    }),

  reset: () => set({ ...INITIAL }),
}));

// ---------------------------------------------------------------------------
// Derived status (pure — the join the UI renders)
// ---------------------------------------------------------------------------

/** Everything needed to derive a gap's user-facing repair status. */
export interface GapStatusInput {
  gapId: GapId;
  activeGapId: GapId | null;
  reconstruction?: Reconstruction;
  skipped: boolean;
}

/**
 * The repair status of one gap. Priority (documented semantics):
 *
 *   1. `in-progress` — its editor is open (even if previously skipped:
 *      editing implies repairing);
 *   2. `skipped` — the user declined to repair it;
 *   3. `reconstructed` — vertices exist and no editor is open;
 *   4. `new` — untouched.
 */
export function deriveGapStatus(input: GapStatusInput): GapStatus {
  if (input.gapId === input.activeGapId) return "in-progress";
  if (input.skipped) return "skipped";
  if ((input.reconstruction?.vertices.length ?? 0) > 0) {
    return "reconstructed";
  }
  return "new";
}
