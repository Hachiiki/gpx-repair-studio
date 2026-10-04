/**
 * Batch store (Phase 18 — docs/MASTER_PLAN.md §EE 18.1) — the state
 * container of the Batch section, fully isolated from the other
 * sections (the Task 43 pattern).
 *
 * The Batch tool's workflow: drop N track files on the landing's batch
 * tool page (the intake), then work the QUEUE in the studio — per-file
 * status, a Phase 13 preset run across every parsed file (previewed
 * per file before anything is applied), and one ZIP export with a
 * manifest of what changed. This store holds the queue; the parse
 * orchestration lives in `hooks/use-batch-session.ts` (the merge
 * store's discipline — the container never awaits).
 *
 * Honesty rules that shape the shape:
 *   - each item keeps its ORIGINAL `File` (the bytes are the source of
 *     truth; the working copy is derived, never a replacement);
 *   - `edits` is the per-file twin of the repair section's working-copy
 *     log — the same `WorkingEdit` vocabulary, applied by the same pure
 *     `applyWorkingEdits`, so a batch fix and a manual fix can never
 *     disagree about what an edit means;
 *   - `exported` is a fact, not a lock — re-exporting is always
 *     allowed (the flag only drives the status word and the manifest).
 *
 * Phase 18 — Batch & portable sessions. Zustand plain-object store,
 * usable outside React (unit tests included).
 */

import { create } from "zustand";
import type { SessionError } from "@/state/session-store";
import type {
  DetectedGap,
  OriginalTrackData,
  ValidationIssue,
  WorkingEdit,
} from "@/types/domain";

/** The section's two screens (the merge section's phase pattern). */
export type BatchPhase = "intake" | "studio";

/**
 * One queued file. The queue state machine (§EE "queue state-machine
 * tests"): `queued` → `parsing` → `parsed` | `failed`, then the
 * per-file work flags — `edits.length > 0` means fixed, `exported`
 * means downloaded. Removal is allowed from every state.
 */
export interface BatchItem {
  /** Unique within this session: `b1`, `b2`, … (never reused). */
  id: string;
  fileName: string;
  /** The original upload — the bytes never change after intake. */
  source: File;
  status: "queued" | "parsing" | "parsed" | "failed";
  /** The typed load failure; `null` unless status is "failed". */
  error: SessionError | null;
  /** The validated frozen original model; `null` unless parsed. */
  data: OriginalTrackData | null;
  /** Gaps detected at intake (the ui-store thresholds, like a repair upload). */
  gaps: readonly DetectedGap[];
  /** The file-level validation report (parse issues). */
  issues: readonly ValidationIssue[];
  /** Batch-applied working-copy fixes (Phase 13 vocabulary). */
  edits: readonly WorkingEdit[];
  /** The last applied preset's name (the manifest's "applied:" line). */
  presetName: string | null;
  /** This file's repaired export has been downloaded in this session. */
  exported: boolean;
}

/**
 * The queue's honest ceiling. Fifty files is far beyond a cleanup errand
 * and keeps the studio's memory bounded (every parsed model lives in
 * RAM); the intake refuses beyond it with a plain sentence instead of
 * silently dropping or choking.
 */
export const MAX_BATCH_FILES = 50;

interface BatchState {
  phase: BatchPhase;
  /** The queue, in intake order. */
  items: readonly BatchItem[];
  /** Monotonic id source — reset only by `reset()`. */
  idSeq: number;

