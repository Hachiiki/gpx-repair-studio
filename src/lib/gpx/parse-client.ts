/**
 * Parse pipeline client (docs/MASTER_PLAN.md Phase 9, §C-2).
 *
 * One entry point for every intake (repair/share, recovery, merge):
 *
 *   runParsePipeline(text, { gapThresholds, onProgress })
 *
 * Small files (below PARSE_WORKER_THRESHOLD_BYTES) run the inline
 * pipeline — parseGpx + validateGpx + detectGpx on the main thread with
 * the native DOM facade, byte-identical to the pre-Phase-9 behavior
 * every existing test pins. Large files run the same domain pipeline in
 * the parse worker (compact tokenizer XmlIo) and stream the model back
 * in point chunks so no single structured clone approaches the 200 ms
 * main-thread budget (§C-2: parse+validate without blocking > 200 ms).
 *
 * Failure semantics are explicit:
 *   - A typed parse error (malformed XML, not-a-gpx, bad version) is a
 *     RESULT ({ ok: false, error }) — surfaced to the user as today.
 *   - An infrastructure failure (Worker unavailable, worker crash,
 *     timeout) falls back to the inline pipeline once — correct output,
 *     blocking parse — so a blocked-worker environment never loses
 *     functionality (§C-4 graceful degradation).
 *
 * The client is browser-only by construction (Worker), but constructing
 * the worker is deferred to call time so SSR/prerender never spawns one.
 */

import { detectGaps, type GapThresholds } from "@/features/gpx/detectGaps";
import { parseGpx } from "@/features/gpx/parse";
import { validateGpx } from "@/features/gpx/validate";
import { createDomXmlIo } from "@/lib/utils/xml";
import type {
  DetectedGap,
  GpxParseError,
  OriginalTrackData,
  OriginalTrackPoint,
  ValidationIssue,
} from "@/types/domain";
import {
  PARSE_WORKER_THRESHOLD_BYTES,
  PARSE_WORKER_TIMEOUT_MS,
  type ParseProgress,
  type ParseRequest,
  type ParseResponse,
} from "./parse-worker-protocol";

export type { ParseProgress } from "./parse-worker-protocol";
export {
  PARSE_WORKER_THRESHOLD_BYTES,
  PARSE_WORKER_TIMEOUT_MS,
} from "./parse-worker-protocol";

export interface ParsePipelineOptions {
  /** Gap thresholds for detection (worker-side; re-runs stay main-side). */
  gapThresholds: GapThresholds;
  /** Progress sink (drives the loading UI for worker parses). */
  onProgress?: (progress: ParseProgress) => void;
  /** False to skip gap detection (the merge tool doesn't need gaps). */
  detectGaps?: boolean;
}

export type ParsePipelineResult =
  | {
      ok: true;
      data: OriginalTrackData;
      issues: readonly ValidationIssue[];
      gaps: readonly DetectedGap[];
    }
  | { ok: false; error: GpxParseError };

// ---------------------------------------------------------------------------
// Inline path (small files — identical to the pre-Phase-9 pipeline)
// ---------------------------------------------------------------------------

function runInline(
  text: string,
  options: ParsePipelineOptions,
): ParsePipelineResult {
  const outcome = parseGpx(text, createDomXmlIo());
  if (!outcome.ok) return { ok: false, error: outcome.error };
  const validated = validateGpx(outcome.data);
  const gaps =
    options.detectGaps === false
      ? []
      : detectGaps(validated.data, options.gapThresholds);
  return {
    ok: true,
    data: validated.data,
    issues: validated.data.issues,
    gaps,
  };
}

// ---------------------------------------------------------------------------
// Worker path (large files)
// ---------------------------------------------------------------------------

/**
 * Run the pipeline in the parse worker and stream the model back.
 * Throws ONLY on infrastructure failure (construction, crash, timeout).
 */
function runInWorker(
  text: string,
  options: ParsePipelineOptions,
): Promise<ParsePipelineResult> {
  return new Promise<ParsePipelineResult>((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(
        new URL("../../workers/parseWorker.ts", import.meta.url),
        { type: "module" },
      );
    } catch (err) {
      reject(err);
      return;
    }

    // Chunked point streams, re-assembled per segment index.
    const chunks = new Map<number, OriginalTrackPoint[][]>();
    let settled = false;
    const resolveLater = (result: ParsePipelineResult): void => {
      // Keeps `finish` the single settle path (terminate + cleanup) — a
      // microtask so the current message dispatch completes first.
      queueMicrotask(() => finish(result));
    };
    const finish = (result: ParsePipelineResult | null, error?: unknown): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
      if (error !== undefined) reject(error);
      else resolve(result!);
    };
    const timer = setTimeout(() => {
      finish(
        null,
        new Error(`parse worker timed out after ${PARSE_WORKER_TIMEOUT_MS} ms`),
      );
    }, PARSE_WORKER_TIMEOUT_MS);

    worker.onerror = (event: ErrorEvent) => {
      finish(null, new Error(`parse worker failed: ${event.message}`));
    };

    worker.onmessage = (event: MessageEvent<ParseResponse>) => {
      const message = event.data;
      switch (message.type) {
        case "progress":
          options.onProgress?.({
            phase: message.phase,
            fraction: message.fraction,
          });
          return;
        case "points": {
          let bucket = chunks.get(message.segIndex);
          if (bucket === undefined) {
            bucket = [];
            chunks.set(message.segIndex, bucket);
          }
          bucket.push(message.points);
          return;
        }
        case "result": {
          if (!message.ok) {
            finish({ ok: false, error: message.error });
            return;
          }
          const shell = message.shell;
          const segments = shell.segments.map((segment, segIndex) => {
            const bucket = chunks.get(segIndex);
            if (bucket === undefined || bucket.length === 0) {
              return segment; // empty segment stayed empty
            }
            // The chunk stream is the authoritative order (segment index
            // + arrival order are both stable).
            return { ...segment, points: bucket.flat() };
          });
          resolveLater({
            ok: true,
            data: { ...shell, segments },
            issues: shell.issues,
            gaps: message.gaps,
          });
          return;
        }
      }
    };

    const request: ParseRequest = {
      type: "parse",
      text,
      gapThresholds: options.gapThresholds,
      detectGaps: options.detectGaps !== false,
    };
    try {
      worker.postMessage(request);
    } catch (err) {
      finish(null, err);
    }
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse + validate (+ gap detection) one GPX document, off the main
 * thread when it is large. Never throws for user input; infrastructure
 * failures degrade to the inline pipeline.
 */
export async function runParsePipeline(
  text: string,
  options: ParsePipelineOptions,
): Promise<ParsePipelineResult> {
  const useWorker =
    text.length >= PARSE_WORKER_THRESHOLD_BYTES &&
    typeof Worker !== "undefined";
  if (!useWorker) {
    return runInline(text, options);
  }
  try {
    return await runInWorker(text, options);
  } catch (err) {
    // Graceful degradation (§C-4): workers blocked or broken → the
    // inline pipeline still produces the correct result.
    if (typeof console !== "undefined") {
      console.warn(
        "[gpx-repair-studio] parse worker unavailable, parsing inline:",
        err instanceof Error ? err.message : err,
      );
    }
    return runInline(text, options);
  }
}
