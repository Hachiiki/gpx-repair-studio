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
 *     essentials: active draw session, per-gap reconstructions, undo/redo
 *     history, transient aids (draw mode, snap, road-follow), resolved
 *     road legs, and the file-level timing fallback for files without
 *     timestamps. Manual spans / pick modes joined in Task 28: recovery
 *     now also authors "unmeasured sections" (draw the route the watch
 *     never measured — the app calculates its time from the file's
 *     pace), so detection is a helper here exactly as in the repair
 *     studio, never a gate.
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
import type { ParseProgress } from "@/lib/gpx/parse-worker-protocol";
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
import { nudgeInBounds } from "@/features/reconstruction/coordEntry";
import type { FileTimingContext } from "@/features/reconstruction/timestamps";
import type {
  DetectedGap,
  GapId,
  ManualSpan,
  OriginalTrackData,
  PenMode,
  PointId,
  PathStyle,
  PointerMode,
  Reconstruction,
  RoadFollowMode,
  RoadLeg,
  TimeStrategy,
  VertexId,
} from "@/types/domain";
import { gapId, gapIdEnd, gapIdStart, vertexId } from "@/types/ids";
import type { PickMode } from "@/state/editor-store";
import type { FileSessionHydration } from "@/lib/storage/session-record";
import type { SessionError, SessionStatus } from "@/state/session-store";

/**
 * A fresh reconstruction for a user-drawn span, with the strategy the
 * span's shape honest demands (Task 28):
 *   - insert (adjacent boundaries) and extend (no far boundary): the
 *     recorded window is meaningless (~1 s or absent), so the section's
 *     time is PACE-ESTIMATED from the file — the recovery contract
 *     "you draw, the app calculates";
 *   - replace (a real recorded window between two picked points): the
 *     window IS the time in the file — distance-proportional stays the
 *     default, exactly like a detected gap.
 * The user can always steer away via the strategy controls.
 */
function spanReconstruction(gapId: GapId, strategy: TimeStrategy): Reconstruction {
  return { ...emptyReconstruction(gapId), timeStrategy: strategy };
}

interface RecoveryState {
  // -- session slice --------------------------------------------------------
  status: SessionStatus;
  fileName: string | null;
  /** The validated, frozen original model; `null` unless status is "parsed". */
  data: OriginalTrackData | null;
  gaps: readonly DetectedGap[];
  error: SessionError | null;
  /** Worker-parse progress (Phase 9) — null except during a worker parse. */
  progress: ParseProgress | null;
  /**
   * The uploaded file itself (Phase 10 — session recovery): kept so the
   * autosave can persist the original bytes to IndexedDB. Cleared with
   * the session; never mutated, never sent anywhere.
   */
  sourceFile: File | null;

  /** Enter the loading state for a new file. */
  beginLoad: (fileName: string, file?: File) => void;
  /** Update worker-parse progress (honored in the loading state only). */
  setProgress: (progress: ParseProgress) => void;
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

  // -- editor slice -----------------------------------------------------------
  activeGapId: GapId | null;
  pointerMode: PointerMode;
  /** The draw-mode pen (user pass 48): default clicks, curve strokes. */
  pen: PenMode;
  snapEnabled: boolean;
  /** Road-follow mode for drawn legs (transient editing aid). */
  pathStyle: PathStyle;
  reconstructions: Readonly<Record<string, Reconstruction>>;
  skippedGapIds: readonly GapId[];
  history: DrawHistory;
  /** Monotonic vertex-id allocator (never reused within a session). */
  vertexSeq: number;
  /** Resolved road legs per gap (derived side table; hook-written). */
  roadLegs: Readonly<Record<string, readonly RoadLeg[]>>;
  /** Road-routing status of the active chain (pending count + failure). */
  roadRouting: { pending: number; failed: boolean };
  /**
   * §EE 17.3 — the one-shot whole-line snap preview is on screen: the
   * joins render the routed slices for EVERY pair (the preview
   * replaces the line, overriding the placed segments' own styles
   * until applied or cancelled). Machine-written, transient.
   */
  snapPreviewActive: boolean;
  /** File-level timing fallback (§J-1 Case 3 — files without timestamps). */
  fileTiming: FileTimingContext;
  /** User-drawn unmeasured sections (Task 28 — draw-anywhere spans). */
  manualSpans: readonly ManualSpan[];
  /** Span-pick mode: which recovery tool is collecting map clicks. */
  pickMode: PickMode | null;
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
  /** Enter span-pick mode (closes any open editor — picking replaces it). */
  startPickMode: (mode: PickMode) => void;
  /** Leave span-pick mode without creating a span. */
  cancelPickMode: () => void;
  /** Create (or reopen) the REPLACE span for a picked boundary pair. */
  addManualSpan: (beforePointId: PointId, afterPointId: PointId) => void;
  /** One-anchor insert span: the picked point + its next recorded point. */
  addInsertSpan: (anchorPointId: PointId, nextPointId: PointId) => void;
  /** One-anchor OPEN extension (route start/end). */
  addExtendSpan: (anchorPointId: PointId, side: "after" | "before") => void;
  /** Remove a user-drawn span and all of its repair state. */
  removeManualSpan: (gapId: GapId) => void;
  setPointerMode: (mode: PointerMode) => void;
  setSnapEnabled: (on: boolean) => void;
  /** The draw-mode pen (user pass 48; transient, never undoable). */
  setPenMode: (pen: PenMode) => void;
  setPathStyle: (mode: PathStyle) => void;
  /** Replace the resolved road legs of one gap (no-op when unchanged). */
  setRoadLegs: (gapId: GapId, legs: readonly RoadLeg[]) => void;
  setRoadRouting: (status: { pending: number; failed: boolean }) => void;
  /** Phase 17 — commit a prepared command (the snap apply's set-line). */
  submitCommand: (command: DrawCommand | null) => void;
  setFileTiming: (patch: Partial<FileTimingContext>) => void;

