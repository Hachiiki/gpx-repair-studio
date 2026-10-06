// @vitest-environment jsdom
/**
 * Stats-CSV structure tests (Phase 15, §EE 15.4): the long format,
 * RFC 4180 escaping, and the cross-unit pace consistency (per-km and
 * per-mi columns must differ by exactly the mile).
 */

import { describe, expect, it } from "vitest";
import { buildStatsCsv, type StatsCsvInput } from "@/features/statistics/statsCsv";
import { buildSplits, type SplitsResult } from "@/features/statistics/splits";
import { stoppedTimeSummary, type MotionSummary } from "@/features/statistics/motion";
import { mergeRepairs } from "@/features/reconstruction/merge";
import { parseXml } from "./helpers/gpxTestUtils";

const TIMED = {
  fileHasTimingData: true,
  fileTiming: { startMs: null, totalDurationMs: null },
};

/** 4 points due north, 10 s apart, ele 100..103. */
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="T" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>T</name><trkseg>
    <trkpt lat="52.520000" lon="13.404954"><ele>100</ele><time>2024-05-01T07:00:00Z</time></trkpt>
    <trkpt lat="52.528000" lon="13.404954"><ele>101</ele><time>2024-05-01T07:00:10Z</time></trkpt>
    <trkpt lat="52.536000" lon="13.404954"><ele>102</ele><time>2024-05-01T07:00:20Z</time></trkpt>
    <trkpt lat="52.544000" lon="13.404954"><ele>103</ele><time>2024-05-01T07:00:30Z</time></trkpt>
  </trkseg></trk>
