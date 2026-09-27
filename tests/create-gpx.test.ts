// @vitest-environment jsdom
/**
 * Unit tests — the generated GPX exporter (exportGpxGenerated).
 *
 * The "create from activity stats" export contract:
 *   - a standalone GPX 1.1 document (creator, metadata name/desc/time,
 *     one track, one segment, one trkpt per generated point);
 *   - timestamps are xsd:dateTime UTC, sequential, and span exactly the
 *     entered duration (first = start, last = start + duration);
 *   - every point carries the gpxr:reconstructed provenance marker — the
 *     app never presents its own work as a recording;
 *   - elevation is absent (the watch recorded none; none is invented);
 *   - the STRONGEST validity check available: the app's own parser
 *     accepts the file back (a full round-trip), and recognizes its own
 *     provenance markers on re-import.
 */

import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import {
  exportGpxGenerated,
  type GeneratedTrackPoint,
} from "@/features/gpx/exportGpx";
import { parseGpx } from "@/features/gpx/parse";
import { makeIo } from "./helpers/gpxTestUtils";
import { geodesicDistanceMeters } from "@/lib/geo/geodesy";

const io = makeIo();

const START = Date.UTC(2026, 8, 20, 5, 30); // 2026-09-20T05:30:00Z
const DURATION_MS = 1_955_000; // 32:35

/** Three points spanning ~222 m (the minimal honest activity). */
function points(): GeneratedTrackPoint[] {
  return [
    { lat: 52.52, lon: 13.405, timeMs: START, timeMethod: "distance-proportional" },
    {
      lat: 52.521,
      lon: 13.4055,
      timeMs: START + DURATION_MS / 2,
      timeMethod: "distance-proportional",
    },
    {
      lat: 52.522,
      lon: 13.406,
      timeMs: START + DURATION_MS,
      timeMethod: "distance-proportional",
    },
  ];
}

describe("exportGpxGenerated — document structure", () => {
  const xml = exportGpxGenerated(
    {
      trackName: "Reconstructed activity",
      description: "A test reconstruction.",
      points: points(),
    },
    io,
  );

  it("emits the declaration, GPX 1.1, and the app as creator", () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n')).toBe(
      true,
    );
    expect(xml).toContain('<gpx xmlns="http://www.topografix.com/GPX/1/1"');
    expect(xml).toContain('version="1.1"');
    expect(xml).toContain('creator="GPX Repair Studio"');
    expect(xml.trimEnd().endsWith("</gpx>")).toBe(true);
  });

  it("emits metadata (name, desc, the activity start) and one track", () => {
    expect(xml).toContain("<metadata>");
    expect(xml).toContain("<name>Reconstructed activity</name>");
    expect(xml).toContain("<desc>A test reconstruction.</desc>");
    expect(xml).toContain("<time>2026-09-20T05:30:00Z</time>");
    expect(xml).toContain("<trk>");
    expect(xml.match(/<trkseg>/g)).toHaveLength(1);
  });

  it("writes one trkpt per point with lat/lon and a UTC timestamp", () => {
    expect(xml.match(/<trkpt /g)).toHaveLength(3);
    expect(xml).toContain('lat="52.52"');
    expect(xml).toContain('lon="13.405"');
    // Timestamps: xsd:dateTime UTC, milliseconds only when non-zero.
    expect(xml).toContain("<time>2026-09-20T05:30:00Z</time>");
    expect(xml).toContain("<time>2026-09-20T05:46:17.500Z</time>");
    expect(xml).toContain("<time>2026-09-20T06:02:35Z</time>");
  });

  it("marks every point reconstructed and includes no elevation", () => {
    expect(xml.match(/gpxr:reconstructed/g)).toHaveLength(3);
    expect(xml).toContain('timeMethod="distance-proportional"');
    expect(xml).not.toContain("<ele>");
  });

  it("is deterministic (same input → same bytes)", () => {
    const again = exportGpxGenerated(
      {
        trackName: "Reconstructed activity",
        description: "A test reconstruction.",
        points: points(),
      },
      io,
    );
    expect(again).toBe(xml);
  });

  it("pretty-prints on request without changing the content", () => {
    const pretty = exportGpxGenerated(
      {
        trackName: "Reconstructed activity",
        description: "A test reconstruction.",
        points: points(),
        prettyPrint: true,
      },
      io,
    );
    expect(pretty).toContain("\n  <metadata>");
    expect(pretty.match(/<trkpt /g)).toHaveLength(3);
  });
});

