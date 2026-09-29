/**
 * Parse-worker protocol (docs/MASTER_PLAN.md Phase 9) — the message
 * contract shared by `src/workers/parseWorker.ts` and the client in
 * `src/lib/gpx/parse-client.ts`. Types + constants only: importable from
 * both sides of the worker boundary without dragging app code along.
 *
 * The request carries the decoded file text plus the gap thresholds
 * (gap detection runs worker-side so the main thread never touches the
 * raw document). The response streams back in point chunks so no single
 * structured clone approaches the 200 ms main-thread budget:
 *
 *   main → worker : { type: "parse", text, gapThresholds, detectGaps }
 *   worker → main : { type: "progress", phase, fraction }
 *                 | { type: "points", segIndex, points }   (≤ CHUNK POINTS)
 *                 | { type: "result", ok: true, shell, gaps }
 *                 | { type: "result", ok: false, error }
 *
 * `shell` is the validated model with every segment's `points` array
 * emptied — the client re-fills them from the chunks in arrival order
 * (segment index is the store's own stable ordering).
 */

import type {
  DetectedGap,
  GpxParseError,
  OriginalTrackData,
  OriginalTrackPoint,
} from "@/types/domain";
import type { GapThresholds } from "@/features/gpx/detectGaps";

/** Pipeline phases, in order (the client also uses "read" pre-worker). */
export type ParseWorkerPhase =
  | "parse"
  | "validate"
  | "gaps"
  | "transfer";

export interface ParseProgress {
  phase: ParseWorkerPhase;
  /** 0..1 within the whole pipeline (phases own fixed slices). */
  fraction: number;
}

export interface ParseRequest {
  type: "parse";
  text: string;
  gapThresholds: GapThresholds;
  /** False for consumers that don't need gap detection (merge). */
  detectGaps: boolean;
}

export interface ParseProgressMessage {
  type: "progress";
  phase: ParseWorkerPhase;
  fraction: number;
}

export interface ParsePointsMessage {
  type: "points";
  segIndex: number;
  points: OriginalTrackPoint[];
}

export interface ParseResultOk {
  type: "result";
  ok: true;
  shell: OriginalTrackData;
  gaps: DetectedGap[];
}

export interface ParseResultErr {
  type: "result";
  ok: false;
  error: GpxParseError;
}

export type ParseResponse =
  | ParseProgressMessage
  | ParsePointsMessage
  | ParseResultOk
  | ParseResultErr;

/** Points per streamed chunk — ~8k keeps each clone in the tens of ms. */
export const PARSE_CHUNK_POINTS = 8_192;

/**
 * Files whose decoded text is at least this size route to the worker
 * (~10k+ points for typical GPX). Below it the inline path runs —
 * byte-identical to the pre-Phase-9 behavior every existing test pins.
 */
export const PARSE_WORKER_THRESHOLD_BYTES = 1_000_000;

/** Hard wall-clock budget for one worker parse before fallback (ms). */
export const PARSE_WORKER_TIMEOUT_MS = 120_000;

/** Phase slices of the overall fraction (must sum to 1). */
export const PHASE_SLICES: Record<ParseWorkerPhase, [number, number]> = {
  parse: [0, 0.6],
  validate: [0.6, 0.75],
  gaps: [0.75, 0.8],
  transfer: [0.8, 1],
};

/** Map a phase + inner progress (0..1) to the overall fraction. */
export function phaseFraction(
  phase: ParseWorkerPhase,
  inner: number,
): number {
  const [start, end] = PHASE_SLICES[phase];
  const clamped = Math.min(1, Math.max(0, inner));
  return start + (end - start) * clamped;
}
