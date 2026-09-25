/**
 * Unit tests — pace statistics (features/statistics/pace.ts) and the
 * Phase 5 formatting helpers (lib/utils/format.ts): §L-1 pace rows with
 * their provenance and honesty "—" reasons, pace formatting in both
 * units, and the shared h/m/s duration-field parser.
 */

import { describe, expect, it } from "vitest";
import { buildPaceRows, paceMsPerUnit } from "@/features/statistics/pace";
import {
  durationFieldsToMs,
  formatPace,
  formatPaceMs,
  msToDurationFields,
} from "@/lib/utils/format";

const MIN = 60_000;
const KM = 1000;

describe("buildPaceRows (§L-1)", () => {
  it("timed file, no repairs: exactly the recorded row", () => {
    const rows = buildPaceRows({
      hasTimingData: true,
      recordedMovingTimeMs: 18 * MIN,
      recordedDistanceM: 3 * KM,
      repairDistanceM: 0,
      repairTimeMs: null,
      repairsWithoutDuration: 0,
      hasRepairs: false,
      manualTotalDurationMs: null,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "recorded", provenance: "recorded" });
    expect(rows[0].durationMs).toBe(18 * MIN);
    expect(rows[0].missingReason).toBeUndefined();
  });

  it("recorded pace is not computable without timing data", () => {
    const rows = buildPaceRows({
      hasTimingData: false,
      recordedMovingTimeMs: 0,
      recordedDistanceM: 3 * KM,
      repairDistanceM: 0,
      repairTimeMs: null,
      repairsWithoutDuration: 0,
      hasRepairs: false,
      manualTotalDurationMs: null,
    });
    expect(rows[0].durationMs).toBeNull();
    expect(rows[0].missingReason).toMatch(/no timing data/i);
  });

  it("timed file with a complete repair: recorded + estimated + mixed", () => {
    const rows = buildPaceRows({
      hasTimingData: true,
      recordedMovingTimeMs: 18 * MIN,
      recordedDistanceM: 3 * KM,
      repairDistanceM: 1 * KM,
      repairTimeMs: 5 * MIN,
      repairsWithoutDuration: 0,
      hasRepairs: true,
      manualTotalDurationMs: null,
    });
    expect(rows.map((r) => r.id)).toEqual(["recorded", "repaired", "overall"]);
    expect(rows[1]).toMatchObject({ provenance: "estimated", durationMs: 5 * MIN });
    expect(rows[2]).toMatchObject({ provenance: "mixed", durationMs: 23 * MIN });
    expect(rows[2].distanceM).toBe(4 * KM);
  });

  it("a repair without duration blocks the estimated and overall rows honestly", () => {
    const rows = buildPaceRows({
      hasTimingData: true,
      recordedMovingTimeMs: 18 * MIN,
      recordedDistanceM: 3 * KM,
      repairDistanceM: 2 * KM,
      repairTimeMs: 5 * MIN, // one other repair is known…
      repairsWithoutDuration: 1, // …but this one is not
      hasRepairs: true,
      manualTotalDurationMs: null,
    });
    const repaired = rows.find((r) => r.id === "repaired")!;
    expect(repaired.durationMs).toBeNull();
    expect(repaired.missingReason).toMatch(/still needs? a duration/);
    const overall = rows.find((r) => r.id === "overall")!;
    expect(overall.durationMs).toBeNull();
    expect(overall.missingReason).toMatch(/before a combined pace is honest/);
  });

  it("no-timing file: the overall row prompts for a total duration, then computes", () => {
    const prompting = buildPaceRows({
      hasTimingData: false,
      recordedMovingTimeMs: 0,
      recordedDistanceM: 3 * KM,
      repairDistanceM: 0,
      repairTimeMs: null,
      repairsWithoutDuration: 0,
      hasRepairs: false,
      manualTotalDurationMs: null,
    });
    const overall = prompting.find((r) => r.id === "overall")!;
    expect(overall.durationMs).toBeNull();
    expect(overall.missingReason).toMatch(/enter a total duration/);

    const answered = buildPaceRows({
      hasTimingData: false,
      recordedMovingTimeMs: 0,
      recordedDistanceM: 3 * KM,
      repairDistanceM: 0,
      repairTimeMs: null,
      repairsWithoutDuration: 0,
      hasRepairs: false,
      manualTotalDurationMs: 30 * MIN,
    });
    const computed = answered.find((r) => r.id === "overall")!;
    expect(computed.durationMs).toBe(30 * MIN);
    expect(computed.provenance).toBe("mixed");
  });

  it("no-timing file with repairs: repaired pace from manual durations, overall from the total", () => {
    const rows = buildPaceRows({
      hasTimingData: false,
      recordedMovingTimeMs: 0,
      recordedDistanceM: 3 * KM,
      repairDistanceM: 1 * KM,
      repairTimeMs: 6 * MIN,
      repairsWithoutDuration: 0,
      hasRepairs: true,
      manualTotalDurationMs: 36 * MIN,
    });
    expect(rows.map((r) => r.id)).toEqual(["recorded", "repaired", "overall"]);
    expect(rows.find((r) => r.id === "repaired")!.durationMs).toBe(6 * MIN);
    const overall = rows.find((r) => r.id === "overall")!;
    expect(overall.durationMs).toBe(36 * MIN);
    expect(overall.distanceM).toBe(4 * KM);
  });

  it("zero recorded moving time on a timed file explains itself", () => {
    const rows = buildPaceRows({
      hasTimingData: true,
      recordedMovingTimeMs: 0,
      recordedDistanceM: 3 * KM,
      repairDistanceM: 0,
      repairTimeMs: null,
      repairsWithoutDuration: 0,
      hasRepairs: false,
      manualTotalDurationMs: null,
    });
    expect(rows[0].durationMs).toBeNull();
    expect(rows[0].missingReason).toMatch(/no recorded moving time/);
  });
});