describe("exportGpxGenerated — the app's own parser accepts it back", () => {
  it("round-trips: parse succeeds, points/times/coordinates survive", () => {
    const xml = exportGpxGenerated(
      {
        trackName: "Reconstructed activity",
        description: "A test reconstruction.",
        points: points(),
      },
      io,
    );
    const parsed = parseGpx(xml, io);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const segment = parsed.data.segments[0];
    expect(segment.points).toHaveLength(3);
    expect(segment.points[0].lat).toBeCloseTo(52.52, 6);
    expect(segment.points[0].lon).toBeCloseTo(13.405, 6);
    expect(segment.points[0].time).toBe(START);
    expect(segment.points[2].time).toBe(START + DURATION_MS);

    // The distance the file represents is the drawn/scaled route.
    let distance = 0;
    for (let i = 1; i < segment.points.length; i += 1) {
      distance += geodesicDistanceMeters(segment.points[i - 1], segment.points[i]);
    }
    expect(distance).toBeGreaterThan(200);
    expect(distance).toBeLessThan(240);

    // Re-import recognition: every point reads as reconstructed — our own
    // markers come home (§H-7).
    expect(parsed.data.repairMarkers).toHaveLength(3);
  });
});

describe("exportGpxGenerated — estimated elevation (the opt-in terrain join)", () => {
  /** The same three points, carrying an estimated elevation profile. */
  function elevatedPoints(): GeneratedTrackPoint[] {
    return points().map((point, index) => ({
      ...point,
      ele:
        index === 1
          ? { value: 50, method: "interpolated" as const }
          : { value: 48 + index * 2, method: "elevation-api" as const },
    }));
  }

  it("emits <ele> and the eleMethod marker on every estimated point", () => {
    const xml = exportGpxGenerated(
      {
        trackName: "Reconstructed activity",
        description: "A test reconstruction.",
        points: elevatedPoints(),
      },
      io,
    );
    expect(xml.match(/<ele>/g)).toHaveLength(3);
    expect(xml).toContain("<ele>48</ele>");
    expect(xml).toContain("<ele>50</ele>");
    expect(xml).toContain("<ele>52</ele>");
    expect(xml.match(/eleMethod="elevation-api"/g)).toHaveLength(2);
    expect(xml.match(/eleMethod="interpolated"/g)).toHaveLength(1);
    // The provenance marker is still on every point.
    expect(xml.match(/gpxr:reconstructed/g)).toHaveLength(3);
  });

  it("round-trips the elevations back through the parser", () => {
    const xml = exportGpxGenerated(
      {
        trackName: "Reconstructed activity",
        description: "A test reconstruction.",
        points: elevatedPoints(),
      },
      io,
    );
    const parsed = parseGpx(xml, io);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const segment = parsed.data.segments[0];
    expect(segment.points.map((p) => p.ele)).toEqual([48, 50, 52]);
    // The estimation methods ride the provenance markers home (§H-7) —
    // the file never presents estimated terrain as a recording.
    const markers = parsed.data.repairMarkers ?? [];
    expect(markers.map((m) => m.eleMethod)).toEqual([
      "elevation-api",
      "interpolated",
      "elevation-api",
    ]);
  });

  it("omits elevation entirely when none was estimated (mixed input)", () => {
    const mixed = points().map((point, index) =>
      index === 1 ? { ...point, ele: { value: 50, method: "interpolated" as const } } : point,
    );
    const xml = exportGpxGenerated(
      {
        trackName: "Reconstructed activity",
        description: "A test reconstruction.",
        points: mixed,
      },
      io,
    );
    // Only the point that carried a value gets an <ele> — per-point honesty.
    expect(xml.match(/<ele>/g)).toHaveLength(1);
    expect(xml).toContain("<ele>50</ele>");
  });
});
