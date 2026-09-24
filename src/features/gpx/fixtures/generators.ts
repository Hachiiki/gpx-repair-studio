/**
 * Synthetic GPX fixture generator (docs/MASTER_PLAN.md §N-1).
 *
 * Deterministic, dependency-free generation of large GPX documents for the
 * parser/perf corpus (e.g. the 100 000-point file). Uses a seeded mulberry32
 * PRNG so the same options always produce byte-identical output — tests
 * assert on structure, never on wall-clock or unseeded randomness.
 *
 * The route is a smooth random walk from Berlin with ~2.5 m steps at 1 Hz,
 * with optional elevation and an optional time jump (the gap scenario).
 * Small real-world fixtures live as committed files next to this module
 * (fixtures/files/); this generator covers the huge synthetic cases.
 *
 * Phase 1 — GPX Domain Core. Pure TypeScript: no DOM, no I/O, no globals.
 */

/** Deterministic 32-bit PRNG (mulberry32) — sufficient for fixtures. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SyntheticTrackOptions {
  /** Number of <trkpt> elements to generate. */
  pointCount: number;
  /** PRNG seed. Default 42. */
  seed?: number;
  /** Emit <time> elements (1 Hz from the start epoch). Default true. */
  withTime?: boolean;
  /** Emit <ele> elements (smooth noise around 40 m). Default true. */
  withEle?: boolean;
  /**
   * Insert a recording gap: the point AFTER this index jumps forward in
   * time (leaving a hole in the track, as a paused watch would).
   */
  timeGapAfter?: number;
  /** Size of the injected gap in seconds. Default 600 (10 minutes). */
  timeGapSeconds?: number;
  /** First timestamp. Default 2024-05-01T07:00:00Z. */
  startEpochMs?: number;
  /** <trk><name>. Default "Synthetic Run". */
  trackName?: string;
  /** Root creator attribute. Default "GPX Repair Studio Fixture Generator". */
  creator?: string;
}

const DEFAULT_START_MS = Date.parse("2024-05-01T07:00:00Z");

/** Escape the five XML-significant characters in text content. */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Generate a single-track GPX 1.1 document as a string. Deterministic for
 * equal options (fixed default seed).
 */
export function generateSyntheticGpx(
  options: SyntheticTrackOptions,
): string {
  const {
    pointCount,
    seed = 42,
    withTime = true,
    withEle = true,
    timeGapAfter,
    timeGapSeconds = 600,
    startEpochMs = DEFAULT_START_MS,
    trackName = "Synthetic Run",
    creator = "GPX Repair Studio Fixture Generator",
  } = options;

  const random = mulberry32(seed);

  // Smooth random-walk state.
  let lat = 52.52;
  let lon = 13.4;
  let heading = random() * 2 * Math.PI;
  let ele = 40 + random() * 5;
  let eleTrend = 0;

  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="' + escapeXml(creator) + '" xmlns="http://www.topografix.com/GPX/1/1">',
    "  <metadata>",
    "    <name>" + escapeXml(trackName) + "</name>",
    ...(withTime ? ['    <time>2024-05-01T07:00:00Z</time>'] : []),
    "  </metadata>",
    "  <trk>",
    "    <name>" + escapeXml(trackName) + "</name>",
    "    <trkseg>",
  ];

  for (let i = 0; i < pointCount; i++) {
    heading += (random() - 0.5) * 0.4;
    const stepM = 2 + random() * 1.5; // ~2–3.5 m per second
    lat += (stepM * Math.cos(heading)) / 111_320;
    lon += (stepM * Math.sin(heading)) / (111_320 * Math.cos((lat * Math.PI) / 180));

    eleTrend = eleTrend * 0.9 + (random() - 0.5) * 0.8;
    ele += eleTrend * 0.2;

    let timeMs = startEpochMs + i * 1000;
    if (timeGapAfter !== undefined && i > timeGapAfter) {
      timeMs += timeGapSeconds * 1000;
    }

    const children: string[] = [];
    if (withEle) children.push("<ele>" + ele.toFixed(1) + "</ele>");
    if (withTime) children.push("<time>" + new Date(timeMs).toISOString() + "</time>");

    lines.push(
      '    <trkpt lat="' +
        lat.toFixed(6) +
        '" lon="' +
        lon.toFixed(6) +
        '">' +
        children.join("") +
        "</trkpt>",
    );
  }

  lines.push("    </trkseg>", "  </trk>", "</gpx>");
  return lines.join("\n") + "\n";
}
