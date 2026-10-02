/**
 * In-app sample GPX generator (Phase 12 — Task 57 planning §12.1).
 *
 * The samples are the "Try a sample" payloads shipped INSIDE the app
 * bundle (src/samples/*.gpx.ts) so they work fully offline with zero
 * network fetches. This script generates those modules deterministically
 * (seeded PRNG — same seed, byte-identical output), reusing the same
 * mulberry32 generator as the seeded test corpus and the manual demo
 * files (scripts/generate-demo-gpx.ts).
 *
 * Scenarios (gap thresholds: detectGaps defaults — >120 s time-gap,
 * >20 min severe, >25 km/h speed-anomaly):
 *   sample-repair-ride — 3 legs / 2 holes (also the recovery sample):
 *     hole 1: 240 s pause, ~550 m spatial jump  -> time-gap, SUSPECT
 *     hole 2: 1560 s pause, ~2100 m spatial jump -> time-gap, SEVERE
 *   sample-clean-run — single leg, no holes, no anomalies (the share
 *     sample: a continuous route makes the best-looking card).
 *   sample-merge-pair — two sequential legs of one commute with a
 *     20-minute coffee stop between them; part 2 starts where part 1
 *     ended (so "sort by start time" and the map join both behave).
 *
 * The recording interval is 3 s (not the demos' 1 s) purely to keep
 * the bundled strings compact — ~40 KB raw for the largest sample,
 * ~8 KB gzipped.
 *
 * Run (from the repo root):   bun scripts/generate-samples.ts
 * Output:                     src/samples/sample-*.gpx.ts
 *
 * Integrity pinned by tests/samples.test.ts (real parser + gap
 * detector over the generated modules).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mulberry32 } from "../src/features/gpx/fixtures/generators";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(REPO_ROOT, "src/samples");

/** A recording hole: the watch stops writing points for `seconds`. */
interface Hole {
  readonly seconds: number;
  /** Straight-line distance covered while the fix was lost. */
  readonly jumpMeters: number;
}

interface SampleOptions {
  /** <trk><name> and metadata <name>. */
  readonly name: string;
  /** PRNG seed — same seed, byte-identical output. */
  readonly seed: number;
  readonly startLat: number;
  readonly startLon: number;
  /** Initial heading in radians. */
  readonly baseHeading: number;
  /** Recorded seconds per leg. */
  readonly legs: readonly number[];
  /** holes[i] follows legs[i] (same length or empty). */
  readonly holes: readonly Hole[];
  /** Nominal speed, m/s (±8% noise). */
  readonly speedMps: number;
  /** Seconds between recorded points (3 keeps the bundle compact). */
  readonly intervalS: number;
  /** First timestamp, epoch ms. */
  readonly startEpochMs: number;
}

const METERS_PER_DEG_LAT = 111_320;

function trkpt(lat: number, lon: number, ele: number, timeMs: number): string {
  return (
    '    <trkpt lat="' + lat.toFixed(6) + '" lon="' + lon.toFixed(6) +
    '"><ele>' + ele.toFixed(1) + '</ele><time>' +
    new Date(timeMs).toISOString() + "</time></trkpt>"
  );
}

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Generate one single-track GPX 1.1 document. */
function generateSampleGpx(options: SampleOptions): string {
  const random = mulberry32(options.seed);

  let lat = options.startLat;
  let lon = options.startLon;
  let heading = options.baseHeading;
  let ele = 22 + random() * 4;
  let eleTrend = 0;
  let timeMs = options.startEpochMs;
  let pointCount = 0;

  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="GPX Repair Studio Sample Generator" xmlns="http://www.topografix.com/GPX/1/1">',
    "  <metadata>",
    "    <name>" + escapeXml(options.name) + "</name>",
    "    <time>" + new Date(options.startEpochMs).toISOString() + "</time>",
    "  </metadata>",
    "  <trk>",
    "    <name>" + escapeXml(options.name) + "</name>",
    "    <trkseg>",
  ];

  for (let leg = 0; leg < options.legs.length; leg++) {
    for (
      let second = 0;
      second < options.legs[leg];
      second += options.intervalS
    ) {
      // Gentle meander + pace noise: looks like a real easy outing.
      heading += (random() - 0.5) * 0.08;
      const stepM =
        options.speedMps * options.intervalS * (0.92 + random() * 0.16);
      lat += (stepM * Math.cos(heading)) / METERS_PER_DEG_LAT;
      lon +=
        (stepM * Math.sin(heading)) /
        (METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180));

      eleTrend = eleTrend * 0.9 + (random() - 0.5) * 0.6;
      ele += eleTrend * 0.15;

      lines.push(trkpt(lat, lon, ele, timeMs));
      pointCount += 1;
      timeMs += options.intervalS * 1000;
    }

    const hole = options.holes[leg];
    if (hole !== undefined) {
      // Recording hole: time jumps forward and the next recorded point is
      // far away — exactly what a paused watch / lost GPS fix looks like.
      lat += (hole.jumpMeters * Math.cos(heading)) / METERS_PER_DEG_LAT;
      lon +=
        (hole.jumpMeters * Math.sin(heading)) /
        (METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180));
      heading += (random() - 0.5) * 0.6; // new street after the hole
      timeMs += hole.seconds * 1000;
    }
  }

  lines.push("    </trkseg>", "  </trk>", "</gpx>");

  process.stdout.write(
    options.name + ": " + pointCount + " points, " +
      options.holes.length + " hole(s)\n",
  );
  return lines.join("\n") + "\n";
}

