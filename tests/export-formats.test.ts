// @vitest-environment jsdom
/**
 * KML / GeoJSON / CSV exporter tests (Phase 14 — §EE 14.4).
 *
 * Goldens built over a small hand-made model with all three provenance
 * kinds present (recorded run, reconstructed run, one working-copy
 * elevation override), plus a TCX-imported model for the metrics
 * columns. Every format must carry the provenance labels.
 */

import { describe, expect, it } from "vitest";
import { parseGpx } from "@/features/gpx/parse";
import { parseTcx } from "@/features/formats/parse-tcx";
import { applyWorkingEdits } from "@/features/validation/workingCopy";
import { exportKml } from "@/features/formats/export-kml";
import { exportGeoJson } from "@/features/formats/export-geojson";
import { exportCsv } from "@/features/formats/export-csv";
import type { MergeResult } from "@/features/reconstruction/merge";
import type {
  MergedPointView,
  OriginalTrackData,
  ReconstructedPoint,
  WorkingTrackData,
} from "@/types/domain";
import { gapId, pointId, segmentId } from "@/types/ids";
import { createDomXmlIo } from "@/lib/utils/xml";
import { buildGpxXml, parseXml } from "./helpers/gpxTestUtils";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const BASE_GPX = buildGpxXml(
  [
    { lat: -37.95, lon: 145.1, ele: 42, time: "2024-05-01T06:00:00Z" },
    { lat: -37.94955, lon: 145.10003, ele: 42.4, time: "2024-05-01T06:00:03Z" },
    { lat: -37.9491, lon: 145.10005, ele: 42.8, time: "2024-05-01T06:00:06Z" },
  ],
  // The name text is "Café & Loop" after XML parsing (the builder does
    // not escape, so the entity is pre-escaped here on purpose — the
    // exporters must re-escape it on output).
    { trackName: "Café &amp; Loop", creator: "Test Builder" },
);

/** One recorded point with a confirmed elevation override (→ "modified"). */
const WORKING_LOG = [
  {
    id: "fix/1",
    label: "Smooth 1 elevation",
    reason: "elevation" as const,
    appliedAt: 0,
    entries: [
      {
        kind: "elevation-override" as const,
        pointId: pointId(segmentId(0, 0), 1),
        ele: 42.5,
        method: "interpolated" as const,
        originalEle: 42.4,
      },
    ],
  },
];

function buildModel(): { data: WorkingTrackData; original: OriginalTrackData } {
  const original = parseXml(BASE_GPX);
  const working = applyWorkingEdits(original, WORKING_LOG);
  return { data: working, original };
}

function buildMerge(data: WorkingTrackData): MergeResult {
  const recordedPoints = data.segments[0].points;
  const interior: ReconstructedPoint = {
    source: "reconstructed",
    lat: -37.949325,
    lon: 145.10004,
    ele: { value: 42.6, method: "interpolated" },
    time: { value: Date.parse("2024-05-01T06:00:04.500Z"), method: "distance-proportional" },
    cumDistanceM: 30,
  };
  const views: MergedPointView[] = [
    ...recordedPoints.map((point, i) => ({ point, order: i })),
    {
      point: interior,
      order: recordedPoints.length,
      belongsToGap: gapId(pointId(segmentId(0, 0), 1), pointId(segmentId(0, 0), 2)),
    },
  ];
  return {
    tracks: [
      {
        trackIndex: 0,
        runs: [
          {
            kind: "recorded" as const,
            segmentId: segmentId(0, 0),
            startIndex: 0,
            endIndex: 2,
            points: recordedPoints,
          },
          {
            kind: "reconstructed" as const,
            gapId: gapId(pointId(segmentId(0, 0), 1), pointId(segmentId(0, 0), 2)),
            points: [interior],
          },
        ],
        points: views,
        repairCount: 1,
        reconstructedDistanceM: 123.4,
      },
    ],
    repairCount: 1,
    reconstructedDistanceM: 123.4,
    insertedPoints: 1,
    elevatedRepairCount: 0,
    elevationProviders: [],
    skipped: [],
  };
}

const OPTIONS = {
  prettyPrint: false,
  sourceName: "cafe-loop.gpx",
  stats: { distanceM: 1234.5, movingMs: 6000 },
} as const;

