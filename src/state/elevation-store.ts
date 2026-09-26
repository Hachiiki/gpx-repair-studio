/**
 * Elevation store (docs/MASTER_PLAN.md §D-4, Phase 6) — the per-gap
 * fetch results, in the road-legs SIDE-TABLE pattern (§D-3: derived
 * network data never lives inside the undoable `Reconstruction`; that
 * type's `elevation` field stays reserved documentation of the concept).
 *
 * Holds one record per gap that has fetched elevation:
 *
 *   - status: `fetching` while requests are in flight, then
 *     `complete` (every sent point resolved), `partial` (some did), or
 *     `failed` (nothing usable);
 *   - provenance: provider id + the `geometryRevision` and road-leg
 *     signature captured when the fetch STARTED — freshness is derived
 *     at read time (either mismatching ⇒ stale);
 *   - the resolved samples (cumulative-distance keyed, §K-2);
 *   - progress counters (answered = final answers, resolved = defined
 *     values) and the honest error message on failure.
 *
 * The `useElevation` hook is the ONLY writer (the same contract the
 * editor store grants `useDrawEditor`). Zustand: usable outside React,
 * so unit tests drive it directly.
 *
 * Phase 6 — Elevation. State only; all math lives in features/.
 */

import { create } from "zustand";
import type { ElevationSample } from "@/features/elevation/samples";
import type { GapId } from "@/types/domain";

export type ElevationFetchStatus = "fetching" | "complete" | "partial" | "failed";

/** One gap's elevation fetch record (see module header). */
export interface ElevationGapRecord {
  status: ElevationFetchStatus;
  providerId: string;
  /** `geometryRevision` of the reconstruction when the fetch started. */
  fetchedAtRevision: number;
  /** `roadLegsSignature` of the resolved legs when the fetch started. */
  fetchedAtRoadSignature: string;
  /** Resolved samples, ascending `cumDistanceM` (empty while fetching). */
  samples: readonly ElevationSample[];
  /** Interior points at fetch time — the disclosure's "sampled from M". */
  totalPoints: number;
  /** Points actually sent (after the per-gap cap). */
  sentPoints: number;
  /** Points with a final answer so far (progress). */
  answeredPoints: number;
  /** Points with a defined elevation so far. */
  resolvedPoints: number;
  /** The fetch's sequence token (superseded-fetch protection). */
  fetchSeq: number;
  /** Human-readable failure reason (status `failed`). */
  error?: string;
}

interface ElevationState {
  byGap: Readonly<Record<string, ElevationGapRecord>>;

  /**
   * Mark a fetch in flight with its fetch-time provenance snapshot.
   * Returns the fetch's sequence token — every later write for this
   * fetch must present it (a superseded fetch's late writes are
   * dropped, the road-generation pattern).
   */
  beginFetch: (gapId: GapId, snapshot: {
    providerId: string;
    fetchedAtRevision: number;
    fetchedAtRoadSignature: string;
    totalPoints: number;
    sentPoints: number;
  }) => number;
  /** Progress tick (answered/resolved so far). */
  setProgress: (
    gapId: GapId,
    fetchSeq: number,
    answered: number,
    resolved: number,
  ) => void;
  /** Finalize with samples and the honest status. */
  finish: (
    gapId: GapId,
    fetchSeq: number,
    result: {
      status: Exclude<ElevationFetchStatus, "fetching">;
      samples: readonly ElevationSample[];
      resolvedPoints: number;
      error?: string;
    },
  ) => void;
  /** Drop one gap's record (manual-span removal etc.). */
  clear: (gapId: GapId) => void;
  /** Drop records for gaps that no longer exist (re-detection). */
  prune: (knownGapIds: readonly GapId[]) => void;
  /** Full reset (new file / session reset). */
  reset: () => void;
}

/** Monotonic fetch-token allocator (module-level: never render state). */
let nextFetchSeq = 0;

export const useElevationStore = create<ElevationState>()((set) => ({
  byGap: {},

  beginFetch: (gapId, snapshot) => {
    const fetchSeq = (nextFetchSeq += 1);
    set((state) => ({
      byGap: {
        ...state.byGap,
        [gapId]: {
          status: "fetching",
          providerId: snapshot.providerId,
          fetchedAtRevision: snapshot.fetchedAtRevision,
          fetchedAtRoadSignature: snapshot.fetchedAtRoadSignature,
          samples: [],
          totalPoints: snapshot.totalPoints,
          sentPoints: snapshot.sentPoints,
          answeredPoints: 0,
          resolvedPoints: 0,
          fetchSeq,
        },
      },
    }));
    return fetchSeq;
  },

  setProgress: (gapId, fetchSeq, answered, resolved) =>
    set((state) => {
      const record = state.byGap[gapId];
      if (
        !record ||
        record.status !== "fetching" ||
        record.fetchSeq !== fetchSeq
      ) {
        return state;
      }
      return {
        byGap: {
          ...state.byGap,
          [gapId]: {
            ...record,
            answeredPoints: answered,
            resolvedPoints: resolved,
          },
        },
      };
    }),

  finish: (gapId, fetchSeq, result) =>
    set((state) => {
      const record = state.byGap[gapId];
      if (
        !record ||
        record.status !== "fetching" ||
        record.fetchSeq !== fetchSeq
      ) {
        return state;
      }
      return {
        byGap: {
          ...state.byGap,
          [gapId]: {
            ...record,
            status: result.status,
            samples: result.samples,
            resolvedPoints: result.resolvedPoints,
            ...(result.error !== undefined ? { error: result.error } : {}),
          },
        },
      };
    }),

  clear: (gapId) =>
    set((state) => {
      if (!(gapId in state.byGap)) return state;
      const byGap = { ...state.byGap };
      delete byGap[gapId];
      return { byGap };
    }),

  prune: (knownGapIds) =>
    set((state) => {
      const known = new Set<string>(knownGapIds);
      const entries = Object.entries(state.byGap).filter(([id]) => known.has(id));
      if (entries.length === Object.keys(state.byGap).length) return state;
      return { byGap: Object.fromEntries(entries) };
    }),

  reset: () => set({ byGap: {} }),
}));
