/**
 * Session store (docs/MASTER_PLAN.md §D-4) — the lifecycle of one GPX file
 * inspection/repair session.
 *
 * Holds: upload status, file name, the validated original model (frozen,
 * never mutated), detected gaps, and the user-facing failure of the last
 * load attempt. The parse/validate/detect pipeline itself lives in
 * `hooks/use-gpx-session.ts` (application layer) — this store is the state
 * container other layers subscribe to (Phase 3's map sync, Phase 4's
 * editor, …).
 *
 * Original data immutability: `data` is replaced wholesale (`setParsed`),
 * never edited in place. Gaps may be re-computed (`setGaps`) when the user
 * changes detection thresholds — a pure re-derivation, not a mutation.
 *
 * Phase 2 — Upload & Inspection UI. Zustand plain-object store, usable
 * outside React (unit tests included).
 */

import { create } from "zustand";
import type { DetectedGap, OriginalTrackData } from "@/types/domain";

export type SessionStatus = "idle" | "loading" | "parsed" | "error";

/**
 * A user-facing load failure. Produced by `describeParseError` (hook layer)
 * from the typed `GpxParseError`, plus read failures — never raw exceptions.
 */
export interface SessionError {
  title: string;
  detail: string;
  line?: number;
  column?: number;
}

interface SessionState {
  status: SessionStatus;
  fileName: string | null;
  /** The validated, frozen original model; `null` unless status is "parsed". */
  data: OriginalTrackData | null;
  gaps: readonly DetectedGap[];
  error: SessionError | null;

  /** Enter the loading state for a new file (keeps the previous view until parsed). */
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
  /** Return to the idle (empty) state. */
  reset: () => void;
}

const IDLE = {
  status: "idle" as SessionStatus,
  fileName: null,
  data: null,
  gaps: [] as readonly DetectedGap[],
  error: null,
};

export const useSessionStore = create<SessionState>()((set) => ({
  ...IDLE,

  beginLoad: (fileName) => set({ status: "loading", fileName }),
  setParsed: (fileName, data, gaps) =>
    set({ status: "parsed", fileName, data, gaps, error: null }),
  setGaps: (gaps) => set({ gaps }),
  fail: (error) => set({ status: "error", error, data: null, gaps: [] }),
  reset: () => set(IDLE),
}));
