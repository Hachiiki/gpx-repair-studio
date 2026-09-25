/**
 * Shared helpers for the GPX domain test-suite.
 *
 * Must run under jsdom (the XML facade needs DOM globals). Files using
 * these helpers carry the `// @vitest-environment jsdom` docblock.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseGpx } from "@/features/gpx/parse";
import { exportGpxIdentity } from "@/features/gpx/exportGpx";
import { createDomXmlIo } from "@/lib/utils/xml";
import type { OriginalTrackData } from "@/types/domain";

export const FIXTURES_DIR = join(
  process.cwd(),
  "src",
  "features",
  "gpx",
  "fixtures",
  "files",
);

/** Load a committed fixture file as text (BOM kept — parse must tolerate). */
export function loadFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), "utf8");
}

/** A jsdom-backed XmlIo. */
export function makeIo() {
  return createDomXmlIo();
}

/** Parse a fixture that is expected to succeed; throws otherwise. */
export function parseFixture(name: string): OriginalTrackData {
  const result = parseGpx(loadFixture(name), makeIo());
  if (!result.ok) {
    throw new Error(
      `fixture "${name}" unexpectedly failed to parse: ${JSON.stringify(result.error)}`,
    );
  }
  return result.data;
}

/** Parse an inline XML string that is expected to succeed. */
export function parseXml(xml: string): OriginalTrackData {
  const result = parseGpx(xml, makeIo());
  if (!result.ok) {
    throw new Error(
      `XML unexpectedly failed to parse: ${JSON.stringify(result.error)}`,
    );
  }
  return result.data;
}

/** Minimal inline GPX point for {@link buildGpxXml}. */
export interface QuickPoint {
  lat: number | string;
  lon: number | string;
  ele?: number | string;
  time?: string;
}

