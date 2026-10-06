/**
 * The library CSV (Phase 24.1): wide table, RFC 4180, one row per
 * indexed session — the same numbers the cards render, machine-shaped.
 */
import { describe, expect, it } from "vitest";
import { buildLibraryCsv } from "@/features/library/libraryCsv";
import type { LibraryCsvRow } from "@/features/library/libraryCsv";

function csvRow(
  name: string,
  index: Partial<LibraryCsvRow["index"]> = {},
): LibraryCsvRow {
  return {
    name,
    section: "repair",
    savedAtIso: "2024-05-01T08:00:00.000Z",
    index: {
      schemaVersion: 1,
      activityStartMs: Date.parse("2024-05-01T06:00:00.000Z"),
      hasTimingData: true,
      hasHrData: true,
      hasCadData: false,
      hasPowerData: false,
      distanceM: 10_000,
      movingTimeMs: 1_800_000,
      gainM: 120,
      avgHrBpm: 145,
      elevationCoverage: 1,
      recordedDistanceM: 9_000,
      recordedMovingTimeMs: 1_700_000,
      recordedGainM: 110,
      reconstructedDistanceM: 0,
      trackCount: 1,
      efforts: [
        {
          distanceM: 1000,
          timeMs: 240_000,
          startInterpolated: true,
          endInterpolated: false,
        },
      ],
      ...index,
    },
  };
}

describe("buildLibraryCsv", () => {
  it("emits the preamble, header, and one row per session", () => {
    const csv = buildLibraryCsv({
      generatedAtIso: "2024-06-01T00:00:00.000Z",
      rows: [csvRow("Morning ride"), csvRow("Evening, run")],
    });
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("generated_at,2024-06-01T00:00:00.000Z");
    expect(lines[1]).toBe("app,GPX Repair Studio");
    expect(lines[2]).toContain("nothing leaves the browser");
    expect(lines[3]).toContain("name");
    expect(lines[3]).toContain("best_effort_1k_s");
    // Two data rows + trailing CRLF.
    expect(lines).toHaveLength(4 + 2 + 1);
    // The quoted comma survives RFC 4180.
    expect(lines[5]).toContain('"Evening, run"');
  });

  it("carries the card numbers and best efforts in machine units", () => {
    const csv = buildLibraryCsv({
      generatedAtIso: "2024-06-01T00:00:00.000Z",
      rows: [csvRow("Ride")],
    });
    const row = csv.split("\r\n")[4]!.split(",");
    expect(row).toContain("2024-05-01T06:00:00.000Z");
    expect(row).toContain("10000.0"); // distance_m
    expect(row).toContain("1800.0"); // moving_time_s
    expect(row).toContain("240.0"); // best_effort_1k_s
    // pace_s_per_km = 1800 s / 10 km = 180.
    expect(row).toContain("180.00");
  });

  it("null numbers render as empty fields, never zeros", () => {
    const csv = buildLibraryCsv({
      generatedAtIso: "2024-06-01T00:00:00.000Z",
      rows: [
        csvRow("No clock", {
          activityStartMs: null,
          hasTimingData: false,
          movingTimeMs: 0,
          gainM: null,
          avgHrBpm: null,
          efforts: [],
        }),
      ],
    });
    const row = csv.split("\r\n")[4]!.split(",");
    expect(row).not.toContain("0.00");
    // Untimed: the activity-start and pace fields are empty.
    expect(row.filter((f) => f === "").length).toBeGreaterThanOrEqual(4);
  });

  it("an empty library is the preamble + header, nothing else", () => {
    const csv = buildLibraryCsv({
      generatedAtIso: "2024-06-01T00:00:00.000Z",
      rows: [],
    });
    expect(csv.split("\r\n")).toHaveLength(4 + 1);
  });
});