  /**
   * Append queued placeholders for the given files; returns the ids in
   * the same order. Files past the cap are refused — the returned
   * `{ accepted, refused }` split is the honest answer the intake
   * renders (nothing is silently dropped).
   */
  enqueue: (files: readonly File[]) => {
    accepted: { id: string; file: File }[];
    refused: File[];
  };
  /** One item entered parsing. */
  beginParse: (id: string) => void;
  /** Store one file's successful parse. */
  setParsed: (
    id: string,
    parsed: {
      data: OriginalTrackData;
      gaps: readonly DetectedGap[];
      issues: readonly ValidationIssue[];
    },
  ) => void;
  /** Store one file's typed load failure. */
  setFailed: (id: string, error: SessionError) => void;
  /** Drop one item from the queue (any status). */
  removeItem: (id: string) => void;
  /** Apply a confirmed preset's edit list to one item (the whole chain, atomically). */
  applyEdits: (id: string, edits: readonly WorkingEdit[], presetName?: string) => void;
  /** Undo one item's most recent edit (the log is the undo stack, one entry per fix). */
  undoLastEdit: (id: string) => boolean;
  /** Mark one item exported (a fact for the status word, never a lock). */
  markExported: (ids: readonly string[]) => void;
  /** Enter the studio (requires ≥ 1 parsed file — the tool's contract). */
  enterStudio: () => boolean;
  /** Leave the studio back to the intake (the queue is kept). */
  backToIntake: () => void;
  /** Clear everything (the header's reset / "Start over"). */
  reset: () => void;
}

/** Fresh state factory (also the reset target). */
function initialBatchState() {
  return {
    phase: "intake" as BatchPhase,
    items: [] as readonly BatchItem[],
    idSeq: 1,
  };
}

export const useBatchStore = create<BatchState>()((set, get) => ({
  ...initialBatchState(),

  enqueue: (files) => {
    const { items, idSeq } = get();
    const room = Math.max(0, MAX_BATCH_FILES - items.length);
    const acceptedFiles = files.slice(0, room);
    const refused = files.slice(room);
    let seq = idSeq;
    const accepted = acceptedFiles.map((file) => {
      const id = `b${seq++}`;
      return { id, file };
    });
    if (accepted.length > 0) {
      const entries: BatchItem[] = accepted.map(({ id, file }) => ({
        id,
        fileName: file.name,
        source: file,
        status: "queued" as const,
        error: null,
        data: null,
        gaps: [],
        issues: [],
        edits: [],
        presetName: null,
        exported: false,
      }));
      set({ items: [...items, ...entries], idSeq: seq });
    }
    return { accepted, refused };
  },

  beginParse: (id) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id && item.status === "queued"
          ? { ...item, status: "parsing" as const }
          : item,
      ),
    })),

  setParsed: (id, parsed) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id
          ? {
              ...item,
              status: "parsed" as const,
              error: null,
              data: parsed.data,
              gaps: parsed.gaps,
              issues: parsed.issues,
            }
          : item,
      ),
    })),

  setFailed: (id, error) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id
          ? {
              ...item,
              status: "failed" as const,
              error,
              data: null,
              gaps: [],
              issues: [],
            }
          : item,
      ),
    })),

  removeItem: (id) =>
    set((state) => ({ items: state.items.filter((item) => item.id !== id) })),

  applyEdits: (id, edits, presetName) => {
    if (edits.length === 0) return;
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id
          ? {
              ...item,
              edits: [...item.edits, ...edits],
              ...(presetName !== undefined ? { presetName } : {}),
            }
          : item,
      ),
    }));
  },

  undoLastEdit: (id) => {
    const item = get().items.find((entry) => entry.id === id);
    if (!item || item.edits.length === 0) return false;
    set((state) => ({
      items: state.items.map((entry) =>
        entry.id === id
          ? {
              ...entry,
              edits: entry.edits.slice(0, -1),
              // An emptied log has no preset story to tell.
              ...(entry.edits.length === 1 ? { presetName: null } : {}),
            }
          : entry,
      ),
    }));
    return true;
  },

  markExported: (ids) =>
    set((state) => ({
      items: state.items.map((item) =>
        ids.includes(item.id) ? { ...item, exported: true } : item,
      ),
    })),

  enterStudio: () => {
    const { phase, items } = get();
    if (phase === "studio") return false;
    if (!items.some((item) => item.status === "parsed")) return false;
    set({ phase: "studio" });
    return true;
  },

  backToIntake: () => set({ phase: "intake" }),

  reset: () => set(initialBatchState()),
}));
