/**
 * Parse pipeline client (docs/MASTER_PLAN.md Phase 9 §C-2; Phase 14).
 *
 * One entry point for every intake (repair/share, recovery, merge):
 *
 *   runParsePipeline({ bytes, fileName }, { gapThresholds, onProgress })
 *
 * The bytes are sniffed once (§EE 14.1 — magic bytes + extension): GPX
 * and TCX are decoded to text (the same lossy UTF-8 semantics
 * `File#text()` has) and parsed through the injected XmlIo; FIT stays
 * binary and goes to the reader. Small files (below
 * PARSE_WORKER_THRESHOLD_BYTES) run the inline pipeline — parse +
 * validate + gaps on the main thread with the native DOM facade,
 * byte-identical to the pre-Phase-9 behavior every existing test pins.
 * Large files run the same domain pipeline in the parse worker (compact
 * tokenizer XmlIo for XML, pure DataView for FIT) and stream the model
 * back in point chunks so no single structured clone approaches the
 * 200 ms main-thread budget.
 *
 * Failure semantics are explicit:
 *   - A typed parse error (malformed XML, wrong root, bad FIT header,
 *     unknown format) is a RESULT ({ ok: false, error }) — surfaced to
 *     the user as today.
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
import { parseTcx } from "@/features/formats/parse-tcx";
import { parseFit } from "@/features/formats/parse-fit";
import { sniffTrackFormat } from "@/features/formats/sniff";
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

/** The source of one intake: raw bytes + the upload's name (§EE 14.1). */
export interface ParsePipelineSource {
  bytes: ArrayBuffer;
  fileName: string;
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
  source: { format: "gpx" | "tcx"; text: string } | { format: "fit"; bytes: ArrayBuffer },
  options: ParsePipelineOptions,
): ParsePipelineResult {
  const outcome =
    source.format === "fit"
      ? parseFit(new Uint8Array(source.bytes))
      : source.format === "tcx"
        ? parseTcx(source.text, createDomXmlIo())
        : parseGpx(source.text, createDomXmlIo());
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
  request: ParseRequest,
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

    try {
      // Structured clone (no transfer): the main-thread bytes stay intact
      // so the inline fallback can re-run after an infrastructure failure.
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
 * Sniff, parse, validate (+ gap detection) one track file (GPX, TCX, or
 * FIT), off the main thread when it is large. Never throws for user
 * input; infrastructure failures degrade to the inline pipeline.
 */
export async function runParsePipeline(
  source: ParsePipelineSource,
  options: ParsePipelineOptions,
): Promise<ParsePipelineResult> {
  const bytes = new Uint8Array(source.bytes);
  const sniff = sniffTrackFormat(bytes, source.fileName);
  if (sniff.format === "unknown") {
    return {
      ok: false,
      error: { kind: "unsupported-format", detail: sniff.reason },
    };
  }

  // Decode XML formats once (lossy UTF-8 — exactly File#text()).
  let text: string | undefined;
  if (sniff.format !== "fit") {
    text = new TextDecoder("utf-8").decode(bytes);
  }

  const sizeForThreshold =
    sniff.format === "fit" ? bytes.byteLength : (text?.length ?? 0);
  const useWorker =
    sizeForThreshold >= PARSE_WORKER_THRESHOLD_BYTES &&
    typeof Worker !== "undefined";

  if (!useWorker) {
    return runInline(
      sniff.format === "fit"
        ? { format: "fit", bytes: source.bytes }
        : { format: sniff.format, text: text! },
      options,
    );
  }
  const request: ParseRequest = {
    type: "parse",
    format: sniff.format,
    ...(sniff.format === "fit"
      ? { bytes: source.bytes }
      : { text: text! }),
    gapThresholds: options.gapThresholds,
    detectGaps: options.detectGaps !== false,
  };
  try {
    return await runInWorker(request, options);
  } catch (err) {
    // Graceful degradation (§C-4): workers blocked or broken → the
    // inline pipeline still produces the correct result.
    if (typeof console !== "undefined") {
      console.warn(
        "[gpx-repair-studio] parse worker unavailable, parsing inline:",
        err instanceof Error ? err.message : err,
      );
    }
    return runInline(
      sniff.format === "fit"
        ? { format: "fit", bytes: source.bytes }
        : { format: sniff.format, text: text! },
      options,
    );
  }
}
