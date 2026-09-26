/**
 * Recovery store (Task 26) — the state container of the Gap Recovery
 * section, fully isolated from the repair studio.
 *
 * The Gap Recovery section is a separate, self-contained workflow: upload
 * an activity whose elapsed time continued while GPS coordinates were
 * missing, detect the missing interval(s), draw the missing route, and
 * export a corrected file. It deliberately does NOT share session or
 * editor state with the repair studio (`session-store` / `editor-store`):
 * the two sections can hold different files at the same time, and repairs
 * drawn in one must never surface in the other.
 *
 * Two slices, one store (they reset together — repairs belong to the file
 * they were drawn on):
 *
 *   - session slice — upload status, file name, the frozen original
 *     model, detected gaps, and the last load failure. Same shape and
 *     lifecycle contract as the repair studio's session store;
 *   - editor slice — a compact mirror of the repair studio's editor
 *     essentials for detected gaps only: active draw session, per-gap
 *     reconstructions, undo/redo history, transient aids (draw mode,
 *     snap, road-follow), resolved road legs, and the file-level timing
 *     fallback for files without timestamps. Manual spans / pick modes
 *     are intentionally absent — recovery repairs detected missing
 *     sections, it does not author arbitrary spans.
 *
 * The command wrappers are thin adapters over the SAME pure
 * `features/reconstruction/drawModel` machinery the repair studio uses —
 * one implementation of every drawing command, two independent stores.
 * This mirror (rather than refactoring the existing editor store into a
 * factory) is a deliberate Task 26 constraint: the existing feature's
 * code paths stay byte-for-byte untouched.
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
  moveVertexCommand,
  redoCommand,
  undoCommand,
  type DrawCommand,
  type DrawHistory,
  type VertexPosition,
} from "@/features/reconstruction/drawModel";
import type { FileTimingContext } from "@/features/reconstruction/timestamps";
import type {
  DetectedGap,
  GapId,
  OriginalTrackData,
  Reconstruction,
  RoadFollowMode,
  RoadLeg,
  TimeStrategy,
  VertexId,
} from "@/types/domain";
import { vertexId } from "@/types/ids";
import type { SessionError, SessionStatus } from "@/state/session-store";

interface RecoveryState {
  // -- session slice --------------------------------------------------------
  status: SessionStatus;
  fileName: string | null;
  /** The validated, frozen original model; `null` unless status is "parsed". */
  data: OriginalTrackData | null;
  gaps: readonly DetectedGap[];
  error: SessionError | null;

  /** Enter the loading state for a new file. */
  beginLoad: (fileName: string) => void;
  /** Store a successful parse; resets any previous error. */
  setParsed: (
    fileName: string,
    data: OriginalTrackData,
    gaps: readonly DetectedGap[],
  ) => void;
  /** Replace the detected gaps (threshold change → pure re-detection). */
  setGaps: (gaps: readonly DetectedGap[]) => void;
  /** Store a load failure. */
  fail: (error: SessionError) => void;

  // -- editor slice (detected gaps only) -------------------------------------
  activeGapId: GapId | null;
  drawMode: boolean;
  snapEnabled: boolean;
  /** Road-follow mode for drawn legs (transient editing aid). */
  roadFollow: RoadFollowMode;
  reconstructions: Readonly<Record<string, Reconstruction>>;
  skippedGapIds: readonly GapId[];
  history: DrawHistory;
  /** Monotonic vertex-id allocator (never reused within a session). */
  vertexSeq: number;
  /** Resolved road legs per gap (derived side table; hook-written). */
  roadLegs: Readonly<Record<string, readonly RoadLeg[]>>;
  /** Road-routing status of the active chain (pending count + failure). */
  roadRouting: { pending: number; failed: boolean };
  /** File-level timing fallback (§J-1 Case 3 — files without timestamps). */
  fileTiming: FileTimingContext;
  /**
   * The missing section highlighted on this section's map / list.
   * Section-local on purpose — NOT the repair studio's shared
   * uiStore.selectedGapId: the two sections' selections must never
   * clear each other. Transient; reset with the session.
   */
  selectedGapId: GapId | null;

  /** Select (or deselect) a missing section. */
  selectGap: (gapId: GapId | null) => void;

  /** Open the draw editor for a detected gap (creates an empty repair). */
  openEditor: (gapId: GapId) => void;
  /** Close the active editor (keeps the reconstruction; drops history). */
  closeEditor: () => void;
  setDrawMode: (on: boolean) => void;
  setSnapEnabled: (on: boolean) => void;
  setRoadFollow: (mode: RoadFollowMode) => void;
  /** Replace the resolved road legs of one gap (no-op when unchanged). */
  setRoadLegs: (gapId: GapId, legs: readonly RoadLeg[]) => void;
  setRoadRouting: (status: { pending: number; failed: boolean }) => void;
  setFileTiming: (patch: Partial<FileTimingContext>) => void;

  addVertex: (position: VertexPosition) => void;
  insertVertex: (index: number, position: VertexPosition) => void;
  moveVertex: (vertexId: VertexId, to: VertexPosition) => void;
  deleteVertex: (vertexId: VertexId) => void;
  clearVertices: () => void;
  undo: () => void;
  redo: () => void;

  /** Settings (§D-3.5) — not commands, never undoable. */
  setResampleSpacing: (gapId: GapId, spacing: number | "off") => void;
  setTimeStrategy: (gapId: GapId, strategy: TimeStrategy) => void;
  /** Toggle the skip mark; skipping the active gap closes its editor. */
  toggleSkip: (gapId: GapId) => void;
  /** Drop state for gaps that no longer exist after re-detection. */
  prune: (knownGapIds: readonly GapId[]) => void;

  /** Full reset (new file / leaving the section's session). */
  reset: () => void;
}