/** Write one TS module exporting the GPX as a template literal. */
function writeSampleModule(
  fileName: string,
  exportName: string,
  gpx: string,
  blurb: string,
): void {
  const moduleSource =
    "/**\n" +
    " * " + blurb + "\n" +
    " *\n" +
    " * GENERATED FILE — do not edit. Regenerate with:\n" +
    " *   bun scripts/generate-samples.ts\n" +
    " * (deterministic: the seed in the script pins every byte).\n" +
    " * Integrity pinned by tests/samples.test.ts.\n" +
    " */\n" +
    "\n" +
    "export const " + exportName + " = `" + gpx + "`;\n";
  writeFileSync(join(OUT_DIR, fileName), moduleSource);
}

/** Quezon Memorial Circle, Quezon City (same start as the demo files). */
const QC_START = { lat: 14.6488, lon: 121.0377 } as const;
const SATURDAY_6AM_MS = Date.parse("2026-10-02T22:00:00Z"); // Sun 06:00 PHST

mkdirSync(OUT_DIR, { recursive: true });

// -- repair + recovery sample: the star — a ride with two GPS gaps -----
const repairGpx = generateSampleGpx({
  name: "Sample Ride with Two GPS Gaps",
  seed: 20261003,
  startLat: QC_START.lat,
  startLon: QC_START.lon,
  baseHeading: -0.6,
  legs: [420, 300, 480],
  holes: [
    { seconds: 240, jumpMeters: 550 },
    { seconds: 1560, jumpMeters: 2100 },
  ],
  speedMps: 3.2,
  intervalS: 3,
  startEpochMs: SATURDAY_6AM_MS,
});
writeSampleModule(
  "sample-repair-ride.gpx.ts",
  "SAMPLE_REPAIR_RIDE_GPX",
  repairGpx,
  'The bundled "Try a sample" ride for the repair + recovery tools:\n * three legs with two recording holes (240 s SUSPECT + 1560 s SEVERE\n * time-gaps under the default thresholds).',
);

// -- share sample: a clean continuous run --------------------------------
const cleanGpx = generateSampleGpx({
  name: "Sample Steady Run",
  seed: 20261004,
  startLat: QC_START.lat,
  startLon: QC_START.lon,
  baseHeading: 2.2,
  legs: [660],
  holes: [],
  speedMps: 2.8,
  intervalS: 3,
  startEpochMs: SATURDAY_6AM_MS + 7 * 24 * 3_600_000,
});
writeSampleModule(
  "sample-clean-run.gpx.ts",
  "SAMPLE_CLEAN_RUN_GPX",
  cleanGpx,
  'The bundled "Try a sample" run for the share-card tool: one clean\n * continuous leg — no holes, no anomalies — so the card shows a\n * complete route.',
);

