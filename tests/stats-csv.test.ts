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
