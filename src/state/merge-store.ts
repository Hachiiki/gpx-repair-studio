/**
 * Merge store (Task 43) — the state container of the Merge section,
 * fully isolated from the other three sections.
 *
 * The Merge tool's workflow: collect two or more GPX files on the
 * landing's merge tool page (the intake), then combine them into ONE
 * route and arrange the result in the studio. This store holds:
 *
 *   - the phase — "intake" (collecting files; the landing's merge tool
 *     page shows the intake) or "studio" (the combined route is being
 *     arranged); the shell derives the section from it exactly like the
 *     create section does from its form phase;
 *   - the file list — one entry per collected file, in MERGE ORDER (the
 *     array IS the order; moving a file swaps it in place). Parsing is
 *     orchestrated by the section's hook (`use-merge-session`), which
 *     writes results back through `setParsed` / `setFileError`;
 *   - the combined activity name — the one editable string the merged
 *     file carries (metadata `<name>` AND the single track's `<name>`).
 *
 * The merged MODEL is never stored: it is derived (pure `mergeGpxFiles`
 * + `validateGpx`) by the section's hook from the ordered parsed files,
 * so a reorder or a rename is a fresh deterministic merge with no state
 * to invalidate — the same derived-not-stored discipline the sections'
 * active flag follows.
 *
 * Zustand plain-object store, usable outside React (unit tests included).
 */

import { create } from "zustand";
import type { FileSummary } from "@/features/gpx/mergeFiles";
import type { OriginalTrackData } from "@/types/domain";
import type { SessionError } from "@/state/session-store";

/** The section's two screens. */
export type MergePhase = "intake" | "studio";

/** One collected file: parse status + (on success) the frozen model. */
export interface MergeFileEntry {
  /** Unique within this session: `f1`, `f2`, … (never reused). */
  id: string;
  fileName: string;
  status: "parsing" | "parsed" | "error";
  /** The validated frozen model; `null` unless status is "parsed". */
  model: OriginalTrackData | null;
  /** The typed load failure; `null` unless status is "error". */
  error: SessionError | null;
  /** Display stats (counts + timing bounds) once parsed. */
  summary: FileSummary | null;
  /** The file's recorded distance, for the intake's list rows. */
  distanceM: number | null;
}

interface MergeState {
  phase: MergePhase;
  /** Collected files, in merge order (the array is the order). */
  files: readonly MergeFileEntry[];
  /** The merged activity's name ("" → no name in the export). */
  combinedName: string;
  /** Monotonic id source — reset only by `reset()`. */
  idSeq: number;

  /** Append `n` parsing placeholders (the hook fills them in). */
  beginFiles: (fileNames: readonly string[]) => string[];
  /** Store one file's successful parse. */
  setParsed: (
    id: string,
    parsed: {
      model: OriginalTrackData;
      summary: FileSummary;
      distanceM: number;
    },
  ) => void;
  /** Store one file's typed load failure. */
  setFileError: (id: string, error: SessionError) => void;
  /** Drop a file from the list (any status). */
  removeFile: (id: string) => void;
  /** Swap a file one position up (−1) or down (+1) in the merge order. */
  moveFile: (id: string, direction: -1 | 1) => void;
  /** Stable-sort the parsed files by their first timestamp (undated last). */
  sortByStartTime: () => void;
  /** Edit the combined activity's name. */
  setCombinedName: (name: string) => void;
  /**
   * Enter the studio (requires ≥ 2 parsed files — the tool's contract).
   * Returns whether the phase changed.
   */
  combine: () => boolean;
  /** Leave the studio back to the intake (files kept). */
  backToIntake: () => void;
  /** Clear everything (the header's reset / "Start over"). */
  reset: () => void;
}

/** Fresh state factory (also the reset target). */
function initialMergeState() {
  return {
    phase: "intake" as MergePhase,
    files: [] as readonly MergeFileEntry[],
    combinedName: "",
    idSeq: 1,
  };
}

export const useMergeStore = create<MergeState>()((set, get) => ({
  ...initialMergeState(),

  beginFiles: (fileNames) => {
    const { files, idSeq } = get();
    // ids come from the running sequence (never reused, unique per call
    // even for duplicate file names).
    let seq = idSeq;
    const entries = fileNames.map((fileName) => ({
      id: `f${seq++}`,
      fileName,
      status: "parsing" as const,
      model: null,
      error: null,
      summary: null,
      distanceM: null,
    }));
    set({ files: [...files, ...entries], idSeq: seq });
    return entries.map((e) => e.id);
  },

  setParsed: (id, parsed) =>
    set((state) => ({
      files: state.files.map((file) =>
        file.id === id
          ? {
              ...file,
              status: "parsed",
              model: parsed.model,
              summary: parsed.summary,
              distanceM: parsed.distanceM,
              error: null,
            }
          : file,
      ),
    })),

  setFileError: (id, error) =>
    set((state) => ({
      files: state.files.map((file) =>
        file.id === id
          ? { ...file, status: "error", model: null, summary: null, distanceM: null, error }
          : file,
      ),
    })),

  removeFile: (id) =>
    set((state) => ({ files: state.files.filter((file) => file.id !== id) })),

  moveFile: (id, direction) =>
    set((state) => {
      const index = state.files.findIndex((file) => file.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= state.files.length) {
        return state; // already at the edge — a no-op, not an error
      }
      const files = [...state.files];
      const [moved] = files.splice(index, 1);
      files.splice(target, 0, moved);
      return { files };
    }),

  sortByStartTime: () =>
    set((state) => {
      // Stable sort (Array.prototype.sort is stable per spec): undated
      // files keep their relative order at the end.
      const files = [...state.files].sort((a, b) => {
        const at = a.status === "parsed" ? a.summary?.firstTimeMs : undefined;
        const bt = b.status === "parsed" ? b.summary?.firstTimeMs : undefined;
        if (at === undefined && bt === undefined) return 0;
        if (at === undefined) return 1;
        if (bt === undefined) return -1;
        return at - bt;
      });
      return { files };
    }),

  setCombinedName: (combinedName) => set({ combinedName }),

  combine: () => {
    const parsed = get().files.filter((file) => file.status === "parsed");
    if (parsed.length < 2 || get().phase === "studio") return false;
    set({ phase: "studio" });
    return true;
  },

  backToIntake: () => set({ phase: "intake" }),

  reset: () => set(initialMergeState()),
}));

/** The files that participate in the merge, in order (errors excluded). */
export function parsedMergeFiles(
  state: Pick<MergeState, "files">,
): readonly MergeFileEntry[] {
  return state.files.filter((file) => file.status === "parsed");
}