/** Build a minimal single-track GPX 1.1 document from quick points. */
export function buildGpxXml(
  points: readonly QuickPoint[],
  opts: { trackName?: string; creator?: string } = {},
): string {
  const pts = points
    .map((p) => {
      const children: string[] = [];
      if (p.ele !== undefined) children.push(`<ele>${p.ele}</ele>`);
      if (p.time !== undefined) children.push(`<time>${p.time}</time>`);
      return `<trkpt lat="${p.lat}" lon="${p.lon}">${children.join("")}</trkpt>`;
    })
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<gpx version="1.1" creator="${opts.creator ?? "Test Builder"}" xmlns="http://www.topografix.com/GPX/1/1">\n` +
    `<trk><name>${opts.trackName ?? "Test"}</name><trkseg>${pts}</trkseg></trk>\n` +
    `</gpx>\n`
  );
}

/**
 * Re-serialize an XML fragment through one parse/serialize cycle with
 * insignificant whitespace stripped, so cosmetic differences (pretty vs
 * compact output, namespace-declaration placement) do not create false
 * diffs — the semantic-identity normalization for `projectModel`.
 */
export function normalizeXml(xml: string): string {
  const io = makeIo();
  const strip = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3 && (child.nodeValue ?? "").trim() === "") {
        node.removeChild(child);
      } else {
        strip(child);
      }
    }
  };
  const parsed = io.parse(xml);
  if (parsed.documentElement !== null) strip(parsed.documentElement);
  return io.serialize(parsed.documentElement);
}

/** Export → re-parse; throws if either step fails. */
export function roundTrip(data: OriginalTrackData): {
  xml: string;
  second: OriginalTrackData;
} {
  const io = makeIo();
  const xml = exportGpxIdentity(data, io);
  const reparsed = parseGpx(xml, io);
  if (!reparsed.ok) {
    throw new Error(
      `exported document failed to re-parse: ${JSON.stringify(reparsed.error)}\n${xml.slice(0, 500)}`,
    );
  }
  return { xml, second: reparsed.data };
}

/**
 * Semantic projection of a model for round-trip equality: everything that
 * constitutes "the same file" — geometry, times, flags, ids, names, issues,
 * verbatim raw strings — with XML snapshots normalized through one
 * parse/serialize cycle so cosmetic namespace-declaration placement does
 * not create false diffs.
 */
export function projectModel(data: OriginalTrackData): unknown {
  return {
    tracks: data.tracks.map((t) => ({
      trackIndex: t.trackIndex,
      ...(t.name !== undefined ? { name: t.name } : {}),
      ...(t.desc !== undefined ? { desc: t.desc } : {}),
      ...(t.type !== undefined ? { type: t.type } : {}),
      extras: t.extras.map((e) => ({
        afterSegmentCount: e.afterSegmentCount,
        xml: normalizeXml(e.xml),
      })),
    })),
    segments: data.segments.map((s) => ({
      id: s.id,
      trackIndex: s.trackIndex,
      points: s.points.map(projectPoint),
      extras: s.extras.map((e) => ({
        afterPointCount: e.afterPointCount,
        xml: normalizeXml(e.xml),
      })),
    })),
    waypoints: data.waypoints.map((w) => ({
      ...(w.name !== undefined ? { name: w.name } : {}),
      rawXml: normalizeXml(w.rawXml),
    })),
    routes: data.routes.map((r) => ({
      ...(r.name !== undefined ? { name: r.name } : {}),
      rawXml: normalizeXml(r.rawXml),
    })),
    rootExtras: data.rootExtras.map(normalizeXml),
    fileMeta: {
      ...(data.fileMeta.creator !== undefined
        ? { creator: data.fileMeta.creator }
        : {}),
      version: data.fileMeta.version,
      ...(data.fileMeta.name !== undefined ? { name: data.fileMeta.name } : {}),
      ...(data.fileMeta.time !== undefined ? { time: data.fileMeta.time } : {}),
      raw: data.fileMeta.raw,
      metadataExtras: data.fileMeta.metadataExtras.map(normalizeXml),
    },
    // Issues that describe the DATA survive export and must round-trip.
    // The undeclared-namespace recovery warning is different: it reports a
    // defect of the INPUT document that the exporter genuinely fixes
    // (bindings materialize on the affected elements), so it correctly
    // disappears after export — excluded from the identity projection.
    // (Its disappearance is asserted explicitly in
    // gpx-undeclared-prefix.test.ts and strava-real-files.test.ts.)
    issues: data.issues.filter(
      (i) => i.kind !== "undeclared-namespace",
    ),
    // Re-imported provenance markers (Phase 7): the verbatim extension
    // snapshots keep them through identity export, so they must round-trip.
    ...(data.repairMarkers !== undefined
      ? { repairMarkers: data.repairMarkers }
      : {}),
  };
}

function projectPoint(
  p: OriginalTrackData["segments"][number]["points"][number],
) {
  return {
    lat: p.lat,
    lon: p.lon,
    ...(p.ele !== undefined ? { ele: p.ele } : {}),
    ...(p.time !== undefined ? { time: p.time } : {}),
    id: p.id,
    flags: [...p.flags],
    raw: {
      lat: p.raw.lat,
      lon: p.raw.lon,
      children: p.raw.children.map((c) =>
        c.kind === "extra" ? { kind: c.kind, xml: normalizeXml(c.xml) } : c,
      ),
    },
  };
}

/** All fixtures whose parse outcome is a model (not a typed error). */
export const PARSEABLE_FIXTURES = [
  "valid-1.1.gpx",
  "valid-1.0.gpx",
  "no-namespace.gpx",
  "prefixed-namespace.gpx",
  "multi-track.gpx",
  "multi-segment.gpx",
  "wpt-rte.gpx",
  "garmin-extensions.gpx",
  "empty-segment.gpx",
  "single-point-segment.gpx",
  "bad-coords.gpx",
  "zero-coords.gpx",
  "naive-time.gpx",
  "backwards-time.gpx",
  "duplicate-points.gpx",
  "time-gap.gpx",
  "speed-anomaly.gpx",
  "segment-break-time-gap.gpx",
  "no-time.gpx",
  "mixed-anomalies.gpx",
  "unicode-names.gpx",
  "bom.gpx",
  "cdata.gpx",
  "pretty-indented.gpx",
  "extra-children.gpx",
  "strava-export.gpx",
  "strava-original-garmin.gpx",
  "undeclared-prefix.gpx",
] as const;
