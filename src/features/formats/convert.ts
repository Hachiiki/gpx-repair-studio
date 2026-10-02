/**
 * Synthesized raw captures for converted points (§EE 14.2/14.3).
 *
 * TCX/FIT imports normalize into the GPX-shaped domain model. A recorded
 * point imported that way has no verbatim `<trkpt>` to capture — so this
 * module SYNTHESIZES one from the parsed values. The identity invariant
 * adapts honestly: for a GPX upload the capture is byte-faithful; for a
 * converted point it is value-faithful (every number round-trips exactly),
 * which is the strongest guarantee a format conversion can make.
 *
 * Concretely, for a point {lat, lon, ele?, time?, metrics?}:
 *   - `lat`/`lon` use `String(number)` — JavaScript's shortest
 *     round-tripping representation. `parseGpx` decodes with `Number()`,
 *     so re-parsing an exported GPX yields the exact same double. No
 *     decimal-place rounding is invented (FIT semicircles resolve to
 *     ~0.9 cm; truncating to fewer digits would silently move points).
 *   - `<ele>`/`<time>` become synthesized children in schema order.
 *   - hr/cad/watts ride as a `gpxtpx:TrackPointExtension` extra child —
 *     the standard Garmin vocabulary — so the GPX re-export emits them
 *     the way Strava/Garmin Connect expect, and a re-import round-trips
 *     them through the same passthrough.
 *
 * Phase 14 — Formats in & out. Pure TypeScript.
 */

import type { RawTrkptCapture, RawTrkptChild, TrackPointMetrics } from "@/types/domain";

/** The Garmin TrackPointExtension namespace (hr/cad passthrough). */
export const GPXTPX_NAMESPACE =
  "http://www.garmin.com/xmlschemas/TrackPointExtension/v1";

/**
 * Format a degrees value losslessly: shortest round-trip representation.
 * `String(49.5)` → "49.5"; `String(49.12345678901234)` keeps every digit
 * `Number()` needs to reproduce the same double.
 */
export function formatDegreesLossless(value: number): string {
  return String(value);
}

/**
 * xsd:dateTime, UTC, milliseconds only when non-zero — the same shape
 * `exportGpx.formatTimestamp` emits for generated points, kept identical
 * so every synthesized timestamp in the app parses identically.
 */
export function formatSynthTimestamp(epochMs: number): string {
  const iso = new Date(epochMs).toISOString();
  return iso.endsWith(".000Z") ? iso.slice(0, -5) + "Z" : iso;
}

/**
 * Build the `<extensions>` XML carrying a point's metrics, with its own
 * namespace declarations (the fragment importer requires declared
 * prefixes — the same rule the Phase 9 tokenizer enforces). The
 * `<extensions>` wrapper declares the GPX 1.1 default namespace so the
 * element is schema-valid inside an exported document (serializers
 * would otherwise emit a namespace-resetting `xmlns=""`).
 */
export function trackPointExtensionXml(metrics: TrackPointMetrics): string | null {
  if (metrics.hr === undefined && metrics.cad === undefined && metrics.watts === undefined) {
    return null;
  }
  let inner = "";
  if (metrics.hr !== undefined) inner += `<gpxtpx:hr>${metrics.hr}</gpxtpx:hr>`;
  if (metrics.cad !== undefined) inner += `<gpxtpx:cad>${metrics.cad}</gpxtpx:cad>`;
  if (metrics.watts !== undefined) inner += `<gpxtpx:power>${metrics.watts}</gpxtpx:power>`;
  return (
    `<extensions xmlns="http://www.topografix.com/GPX/1/1">` +
    `<gpxtpx:TrackPointExtension ` +
    `xmlns:gpxtpx="${GPXTPX_NAMESPACE}">${inner}` +
    `</gpxtpx:TrackPointExtension></extensions>`
  );
}

/** The values a converted point contributes to its raw capture. */
export interface SynthPointInput {
  lat: number;
  lon: number;
  ele?: number;
  time?: number;
  metrics?: TrackPointMetrics;
}

/**
 * Synthesize the raw capture of a converted point: attributes as
 * shortest-round-trip strings, children in schema order (ele, time, then
 * the metrics extension). Everything the identity exporter re-emits.
 */
export function synthRawCapture(point: SynthPointInput): RawTrkptCapture {
  const children: RawTrkptChild[] = [];
  if (point.ele !== undefined) {
    children.push({ kind: "ele", text: String(point.ele) });
  }
  if (point.time !== undefined) {
    children.push({ kind: "time", text: formatSynthTimestamp(point.time) });
  }
  if (point.metrics !== undefined) {
    const xml = trackPointExtensionXml(point.metrics);
    if (xml !== null) children.push({ kind: "extra", xml });
  }
  return {
    lat: formatDegreesLossless(point.lat),
    lon: formatDegreesLossless(point.lon),
    children,
  };
}

/** Sanity window for a passthrough metric (drops garbage, keeps real data). */
export function validMetricValue(value: number | undefined, max: number): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value <= 0 || value > max) return undefined;
  return value;
}

/** Escape text for embedding in synthesized XML (attrs or element text). */
export function escapeXmlText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Build a self-contained `<wpt>` snapshot for a converted waypoint (TCX
 * course points, FIT course points): the GPX 1.1 default namespace is
 * declared on the element itself so the exporter's fragment import binds
 * it correctly under both DOM engines.
 */
export function synthWaypointXml(waypoint: {
  lat: number;
  lon: number;
  ele?: number;
  name?: string;
  time?: number;
}): string {
  let inner = "";
  if (waypoint.ele !== undefined) inner += `<ele>${waypoint.ele}</ele>`;
  if (waypoint.time !== undefined) {
    inner += `<time>${formatSynthTimestamp(waypoint.time)}</time>`;
  }
  if (waypoint.name !== undefined) {
    inner += `<name>${escapeXmlText(waypoint.name)}</name>`;
  }
  return (
    `<wpt xmlns="http://www.topografix.com/GPX/1/1" ` +
    `lat="${formatDegreesLossless(waypoint.lat)}" ` +
    `lon="${formatDegreesLossless(waypoint.lon)}">${inner}</wpt>`
  );
}