describe("paceMsPerUnit", () => {
  it("converts duration/distance into per-unit pace", () => {
    // 5 min over 1 km → 5 min/km → 300_000 ms/km; per mile: ×1.609344.
    expect(paceMsPerUnit(5 * MIN, KM, "km")).toBeCloseTo(5 * MIN, 6);
    expect(paceMsPerUnit(5 * MIN, KM, "mi")).toBeCloseTo(5 * MIN * 1.609344, 6);
  });

  it("is undefined for non-positive inputs (the honesty '—')", () => {
    expect(paceMsPerUnit(null, KM, "km")).toBeUndefined();
    expect(paceMsPerUnit(0, KM, "km")).toBeUndefined();
    expect(paceMsPerUnit(5 * MIN, 0, "km")).toBeUndefined();
  });
});

describe("pace formatting", () => {
  it("renders m:ss per unit", () => {
    expect(formatPace(5 * MIN, KM, "km")).toBe("5:00 /km");
    expect(formatPace(5 * MIN, KM, "mi")).toBe("8:02 /mi"); // 8.047 min floors to 8:02
    expect(formatPace(90 * MIN, 21.1 * KM, "km")).toBe("4:15 /km"); // 255.9 s
  });

  it("renders '—' when not computable", () => {
    expect(formatPace(null, KM, "km")).toBe("—");
    expect(formatPace(0, KM, "km")).toBe("—");
    expect(formatPace(5 * MIN, 0, "km")).toBe("—");
  });

  it("formats a bare pace value with hour rollover", () => {
    expect(formatPaceMs(4 * MIN + 33_000)).toBe("4:33");
    expect(formatPaceMs(60 * MIN)).toBe("1:00:00");
    expect(formatPaceMs(0)).toBe("—");
    expect(formatPaceMs(Number.NaN)).toBe("—");
  });
});

describe("duration field parsing (the shared h/m/s parser)", () => {
  it("parses numbers and numeric strings; empty is zero", () => {
    expect(durationFieldsToMs({ hours: 0, minutes: 12, seconds: 34 })).toBe(
      12 * 60_000 + 34_000,
    );
    expect(durationFieldsToMs({ hours: "1", minutes: "2", seconds: "3" })).toBe(
      3_723_000,
    );
    expect(durationFieldsToMs({ hours: "", minutes: "", seconds: "" })).toBe(0);
    expect(durationFieldsToMs({ hours: 1, minutes: 0, seconds: 0.5 })).toBe(
      3_600_500,
    );
  });

  it("rejects negative or non-numeric input with null", () => {
    expect(durationFieldsToMs({ hours: -1, minutes: 0, seconds: 0 })).toBeNull();
    expect(durationFieldsToMs({ hours: "x", minutes: 0, seconds: 0 })).toBeNull();
    expect(
      durationFieldsToMs({ hours: "", minutes: Number.NaN, seconds: 0 }),
    ).toBeNull();
  });

  it("round-trips through msToDurationFields", () => {
    const ms = ((2 * 60 + 41) * 60 + 9) * 1000;
    expect(msToDurationFields(ms)).toEqual({
      hours: 2,
      minutes: 41,
      seconds: 9,
    });
    expect(durationFieldsToMs(msToDurationFields(ms))).toBe(ms);
    // Negative upstream values clamp to zero rather than exploding.
    expect(msToDurationFields(-5)).toEqual({ hours: 0, minutes: 0, seconds: 0 });
  });
});
