/**
 * Working store (Phase 13) — the state container of the working-copy
 * layer (§EE 13.2).
 *
 * Holds the edit LOG (append-only; every entry a user-confirmed fix
 * with its reason and timestamp) and the session-scoped deep-check
 * thresholds. Nothing else: deriving the working view
 * (`applyWorkingEdits`) and the report (`deepValidate`) is the hook
 * layer's memoized business — this store is the state other layers
 * subscribe to, usable outside React (unit tests included).
 *
 * Undo semantics: `undo` pops the LAST edit — exactly the fix that was
 * most recently confirmed. The log IS the undo history; there is no
 * separate stack to drift out of sync. The log is also the change log
 * the report UI renders (label, reason, timestamp) and what the
 * Phase 10 autosave persists (schema v2 `workingEdits`).
 *
 * Lifecycle: edits belong to the file they were made on — `reset` with
 * the session (the deep-validation hook drives it, the same pattern as
 * the editor store). Thresholds are session-scoped by design: they are
 * per-file investigative tools, not preferences.
 *
 * Phase 13 — Deep validation & repair presets. Zustand plain-object
 * store.
 */

import { create } from "zustand";
import type { DeepValidateOptions } from "@/features/validation/deepValidate";
import type { WorkingEdit } from "@/types/domain";

interface WorkingState {
  /** The confirmed-fix log, oldest first (undo pops the tail). */
  edits: readonly WorkingEdit[];
  /** Deep-check thresholds (session-scoped; defaults from the spec). */
  options: DeepValidateOptions;

  /** Append one confirmed fix (one undo step). */
  applyEdit: (edit: WorkingEdit) => void;
  /** Pop the most recent edit; returns it (null when the log is empty). */
  undo: () => WorkingEdit | null;
  /** Patch the thresholds (a pure re-derivation trigger, §D-3.5). */
  setOptions: (patch: Partial<DeepValidateOptions>) => void;
  /** Restore persisted edits after a session re-parse (Phase 10, v2). */
  hydrate: (edits: readonly WorkingEdit[]) => void;
  /** Full reset (new file / leaving the session). */
  reset: () => void;
}

/** Monotonic edit-id allocator (never reused within a session). */
let editSeq = 0;

/** Allocate the next deterministic edit id (`fix/1`, `fix/2`, …). */
export function nextEditId(): string {
  editSeq += 1;
  return `fix/${editSeq}`;
}

/** Re-arm the allocator after a hydrate (ids stay unique). */
export function rearmEditSeq(edits: readonly WorkingEdit[]): void {
  let highest = 0;
  for (const edit of edits) {
    const match = /^fix\/(\d+)$/.exec(edit.id);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  editSeq = highest;
}

const INITIAL = {
  edits: [] as readonly WorkingEdit[],
  options: {} as DeepValidateOptions,
};

export const useWorkingStore = create<WorkingState>()((set, get) => ({
  ...INITIAL,

  applyEdit: (edit) => set({ edits: [...get().edits, edit] }),

  undo: () => {
    const { edits } = get();
    if (edits.length === 0) return null;
    const last = edits[edits.length - 1];
    set({ edits: edits.slice(0, -1) });
    return last;
  },

  setOptions: (patch) => set({ options: { ...get().options, ...patch } }),

  hydrate: (edits) => {
    rearmEditSeq(edits);
    set({ edits: [...edits] });
  },

  reset: () => set({ edits: [], options: {} }),
}));