  addVertex: (position: VertexPosition) => void;
  insertVertex: (index: number, position: VertexPosition) => void;
  moveVertex: (vertexId: VertexId, to: VertexPosition) => void;
  /** Phase 16 — coalescing arrow-key nudge (the editor store's twin). */
  nudgeVertex: (vertexId: VertexId, dLat: number, dLon: number) => void;
  deleteVertex: (vertexId: VertexId) => void;
  /**
   * Commit one freehand stroke (Curve pen, user pass 48): append the
   * processed nodes as ONE `set-vertices` command — a single undo step
   * removes the whole stroke. A local ("off") line flips to "curve" so
   * the Task-46 spline smooths it; routed lines keep their routing.
   */
  commitStroke: (points: readonly { lat: number; lon: number }[]) => void;
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
  /**
   * Phase 10 — session recovery: adopt a stored session's work after its
   * file re-parsed cleanly (deterministic gap/point ids re-attach the
   * stored repairs). History is NOT restored — the undo stack spans one
   * editor session by design; the vertex-id allocator is re-armed.
   */
  hydrate: (payload: FileSessionHydration) => void;

  /** Full reset (new file / leaving the section's session). */
  reset: () => void;
}

const INITIAL = {
  status: "idle" as SessionStatus,
  fileName: null,
  data: null,
  gaps: [] as readonly DetectedGap[],
  error: null,
  progress: null as ParseProgress | null,
  sourceFile: null as File | null,

  activeGapId: null,
  pointerMode: "pan" as PointerMode,
  pen: "default" as PenMode,
  snapEnabled: true,
  pathStyle: "car" as PathStyle,
  reconstructions: {} as Readonly<Record<string, Reconstruction>>,
  skippedGapIds: [] as readonly GapId[],
  history: EMPTY_HISTORY,
  vertexSeq: 0,
  roadLegs: {} as Readonly<Record<string, readonly RoadLeg[]>>,
  roadRouting: { pending: 0, failed: false },
  snapPreviewActive: false,
  fileTiming: {
    startMs: null,
    totalDurationMs: null,
    recordedSpeedMps: null,
  } as FileTimingContext,
  manualSpans: [] as readonly ManualSpan[],
  pickMode: null as PickMode | null,
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

/**
 * Phase 17 — the editor store's `styleSyncPatch` twin: a `set-line`
 * command (the snap apply) moves the line's path style with its
 * geometry, and the ACTIVE chip state follows the reconstruction so
 * the panel never shows a style the line does not have.
 */
function styleSyncPatch(
  state: RecoveryState,
  gapId: GapId,
  reconstruction: Reconstruction,
): Partial<RecoveryState> {
  if (state.activeGapId !== gapId) return {};
  const style = reconstruction.pathStyle ?? "off";
  return state.pathStyle === style ? {} : { pathStyle: style };
}

/**
 * The per-segment fix's line-style tracking (the editor store's twin):
 * the reconstruction's remembered style becomes the style of the most
 * recently PLACED segment — the style the chips re-adopt on reopen. A
 * pure settings patch; undo never restores it (§D-3.5).
 */
function withLineStyle(
  reconstruction: Reconstruction,
  style: PathStyle,
): Reconstruction {
  return reconstruction.pathStyle === style
    ? reconstruction
    : { ...reconstruction, pathStyle: style };
}

export const useRecoveryStore = create<RecoveryState>()((set, get) => ({
  ...INITIAL,

  beginLoad: (fileName, file) =>
    set({
      status: "loading",
      fileName,
      error: null,
      progress: null,
      sourceFile: file ?? null,
    }),
  setProgress: (progress) => {
    if (get().status === "loading") {
      set({ progress });
    }
  },
  setParsed: (fileName, data, gaps) =>
    set({
      status: "parsed",
      fileName,
      data,
      gaps,
      error: null,
      progress: null,
      // A new file wipes all repair state — repairs belong to the file
      // they were drawn on, never to the next one.
      activeGapId: null,
      pointerMode: "pan" as PointerMode,
      reconstructions: {},
      skippedGapIds: [],
      history: EMPTY_HISTORY,
      vertexSeq: 0,
      roadLegs: {},
      roadRouting: { pending: 0, failed: false },
      fileTiming: { startMs: null, totalDurationMs: null, recordedSpeedMps: null },
      manualSpans: [],
      pickMode: null,
      selectedGapId: null,
    }),
  setGaps: (gaps) => set({ gaps }),
  fail: (error) =>
    set({
      status: "error",
      error,
      data: null,
      gaps: [],
      progress: null,
      sourceFile: null,
    }),

  openEditor: (gapId) =>
    set((state) => {
      const existing = state.reconstructions[gapId];
      return {
        activeGapId: gapId,
        pointerMode: "draw",
        history: EMPTY_HISTORY,
        // Task 47: reopening a line re-adopts the style it was drawn with.
        pathStyle: existing?.pathStyle ?? state.pathStyle,
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
      pointerMode: "pan" as PointerMode,
    }),

  startPickMode: (mode) =>
    set({
      pickMode: mode,
      // Picking replaces any open editor session (the panel closes; the
      // abandoned reconstruction is kept, as with closeEditor).
      activeGapId: null,
      history: EMPTY_HISTORY,
      pointerMode: "pan" as PointerMode,
    }),

  cancelPickMode: () => set({ pickMode: null }),

  addManualSpan: (beforePointId, afterPointId) => {
    if (beforePointId === afterPointId) return;
    const id = gapId(beforePointId, afterPointId);
    set((state) => ({
      pickMode: null,
      // A replace span keeps the window-derived default: two picked
      // points bound a stretch whose recorded time is the honest source.
      activeGapId: id,
      pointerMode: "draw",
      history: EMPTY_HISTORY,
      // Task 47: reopening a line re-adopts the style it was drawn with.
      pathStyle: state.reconstructions[id]?.pathStyle ?? state.pathStyle,
      manualSpans: state.manualSpans.some((span) => span.id === id)
        ? state.manualSpans
        : [
            ...state.manualSpans,
            { id, kind: "replace", beforePointId, afterPointId },
          ],
      reconstructions: state.reconstructions[id]
        ? state.reconstructions
        : {
            ...state.reconstructions,
            [id]: spanReconstruction(id, { kind: "distance-proportional" }),
          },
      skippedGapIds: state.skippedGapIds.filter((skipped) => skipped !== id),
    }));
  },

  addInsertSpan: (anchorPointId, nextPointId) => {
    if (anchorPointId === nextPointId) return;
    const id = gapId(anchorPointId, nextPointId);
    set((state) => ({
      pickMode: null,
      // Adjacent boundaries → the ~1 s window is meaningless; the
      // unmeasured section's time is pace-estimated from the file.
      activeGapId: id,
      pointerMode: "draw",
      history: EMPTY_HISTORY,
      // Task 47: reopening a line re-adopts the style it was drawn with.
      pathStyle: state.reconstructions[id]?.pathStyle ?? state.pathStyle,
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
        : {
            ...state.reconstructions,
            [id]: spanReconstruction(id, { kind: "pace-estimated" }),
          },
      skippedGapIds: state.skippedGapIds.filter((skipped) => skipped !== id),
    }));
  },

  addExtendSpan: (anchorPointId, side) => {
    const id = side === "before" ? gapIdStart(anchorPointId) : gapIdEnd(anchorPointId);
    set((state) => ({
      pickMode: null,
      // Open extension → no far boundary at all; pace-estimated time.
      activeGapId: id,
      pointerMode: "draw",
      history: EMPTY_HISTORY,
      // Task 47: reopening a line re-adopts the style it was drawn with.
      pathStyle: state.reconstructions[id]?.pathStyle ?? state.pathStyle,
      manualSpans: state.manualSpans.some((span) => span.id === id)
        ? state.manualSpans
        : [...state.manualSpans, { id, kind: "extend", anchorPointId, side }],
      reconstructions: state.reconstructions[id]
        ? state.reconstructions
        : {
            ...state.reconstructions,
            [id]: spanReconstruction(id, { kind: "pace-estimated" }),
          },
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
          ? { activeGapId: null, history: EMPTY_HISTORY, pointerMode: "pan" as PointerMode }
          : {}),
      };
    }),

  setPointerMode: (pointerMode) => set({ pointerMode }),
  setSnapEnabled: (snapEnabled) => set({ snapEnabled }),
  setPenMode: (pen) => set({ pen }),

  setPathStyle: (pathStyle) => set({ pathStyle }),

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

  /**
   * Phase 17 — commit a prepared command for the active gap (the
   * snap apply's `set-line` arrives here; the editor store's twin of
   * this action has served every command family since Phase 4).
   */
  submitCommand: (command) => {
    const state = get();
    const current = activeRecoveryReconstruction(state);
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
      ...(command.kind === "set-line"
        ? styleSyncPatch(state, current.gapId, next.reconstruction)
        : {}),
    });
  },

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
    // The placed segment's mode is decided HERE — the chip state at
    // click time becomes the segment's legStyle, permanently.
    const style = state.pathStyle;
    const command = addVertexCommand(current, position, vertexId(seq), style);
    if (!command) return;
    const next = commitCommand(
      { reconstruction: current, history: state.history },
      command,
    );
    set({
      vertexSeq: seq,
      reconstructions: {
        ...state.reconstructions,
        // The line's remembered style = the last placed segment's style.
        [current.gapId]: withLineStyle(next.reconstruction, style),
      },
      history: next.history,
    });
  },

  insertVertex: (index, position) => {
    const state = get();
    const current = activeRecoveryReconstruction(state);
    if (!current) return;
    const seq = state.vertexSeq + 1;
    // Mid-list inserts inherit the split leg's style; an APPEND takes
    // the chip state, like addVertex.
    const appending = index >= current.vertices.length;
    const style = state.pathStyle;
    const command = insertVertexCommand(
      current,
      index,
      position,
      vertexId(seq),
      style,
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
        [current.gapId]: appending
          ? withLineStyle(next.reconstruction, style)
          : next.reconstruction,
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

  nudgeVertex: (vertexId, dLat, dLon) => {
    const state = get();
    const current = activeRecoveryReconstruction(state);
    if (!current) return;
    const vertex = current.vertices.find((v) => v.id === vertexId);
    if (!vertex) return;
    if (!nudgeInBounds(vertex.lat, vertex.lon, dLat, dLon)) return;
    const command: DrawCommand | null = moveVertexCommand(current, vertexId, {
      lat: vertex.lat + dLat,
      lon: vertex.lon + dLon,
    });
    if (!command) return;
    const next = commitCommand(
      { reconstruction: current, history: state.history },
      command,
      { coalesce: true },
    );
    if (next.reconstruction === current) return;
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

  commitStroke: (points) => {
    const state = get();
    const current = activeRecoveryReconstruction(state);
    if (!current || points.length === 0) return;
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
      reconstructions: {
        ...state.reconstructions,
        [current.gapId]: withLineStyle(next.reconstruction, strokeStyle),
      },
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
    const popped = state.history.undo[state.history.undo.length - 1];
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
      // §EE 17.3: undoing a snap restores the line's style with its
      // geometry — the chips show what the line IS again.
      ...(popped?.kind === "set-line"
        ? styleSyncPatch(state, current.gapId, next.reconstruction)
        : {}),
    });
  },

  redo: () => {
    const state = get();
    const current = activeRecoveryReconstruction(state);
    if (!current) return;
    const popped = state.history.redo[state.history.redo.length - 1];
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
      ...(popped?.kind === "set-line"
        ? styleSyncPatch(state, current.gapId, next.reconstruction)
        : {}),
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
          ? { activeGapId: null, history: EMPTY_HISTORY, pointerMode: "pan" as PointerMode }
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
          ? { activeGapId: null, history: EMPTY_HISTORY, pointerMode: "pan" as PointerMode }
          : {}),
      };
    }),

  hydrate: (payload) =>
    set({
      reconstructions: payload.reconstructions,
      skippedGapIds: payload.skippedGapIds,
      manualSpans: payload.manualSpans,
      fileTiming: payload.fileTiming,
      roadLegs: payload.roadLegs,
      vertexSeq: payload.vertexSeq,
      // No editor is open right after a restore; the user picks a gap and
      // finds the line as they left it.
      activeGapId: null,
      history: EMPTY_HISTORY,
      pickMode: null,
      selectedGapId: null,
      roadRouting: { pending: 0, failed: false },
    }),

  reset: () => set({ ...INITIAL }),
}));