</gpx>`;

function fixtures(): {
  splits: SplitsResult;
  motion: MotionSummary;
  input: StatsCsvInput;
} {
  const merge = mergeRepairs(parseXml(XML), [], TIMED);
  // One split per leg: the measured leg length.
  const splits = buildSplits(merge, { splitLengthM: 888 }); // ≈ the leg
  const motion = stoppedTimeSummary(merge, { timeGapMs: 60_000 });
  const input: StatsCsvInput = {
    fileName: "ride, may.gpx",
    generatedAtIso: "2026-10-02T08:00:00.000Z",
    splits,
    motion,
    elevation: {
      gainM: 3,
      lossM: 0,
      coverage: 1,
      insufficient: false,
    },
    distance: {
      totalDistanceM: splits!.totalDistanceM,
      recordedDistanceM: splits!.totalDistanceM,
      repairedDistanceM: 0,
      hasRepairs: false,
    },
    time: {
      hasTimingData: true,
      recordedMovingMs: 30_000,
      wallMs: 30_000,
    },
    working: {
      deletedPointCount: 0,
      sortedSegmentCount: 0,
      overriddenEleCount: 0,
      hasEdits: false,
    },
  };
  return { splits: splits!, motion, input };
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split("\r\n").filter((line) => line !== "");
  const header = lines[0].split(",");
  return lines.slice(1).map((line) => {
    // Minimal field parser honoring quoted sections (test data quotes
    // whole fields only).
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === "," && !inQuotes) {
        fields.push(current);
        current = "";
      } else current += ch;
    }
    fields.push(current);
    const row: Record<string, string> = {};
    header.forEach((key, i) => {
      row[key] = fields[i] ?? "";
    });
    return row;
  });
}

describe("buildStatsCsv", () => {
  const { input } = fixtures();
  const csv = buildStatsCsv(input);
  const rows = parseCsv(csv);

  it("uses CRLF line endings and one header row", () => {
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv.split("\r\n")[0]).toBe(
      "section,label,value,unit,provenance,note",
    );
  });

  it("escapes the comma in the source file name (RFC 4180)", () => {
    const meta = rows.find((row) => row.label === "source_file");
    expect(meta?.value).toBe("ride, may.gpx");
    expect(csv).toContain('"ride, may.gpx"');
  });

  it("carries the meta + summary sections", () => {
    expect(rows.find((row) => row.label === "app")?.value).toBe(
      "GPX Repair Studio",
    );
    expect(rows.find((row) => row.label === "generated_at")?.value).toBe(
      "2026-10-02T08:00:00.000Z",
    );
    const total = rows.find((row) => row.label === "total_distance");
    expect(total?.unit).toBe("m");
    expect(Number(total?.value)).toBeCloseTo(input.distance.totalDistanceM, 0);
    expect(rows.find((row) => row.label === "in_motion_time")?.unit).toBe("s");
  });

  it("emits per-split rows with both pace units in exact ratio", () => {
    const split1Distance = rows.find(
      (row) => row.label === "split_1_distance",
    );
    expect(split1Distance?.section).toBe("split");
    expect(split1Distance?.provenance).toBe("recorded");

    const perKm = rows.find((row) => row.label === "split_1_pace_per_km");
    const perMi = rows.find((row) => row.label === "split_1_pace_per_mi");
    expect(perKm).toBeDefined();
    expect(perMi).toBeDefined();
    expect(Number(perMi!.value) / Number(perKm!.value)).toBeCloseTo(
      1.609344,
      3,
    );
  });

  it("discloses split honesty flags in the note column", () => {
    const gapped = rows.find(
      (row) => row.note !== undefined && row.note.includes("gap leg"),
    );
    // This clean fixture has no gap legs — the note column stays empty.
    expect(gapped).toBeUndefined();
    expect(
      rows.find((row) => row.label === "split_1_distance")?.note,
    ).toBe("");
  });

  it("carries elevation and stop sections when the data exists", () => {
    expect(rows.find((row) => row.label === "elevation_gain")?.value).toBe(
      "3",
    );
    // Motion: a constant ~8.9 m/s track → no stops, but the summary rows.
    expect(rows.find((row) => row.label === "stopped_time")).toBeDefined();
  });

  it("withholds elevation rows when coverage is insufficient", () => {
    const csvThin = buildStatsCsv({
      ...input,
      elevation: { gainM: null, lossM: null, coverage: 0.2, insufficient: true },
    });
    const thin = parseCsv(csvThin);
    expect(thin.find((row) => row.label === "elevation_gain")).toBeUndefined();
    expect(thin.find((row) => row.label === "elevation_coverage")?.value).toBe(
      "20",
    );
  });

  it("documents the working copy when edits exist", () => {
    const csvWorked = buildStatsCsv({
      ...input,
      working: {
        deletedPointCount: 3,
        sortedSegmentCount: 1,
        overriddenEleCount: 2,
        hasEdits: true,
      },
    });
    const worked = parseCsv(csvWorked);
    const meta = worked.find((row) => row.label === "working_copy");
    expect(meta?.value).toBe("modified");
    expect(meta?.note).toContain("3 points removed");
  });
});

describe("buildStatsCsv — the Phase 23 zone rows", () => {
  const zonesCsv = buildStatsCsv({
    ...fixtures().input,
    zones: {
      hr: {
        zones: {
          rows: [
            { zone: 1, fromValue: null, toValue: 114, timeMs: 60_000, share: 0.2 },
            { zone: 2, fromValue: 114, toValue: 133, timeMs: 240_000, share: 0.8 },
            { zone: 3, fromValue: 133, toValue: 152, timeMs: 0, share: 0 },
            { zone: 4, fromValue: 152, toValue: 171, timeMs: 0, share: 0 },
            { zone: 5, fromValue: 171, toValue: null, timeMs: 0, share: 0 },
          ],
          zoneCount: 5,
          accountedMs: 300_000,
          noDataMs: 42_000,
          movingMs: 342_000,
          hasMetricData: true,
          hasTimingData: true,
        },
        perSplit: [
          {
            splitIndex: 1,
            zoneTimesMs: [30_000, 20_000, 0, 0, 0],
            noDataMs: 5_000,
            dominantZone: 1,
          },
        ],
      },
      power: null,
      pace: null,
      cadence: {
        rows: [{ from: 80, to: null, timeMs: 90_000, share: 1 }],
        accountedMs: 90_000,
        noDataMs: 0,
        movingMs: 90_000,
        hasCadenceData: true,
        hasTimingData: true,
      },
      gap: {
        movingMs: 30_000,
        gapTimeMs: 29_000,
        distanceM: 600,
        gapPaceMsPerMeter: 312.5, // ms/m — numerically 312.5 s/km
        actualPaceMsPerMeter: 340.2,
        flatLegs: 0,
        gradedLegs: 3,
        hasTimingData: true,
        hasElevationData: true,
      },
      calories: {
        kind: "power",
        kcal: 717.4,
        averageWatts: 210,
        powerSeconds: 3600,
      },
      settings: {
        hr: { maxHr: 190, boundaries: [114, 133, 152, 171] },
        power: { ftp: 200 },
        pace: { race: { distanceM: 5000, timeMs: 1_500_000 } },
        stopSpeedMps: 0.5,
        calories: { enabled: true, weightKg: 70 },
      },
    },
  });
  const rows = parseCsv(zonesCsv);

  it("the meta section names the zone models and settings", () => {
    const model = rows.find((row) => row.label === "zone_model");
    expect(model?.section).toBe("meta");
    expect(model?.note).toContain("this app's own");
    expect(rows.find((row) => row.label === "hr_max")?.value).toBe("190");
    expect(
      rows.find((row) => row.label === "hr_max")?.note,
    ).toContain("114/133/152/171");
    expect(rows.find((row) => row.label === "power_ftp")?.value).toBe("200");
    expect(rows.find((row) => row.label === "pace_race_distance")?.value).toBe(
      "5000",
    );
    expect(rows.find((row) => row.label === "pace_race_time")?.value).toBe(
      "1500",
    );
    expect(rows.find((row) => row.label === "stop_speed")?.value).toBe("0.5");
    expect(rows.find((row) => row.label === "calories_weight")?.value).toBe(
      "70",
    );
  });

  it("the zone section carries per-zone times and the no-data row", () => {
    const z1 = rows.find((row) => row.label === "hr_zone_1_time");
    expect(z1?.section).toBe("zone");
    expect(z1?.unit).toBe("s");
    expect(z1?.value).toBe("60");
    expect(z1?.provenance).toBe("recorded");
    const range = rows.find((row) => row.label === "hr_zone_range");
    expect(range?.value).toContain("under 114");
    expect(range?.value).toContain("171 and above");
    const noData = rows.find((row) => row.label === "hr_no_data_time");
    expect(noData?.value).toBe("42");
    expect(noData?.note).toContain("reconstructed stretches");
    const cadence = rows.find(
      (row) => row.label === "cadence_range_80_open_time",
    );
    expect(cadence?.section).toBe("zone");
    expect(cadence?.value).toBe("90");
  });

  it("the summary carries GAP in both units and the calorie estimate", () => {
    const gapKm = rows.find((row) => row.label === "gap_pace_per_km");
    expect(gapKm?.value).toBe("312.5");
    expect(gapKm?.note).toContain("Minetti");
    const gapMi = rows.find((row) => row.label === "gap_pace_per_mi");
    expect(Number(gapMi?.value) / Number(gapKm?.value)).toBeCloseTo(
      1.609344,
      3,
    );
    const kcal = rows.find((row) => row.label === "calories_kcal");
    expect(kcal?.value).toBe("717");
    expect(kcal?.provenance).toBe("estimated");
    expect(kcal?.note).toContain("estimate");
  });

  it("the split_zone section carries the per-split breakdown", () => {
    const cell = rows.find(
      (row) => row.label === "split_1_hr_zone_1_time",
    );
    expect(cell?.section).toBe("split_zone");
    expect(cell?.value).toBe("30");
    const noData = rows.find((row) => row.label === "split_1_hr_no_data_time");
    expect(noData?.value).toBe("5");
  });

  it("a zones-free input keeps the sheet exactly as it was", () => {
    const plain = parseCsv(buildStatsCsv(fixtures().input));
    expect(
      plain.find((row) => row.section === "zone" || row.section === "split_zone"),
    ).toBeUndefined();
    expect(
      plain.find((row) => row.label === "zone_model"),
    ).toBeUndefined();
  });
});