const INITIAL = {
  status: "idle" as SessionStatus,
  fileName: null,
  data: null,
  gaps: [] as readonly DetectedGap[],
  error: null,

  activeGapId: null,
  drawMode: false,
  snapEnabled: true,
  roadFollow: "car" as RoadFollowMode,
  reconstructions: {} as Readonly<Record<string, Reconstruction>>,
  skippedGapIds: [] as readonly GapId[],
  history: EMPTY_HISTORY,
  vertexSeq: 0,
  roadLegs: {} as Readonly<Record<string, readonly RoadLeg[]>>,
  roadRouting: { pending: 0, failed: false },
  fileTiming: { startMs: null, totalDurationMs: null } as FileTimingContext,
  selectedGapId: null as GapId | null,
};

/** The reconstruction of the active gap, or `null` when none is open. */
export function activeRecoveryReconstruction(
  state: Pick<RecoveryState, "activeGapId" | "reconstructions">,
): Reconstruction | null {
  return state.activeGapId === null
    ? null
    : (state.reconstructions[state.activeGapId] ?? null);
}

export const useRecoveryStore = create<RecoveryState>()((set, get) => ({
  ...INITIAL,

  beginLoad: (fileName) =>
    set({ status: "loading", fileName, error: null }),
  setParsed: (fileName, data, gaps) =>
    set({
      status: "parsed",
      fileName,
      data,
      gaps,
      error: null,
      // A new file wipes all repair state — repairs belong to the file
      // they were drawn on, never to the next one.
      activeGapId: null,
      drawMode: false,
      reconstructions: {},
      skippedGapIds: [],
      history: EMPTY_HISTORY,
      vertexSeq: 0,
      roadLegs: {},
      roadRouting: { pending: 0, failed: false },
      fileTiming: { startMs: null, totalDurationMs: null },
      selectedGapId: null,
    }),
  setGaps: (gaps) => set({ gaps }),
  fail: (error) =>
    set({ status: "error", error, data: null, gaps: [] }),

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
        // Editing a gap implies recovering it — a stale skip mark is
        // withdrawn (the same contract as the repair studio).
        skippedGapIds: state.skippedGapIds.filter((id) => id !== gapId),
      };
    }),

  closeEditor: () =>
    set({
      activeGapId: null,
      history: EMPTY_HISTORY,
      drawMode: false,
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

  selectGap: (selectedGapId) => set({ selectedGapId }),

  addVertex: (position) => {
    const state = get();
    const current = activeRecoveryReconstruction(state);
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
    const current = activeRecoveryReconstruction(state);
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
    const current = activeRecoveryReconstruction(state);
    if (!current) return;
    const command: DrawCommand | null = moveVertexCommand(current, vertexId, to);
    if (!command) return;
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

  deleteVertex: (vertexId) => {
    const state = get();
    const current = activeRecoveryReconstruction(state);
    if (!current) return;
    const command: DrawCommand | null = deleteVertexCommand(current, vertexId);
    if (!command) return;
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

  clearVertices: () => {
    const state = get();
    const current = activeRecoveryReconstruction(state);
    if (!current) return;
    const command: DrawCommand | null = clearVerticesCommand(current);
    if (!command) return;
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

  undo: () => {
    const state = get();
    const current = activeRecoveryReconstruction(state);
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
    const current = activeRecoveryReconstruction(state);
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
      if (!current) return state;
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