describe("exportKml", () => {
  const { data } = buildModel();
  const kml = exportKml(data, buildMerge(data), OPTIONS);

  it("emits the KML 2.2 skeleton with one placemark and two lines", () => {
    expect(kml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(kml).toContain('<kml xmlns="http://www.opengis.net/xml/kml/2.2">');
    expect(kml).toContain("<Placemark>");
    expect(kml).toContain("<MultiGeometry>");
    expect((kml.match(/<LineString>/g) ?? []).length).toBe(2);
    expect(kml).toContain("<tessellate>1</tessellate>");
  });

  it("escapes the track name and carries the provenance labels", () => {
    expect(kml).toContain("<name>Café &amp; Loop</name>");
    expect(kml).toContain('<Data name="recorded_points"><value>2</value></Data>');
    expect(kml).toContain('<Data name="estimated_points"><value>1</value></Data>');
    expect(kml).toContain('<Data name="modified_points"><value>1</value></Data>');
    expect(kml).toContain('<Data name="repairs"><value>1</value></Data>');
    expect(kml).toContain('name="repaired_distance"');
  });

  it("writes lon,lat,ele coordinates with the overridden elevation", () => {
    expect(kml).toContain("145.1,-37.95,42");
    // Point 1's elevation was overridden to 42.5.
    expect(kml).toContain("145.10003,-37.94955,42.5");
  });

  it("carries the provenance note with the KML disclosure clause", () => {
    expect(kml).toContain("1 gap reconstructed");
    expect(kml).toContain("KML carries no per-point provenance");
    expect(kml).toContain("1 elevation was smoothed");
    expect(kml).toContain("Original creator: Test Builder");
  });

  it("carries the file-level stats as Document ExtendedData", () => {
    expect(kml).toContain('<Data name="distance"><value>1.23 km</value></Data>');
    expect(kml).toContain('name="moving_time"');
  });
});

describe("exportGeoJson", () => {
  const { data } = buildModel();
  const text = exportGeoJson(data, buildMerge(data), OPTIONS);

  it("emits a parseable RFC 7946 FeatureCollection", () => {
    const json = JSON.parse(text);
    expect(json.type).toBe("FeatureCollection");
    expect(json.features).toHaveLength(1);
    expect(json.features[0].geometry.type).toBe("MultiLineString");
    expect(json.features[0].geometry.coordinates).toHaveLength(2);
  });

  it("writes [lon, lat, ele] positions", () => {
    const json = JSON.parse(text);
    const first = json.features[0].geometry.coordinates[0][0];
    expect(first[0]).toBeCloseTo(145.1, 10);
    expect(first[1]).toBeCloseTo(-37.95, 10);
    expect(first[2]).toBe(42);
  });

  it("carries the provenance properties and note", () => {
    const json = JSON.parse(text);
    const props = json.features[0].properties;
    expect(props.name).toBe("Café & Loop");
    expect(props.recorded_points).toBe(2);
    expect(props.estimated_points).toBe(1);
    expect(props.modified_points).toBe(1);
    expect(props.repairs).toBe(1);
    expect(json.properties.note).toContain("Per-point provenance rides in each feature's properties");
    expect(json.properties.generator).toBe("GPX Repair Studio");
    expect(json.properties.distance_m).toBe(1235);
  });
});

describe("exportCsv", () => {
  const { data } = buildModel();
  const csv = exportCsv(data, buildMerge(data), OPTIONS);

  it("emits the RFC 4180 header with CRLF endings", () => {
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(
      "track,segment,point,latitude,longitude,elevation_m,time_iso,provenance",
    );
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("marks every point's provenance (recorded / modified / estimated)", () => {
    const lines = csv.split("\r\n").filter((l) => l !== "");
    expect(lines).toHaveLength(1 + 4); // header + 3 recorded + 1 estimated
    expect(lines[1].endsWith(",recorded")).toBe(true);
    expect(lines[2].endsWith(",modified")).toBe(true);
    expect(lines[4].endsWith(",estimated")).toBe(true);
  });

  it("writes UTC-normalized ISO times", () => {
    expect(csv).toContain("2024-05-01T06:00:00Z");
    expect(csv).toContain("2024-05-01T06:00:04.500Z");
  });

  it("omits the metrics columns for GPX-imported points", () => {
    expect(csv).not.toContain("hr_bpm");
  });

  it("adds the hr/cad columns for TCX-imported metrics and quotes names safely", () => {
    const tcx = readFileSync(
      join(process.cwd(), "src/features/formats/fixtures/files/ride.tcx"),
      "utf8",
    );
    const model = parseTcx(tcx, createDomXmlIo());
    if (!model.ok) throw new Error("ride.tcx failed to parse");
    const merge: MergeResult = {
      tracks: [
        {
          trackIndex: 0,
          runs: model.data.segments.map((segment) => ({
            kind: "recorded" as const,
            segmentId: segment.id,
            startIndex: 0,
            endIndex: segment.points.length - 1,
            points: segment.points,
          })),
          points: model.data.segments.flatMap((segment) =>
            segment.points.map((point, i) => ({ point, order: i })),
          ),
          repairCount: 0,
          reconstructedDistanceM: 0,
        },
      ],
      repairCount: 0,
      reconstructedDistanceM: 0,
      insertedPoints: 0,
      elevatedRepairCount: 0,
      elevationProviders: [],
      skipped: [],
    };
    const out = exportCsv(model.data, merge, OPTIONS);
    expect(out.split("\r\n")[0]).toBe(
      "track,segment,point,latitude,longitude,elevation_m,time_iso,provenance,hr_bpm,cadence_rpm,power_w",
    );
    expect(out).toContain(",120,82,\r\n");
    // One row carries the watts channel (last column, before CRLF).
    expect(out).toContain(",134,84,210\r\n");
  });
});

describe("format round-trip honesty", () => {
  it("the same model produces consistent point counts across formats", () => {
    const { data } = buildModel();
    const merge = buildMerge(data);
    const kml = exportKml(data, merge, OPTIONS);
    const geo = exportGeoJson(data, merge, OPTIONS);
    const csv = exportCsv(data, merge, OPTIONS);
    const csvRows = csv.split("\r\n").length - 2; // header + trailing CRLF
    expect(csvRows).toBe(4);
    expect(kml).toContain('<Data name="points"><value>4</value></Data>');
    expect(JSON.parse(geo).features[0].properties.points).toBe(4);
  });
});

describe("pretty-printing", () => {
  it("indents KML when prettyPrint is on", () => {
    const { data } = buildModel();
    const pretty = exportKml(data, buildMerge(data), { ...OPTIONS, prettyPrint: true });
    expect(pretty).toContain('\n  <Document>');
    expect(pretty).toContain('\n    <Placemark>');
    expect(pretty).toContain('\n        <LineString>');
  });

  it("indents GeoJSON when prettyPrint is on", () => {
    const { data } = buildModel();
    const pretty = exportGeoJson(data, buildMerge(data), { ...OPTIONS, prettyPrint: true });
    expect(pretty).toContain('\n  "type": "FeatureCollection",');
  });
});

describe("pristine export (no repairs)", () => {
  it("carries the neutral note and no repair labels", () => {
    const original = parseXml(BASE_GPX);
    const merge: MergeResult = {
      tracks: [
        {
          trackIndex: 0,
          runs: [
            {
              kind: "recorded" as const,
              segmentId: segmentId(0, 0),
              startIndex: 0,
              endIndex: 2,
              points: original.segments[0].points,
            },
          ],
          points: original.segments[0].points.map((point, i) => ({ point, order: i })),
          repairCount: 0,
          reconstructedDistanceM: 0,
        },
      ],
      repairCount: 0,
      reconstructedDistanceM: 0,
      insertedPoints: 0,
      elevatedRepairCount: 0,
      elevationProviders: [],
      skipped: [],
    };
    const kml = exportKml(original, merge, OPTIONS);
    expect(kml).toContain("Exported with GPX Repair Studio.");
    expect(kml).not.toContain('name="repairs"');
    const geo = exportGeoJson(original, merge, OPTIONS);
    expect(JSON.parse(geo).features[0].properties.repairs).toBeUndefined();
  });
});

// Keep parseGpx referenced for the jsdom XML globals through the helpers.
void parseGpx;
