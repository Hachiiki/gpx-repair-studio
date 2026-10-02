/**
 * In-app sample files (Phase 12 — "Try a sample", §EE 12.1).
 *
 * One curated synthetic recording per file workflow, shipped INSIDE
 * the bundle (generated TS modules — no network fetch, offline-safe
 * from day one). A sample enters the app as a real `File` through the
 * SAME load pipeline as an upload: `makeSampleFile("repair-ride")`
 * handed to the session's `loadFile` — identical provenance rules,
 * identical validation, no special-casing anywhere downstream.
 *
 * Which sample serves which tool:
 *   repair + recovery → repair-ride (two time-gaps: SUSPECT + SEVERE —
 *     exactly the scenario both tools exist for; recovery needs
 *     timestamps bracketing the hole, which the generator guarantees)
 *   share → clean-run (one continuous leg — the best-looking card)
 *   merge → the commute pair (two files, 20 min apart, chained
 *     end-to-start; added together through the merge intake)
 *   create → no file exists — the stats form carries its own
 *     "Use example numbers" prefill instead
 *   plan → starts empty by design (the map is the input)
 *
 * The file names all say "sample" so the header, the QA surface, and
 * any export stay honest about the data's origin.
 */

import { SAMPLE_REPAIR_RIDE_GPX } from "./sample-repair-ride.gpx";
import { SAMPLE_CLEAN_RUN_GPX } from "./sample-clean-run.gpx";
import { SAMPLE_MERGE_PAIR_GPX_A } from "./sample-merge-pair.gpx";
import { SAMPLE_MERGE_PAIR_GPX_B } from "./sample-merge-pair-b.gpx";

export type SampleId = "repair-ride" | "clean-run" | "merge-a" | "merge-b";

export interface SampleDefinition {
  /** The download/upload file name (always says "sample"). */
  readonly fileName: string;
  /** What the sample demonstrates (aria-labels, tests). */
  readonly summary: string;
}

export const SAMPLES: Record<SampleId, SampleDefinition> = {
  "repair-ride": {
    fileName: "sample-ride-with-gaps.gpx",
    summary:
      "A synthetic ride with two GPS gaps — one suspect, one severe — and full timestamps.",
  },
  "clean-run": {
    fileName: "sample-steady-run.gpx",
    summary:
      "A synthetic steady run with no gaps and no anomalies — a clean continuous route.",
  },
  "merge-a": {
    fileName: "sample-commute-part-1.gpx",
    summary: "The first half of a synthetic two-part commute.",
  },
  "merge-b": {
    fileName: "sample-commute-part-2.gpx",
    summary:
      "The second half of the same commute, recorded 20 minutes later where part 1 ended.",
  },
};

const SAMPLE_CONTENT: Record<SampleId, string> = {
  "repair-ride": SAMPLE_REPAIR_RIDE_GPX,
  "clean-run": SAMPLE_CLEAN_RUN_GPX,
  "merge-a": SAMPLE_MERGE_PAIR_GPX_A,
  "merge-b": SAMPLE_MERGE_PAIR_GPX_B,
};

/**
 * Build the sample as a real `File` — byte-identical to the generated
 * module, named so every downstream surface keeps its honesty.
 */
export function makeSampleFile(id: SampleId): File {
  return new File([SAMPLE_CONTENT[id]], SAMPLES[id].fileName, {
    type: "application/gpx+xml",
  });
}
