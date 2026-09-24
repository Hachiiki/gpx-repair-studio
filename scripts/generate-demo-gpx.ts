/**
 * Demo GPX sample generator — MANUAL-testing aid, not part of the test corpus.
 *
 * The automated corpus builds its fixtures from the seeded generator in
 * src/features/gpx/fixtures/generators.ts (single-gap, huge, perf-oriented).
 * Manual testers need small, friendly, multi-gap samples they can upload
 * through the real UI — this script produces those, deterministically, by
 * reusing the same seeded PRNG (one random-source implementation).
 *
 * Scenarios (gap thresholds: detectGaps defaults — >120 s time-gap,
 * >20 min severe, >25 km/h speed-anomaly):
 *   demo-qc-run-with-gaps.gpx — 3 legs / 2 holes:
 *     hole 1: 240 s pause, ~550 m spatial jump  -> time-gap, SUSPECT
 *     hole 2: 1560 s pause, ~2100 m spatial jump -> time-gap, SEVERE
 *   demo-clean-run.gpx — single leg, no holes, no anomalies.
 *
 * Run (from the repo root):    bun scripts/generate-demo-gpx.ts
 * Output:                      download/demo-qc-run-with-gaps.gpx
 *                              download/demo-clean-run.gpx
 *
 * Integrity of both files is pinned by tests/demo-samples.test.ts.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mulberry32 } from "../src/features/gpx/fixtures/generators";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(REPO_ROOT, "download");

/** A recording hole: the watch stops writing points for `seconds`. */
interface Hole {
  readonly seconds: number;
  /** Straight-line distance the runner covered while the fix was lost. */
  readonly jumpMeters: number;
}

interface DemoRunOptions {
  /** <trk><name> and metadata <name>. */
  readonly name: string;
  /** PRNG seed — same seed, byte-identical output. */
  readonly seed: number;
  readonly startLat: number;
  readonly startLon: number;
  /** Initial heading in radians. */
  readonly baseHeading: number;
  /** Recorded seconds per leg (1 point per second). */
  readonly legs: readonly number[];
  /** holes[i] follows legs[i] (same length or empty). */
  readonly holes: readonly Hole[];
  /** Nominal running speed, m/s (±8% noise). */
  readonly speedMps: number;
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

/** Generate one single-track GPX 1.1 document for a demo run. */
function generateDemoGpx(options: DemoRunOptions): string {
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
    '<gpx version="1.1" creator="GPX Repair Studio Demo Generator" xmlns="http://www.topografix.com/GPX/1/1">',
    "  <metadata>",
    "    <name>" + escapeXml(options.name) + "</name>",
    "    <time>" + new Date(options.startEpochMs).toISOString() + "</time>",
    "  </metadata>",
    "  <trk>",
    "    <name>" + escapeXml(options.name) + "</name>",
    "    <trkseg>",
  ];

  for (let leg = 0; leg < options.legs.length; leg++) {
    for (let second = 0; second < options.legs[leg]; second++) {
      // Gentle meander + pace noise: looks like a real easy run.
      heading += (random() - 0.5) * 0.08;
      const stepM = options.speedMps * (0.92 + random() * 0.16);
      lat += (stepM * Math.cos(heading)) / METERS_PER_DEG_LAT;
      lon +=
        (stepM * Math.sin(heading)) /
        (METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180));

      eleTrend = eleTrend * 0.9 + (random() - 0.5) * 0.6;
      ele += eleTrend * 0.15;

      lines.push(trkpt(lat, lon, ele, timeMs));
      pointCount += 1;
      timeMs += 1000;
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

/** Quezon Memorial Circle, Quezon City — 2026-09-20 06:00 PHST (UTC+8). */
const QC_START = { lat: 14.6488, lon: 121.0377 } as const;
const SUNDAY_MORNING_MS = Date.parse("2026-09-19T22:00:00Z");

mkdirSync(OUT_DIR, { recursive: true });

writeFileSync(
  join(OUT_DIR, "demo-qc-run-with-gaps.gpx"),
  generateDemoGpx({
    name: "QC Circle Morning Run (demo - 2 GPS gaps)",
    seed: 20260920,
    startLat: QC_START.lat,
    startLon: QC_START.lon,
    baseHeading: -0.6,
    legs: [420, 480, 360],
    holes: [
      { seconds: 240, jumpMeters: 550 },
      { seconds: 1560, jumpMeters: 2100 },
    ],
    speedMps: 2.8,
    startEpochMs: SUNDAY_MORNING_MS,
  }),
);

writeFileSync(
  join(OUT_DIR, "demo-clean-run.gpx"),
  generateDemoGpx({
    name: "QC Circle Easy Run (demo - clean)",
    seed: 20260921,
    startLat: QC_START.lat,
    startLon: QC_START.lon,
    baseHeading: 2.2,
    legs: [900],
    holes: [],
    speedMps: 2.8,
    startEpochMs: SUNDAY_MORNING_MS + 7 * 24 * 3_600_000,
  }),
);