// -- merge sample: one commute, two recordings ----------------------------
// Part 1 ends wherever the generator left it; part 2 starts AT that
// point 20 minutes later (a coffee stop) — the merge demo narrative.
interface EndPoint {
  lat: number;
  lon: number;
  heading: number;
  ele: number;
  eleTrend: number;
  endMs: number;
}

function generateSampleGpxTrackingEnd(options: SampleOptions): {
  gpx: string;
  end: EndPoint;
} {
  // Duplicate of the generator above, but reporting the final wandering
  // state so the merge pair can chain from it.
  const random = mulberry32(options.seed);
  let lat = options.startLat;
  let lon = options.startLon;
  let heading = options.baseHeading;
  let ele = 22 + random() * 4;
  let eleTrend = 0;
  let timeMs = options.startEpochMs;
  let pointCount = 0;

  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="GPX Repair Studio Sample Generator" xmlns="http://www.topografix.com/GPX/1/1">',
    "  <metadata>",
    "    <name>" + escapeXml(options.name) + "</name>",
    "    <time>" + new Date(options.startEpochMs).toISOString() + "</time>",
    "  </metadata>",
    "  <trk>",
    "    <name>" + escapeXml(options.name) + "</name>",
    "    <trkseg>",
  ];

  for (let leg = 0; leg < options.legs.length; leg++) {
    for (
      let second = 0;
      second < options.legs[leg];
      second += options.intervalS
    ) {
      heading += (random() - 0.5) * 0.08;
      const stepM =
        options.speedMps * options.intervalS * (0.92 + random() * 0.16);
      lat += (stepM * Math.cos(heading)) / METERS_PER_DEG_LAT;
      lon +=
        (stepM * Math.sin(heading)) /
        (METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180));
      eleTrend = eleTrend * 0.9 + (random() - 0.5) * 0.6;
      ele += eleTrend * 0.15;
      lines.push(trkpt(lat, lon, ele, timeMs));
      pointCount += 1;
      timeMs += options.intervalS * 1000;
    }
    const hole = options.holes[leg];
    if (hole !== undefined) {
      lat += (hole.jumpMeters * Math.cos(heading)) / METERS_PER_DEG_LAT;
      lon +=
        (hole.jumpMeters * Math.sin(heading)) /
        (METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180));
      heading += (random() - 0.5) * 0.6;
      timeMs += hole.seconds * 1000;
    }
  }
  lines.push("    </trkseg>", "  </trk>", "</gpx>");
  process.stdout.write(
    options.name + ": " + pointCount + " points, " +
      options.holes.length + " hole(s)\n",
  );
  return {
    gpx: lines.join("\n") + "\n",
    end: { lat, lon, heading, ele, eleTrend, endMs: timeMs },
  };
}

const part1 = generateSampleGpxTrackingEnd({
  name: "Sample Commute Part 1",
  seed: 20261005,
  startLat: QC_START.lat,
  startLon: QC_START.lon,
  baseHeading: 0.4,
  legs: [240],
  holes: [],
  speedMps: 4.2,
  intervalS: 3,
  startEpochMs: SATURDAY_6AM_MS + 14 * 24 * 3_600_000,
});

const part2 = generateSampleGpx({
  name: "Sample Commute Part 2",
  seed: 20261006,
  startLat: part1.end.lat,
  startLon: part1.end.lon,
  baseHeading: part1.end.heading + 0.9,
  legs: [300],
  holes: [],
  speedMps: 4.2,
  intervalS: 3,
  // 20 minutes later — the coffee stop between the two recordings.
  startEpochMs: part1.end.endMs + 20 * 60 * 1000,
});

writeSampleModule(
  "sample-merge-pair.gpx.ts",
  "SAMPLE_MERGE_PAIR_GPX_A",
  part1.gpx,
  "The bundled \"Try a sample pair\" for the merge tool — part 1 of a\n * commute (this file) and part 2 (SAMPLE_MERGE_PAIR_GPX_B), recorded\n * 20 minutes apart: part 2 starts where part 1 ended.",
);
writeSampleModule(
  "sample-merge-pair-b.gpx.ts",
  "SAMPLE_MERGE_PAIR_GPX_B",
  part2,
  "The merge sample's part 2 — see sample-merge-pair.gpx.ts.",
);
