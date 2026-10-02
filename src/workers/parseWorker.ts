/// <reference lib="webworker" />
/**
 * Parse worker (docs/MASTER_PLAN.md Phase 9, §C-2; Phase 14 formats).
 *
 * Runs the domain parse pipeline — parse (GPX / TCX / FIT, by the
 * sniffed format) → validateGpx → detectGaps — off the main thread for
 * large files (the client in src/lib/gpx/parse-client.ts decides by
 * size threshold). Domain purity is what makes this a low-risk move:
 * every parser is pure TypeScript given bytes or an XmlIo, and the
 * worker supplies the compact tokenizer XmlIo (lib/gpx/worker-xml.ts)
 * because workers have no DOMParser. The FIT reader is pure DataView
 * math — no adapter needed.
 *
 * The parsed model is streamed back in ≤ PARSE_CHUNK_POINTS chunks so no
 * single structured clone blocks the main thread near the 200 ms budget;
 * progress messages drive the loading UI. A parse failure is a RESULT
 * (typed GpxParseError), never an exception — only an infrastructure
 * failure throws, and the client falls back to the inline path then.
 */

import { detectGaps } from "@/features/gpx/detectGaps";
import { parseGpx } from "@/features/gpx/parse";
import { validateGpx } from "@/features/gpx/validate";
import { parseTcx } from "@/features/formats/parse-tcx";
import { parseFit } from "@/features/formats/parse-fit";
import { createWorkerXmlIo } from "@/lib/gpx/worker-xml";
import {
  PARSE_CHUNK_POINTS,
  phaseFraction,
  type ParseRequest,
  type ParseResponse,
} from "@/lib/gpx/parse-worker-protocol";

self.onmessage = (event: MessageEvent<ParseRequest>) => {
  const request = event.data;
  if (request.type !== "parse") return;
  const post = (message: ParseResponse): void => {
    (self as unknown as Worker).postMessage(message);
  };
  const progress = (phase: Parameters<typeof phaseFraction>[0], inner: number): void => {
    post({ type: "progress", phase, fraction: phaseFraction(phase, inner) });
  };

  try {
    // --- Parse (routed by the sniffed format — §EE 14.1) -----------------
    const io = createWorkerXmlIo({
      onProgress: (consumed, total) => {
        progress("parse", total === 0 ? 1 : consumed / total);
      },
    });
    const outcome =
      request.format === "fit"
        ? parseFit(new Uint8Array(request.bytes ?? new ArrayBuffer(0)))
        : request.format === "tcx"
          ? parseTcx(request.text ?? "", io)
          : parseGpx(request.text ?? "", io);
    if (!outcome.ok) {
      post({ type: "result", ok: false, error: outcome.error });
      return;
    }
    progress("parse", 1);

    // --- Validate ---------------------------------------------------------
    progress("validate", 0.5);
    const validated = validateGpx(outcome.data);
    const data = validated.data;
    progress("validate", 1);

    // --- Gap detection ----------------------------------------------------
    let gaps: ReturnType<typeof detectGaps> = [];
    if (request.detectGaps) {
      progress("gaps", 0.5);
      gaps = detectGaps(data, request.gapThresholds);
    }
    progress("gaps", 1);

    // --- Stream the model back -------------------------------------------
    // Chunks first (final, validated points — the shell's emptied arrays
    // are re-filled by index on the client), then the shell + gaps.
    let totalPoints = 0;
    for (let segIndex = 0; segIndex < data.segments.length; segIndex += 1) {
      const points = data.segments[segIndex].points;
      totalPoints += points.length;
    }
    let sent = 0;
    for (let segIndex = 0; segIndex < data.segments.length; segIndex += 1) {
      const points = data.segments[segIndex].points;
      for (let start = 0; start < points.length; start += PARSE_CHUNK_POINTS) {
        post({
          type: "points",
          segIndex,
          points: points.slice(start, start + PARSE_CHUNK_POINTS),
        });
        sent += Math.min(PARSE_CHUNK_POINTS, points.length - start);
        progress("transfer", totalPoints === 0 ? 1 : sent / totalPoints);
      }
    }
    progress("transfer", 1);

    post({
      type: "result",
      ok: true,
      // The shell: the full validated model minus the points arrays.
      shell: {
        ...data,
        segments: data.segments.map((segment) => ({
          ...segment,
          points: [],
        })),
      },
      gaps,
    });
  } catch (err) {
    // Infrastructure failure only (a throwing io, OOM, …) — the typed
    // parse errors were posted as results above.
    throw err;
  }
};
