// @vitest-environment jsdom
/**
 * Trends math vectors (Phase 24.3 verification): weekly/monthly
 * volume bucketing on LOCAL calendar days, and the fitness-fatigue
 * line — the Banister impulse-response model as Coggan applied it
 * (CTL 42-day, ATL 7-day, form the difference), hand-computed
 * goldens against the exact decay factors.
 *
 * Dates are constructed with the local Date constructor everywhere
 * (mid-day hours), so the goldens hold in every timezone the suite
 * runs in — a training diary is a local artifact.
 */

import { describe, expect, it } from "vitest";
import {
  ATL_TIME_CONSTANT_DAYS,
  CTL_TIME_CONSTANT_DAYS,
  FITNESS_MIN_SESSIONS,
  FITNESS_MIN_SPAN_DAYS,
  fitnessFatigue,
  localDayStartMs,
  volumeByPeriod,
} from "@/features/library/trends";
import type { LibraryIndexRow } from "@/features/library/records";

/** A mid-day timestamp on the given local date. */
const at = (y: number, m: number, d: number, h = 12): number =>
  new Date(y, m - 1, d, h).getTime();

const day = (y: number, m: number, d: number): number =>
  new Date(y, m - 1, d).getTime();

/** One indexed row for the trends engines. */
function row(
  startMs: number | null,
  moving: number,
  distance = 10_000,
): LibraryIndexRow {
  return {
    id: `r${Math.random().toString(36).slice(2, 8)}`,
    name: "S",
    index: {
      activityStartMs: startMs,
      hasTimingData: startMs !== null,
      distanceM: distance,
      movingTimeMs: startMs === null ? 0 : moving,
      recordedDistanceM: distance,
      recordedMovingTimeMs: startMs === null ? 0 : moving,
      recordedGainM: 0,
      efforts: [],
    },
  };
}

describe("localDayStartMs", () => {
  it("floors to the local calendar day", () => {
    expect(localDayStartMs(at(2024, 5, 6, 7))).toBe(day(2024, 5, 6));
    expect(localDayStartMs(at(2024, 12, 31, 23))).toBe(day(2024, 12, 31));
    expect(localDayStartMs(at(2025, 1, 1, 0))).toBe(day(2025, 1, 1));
  });
});

describe("volumeByPeriod — ISO weeks (Monday start)", () => {
  it("Monday–Sunday land in one bucket keyed at the Monday", () => {
    // 2024-05-06 is a Monday; 2024-05-12 is its Sunday.
    const rows = [
      row(at(2024, 5, 6), 3600_000, 30_000),
      row(at(2024, 5, 8), 1800_000, 15_000),
      row(at(2024, 5, 12), 900_000, 7_500),
    ];
    const weeks = volumeByPeriod(rows, "week");
    expect(weeks).toHaveLength(1);
    expect(weeks[0]!.startMs).toBe(day(2024, 5, 6));
    expect(weeks[0]!.activities).toBe(3);
    expect(weeks[0]!.distanceM).toBe(52_500);
    expect(weeks[0]!.movingTimeMs).toBe(6300_000);
  });

  it("the next Monday opens a new bucket, sorted ascending", () => {
    const rows = [row(at(2024, 5, 13), 0), row(at(2024, 5, 6), 0)];
    const weeks = volumeByPeriod(rows, "week");
    expect(weeks.map((w) => w.startMs)).toEqual([
      day(2024, 5, 6),
      day(2024, 5, 13),
    ]);
  });

  it("a Sunday belongs to the PREVIOUS Monday, not the next", () => {
    // 2024-05-05 is a Sunday → its ISO week starts 2024-04-29.
    const weeks = volumeByPeriod([row(at(2024, 5, 5), 0)], "week");
    expect(weeks[0]!.startMs).toBe(day(2024, 4, 29));
  });
});

describe("volumeByPeriod — calendar months", () => {
  it("month boundaries split buckets at the 1st", () => {
    const rows = [row(at(2024, 5, 31), 0), row(at(2024, 6, 1), 0)];
    const months = volumeByPeriod(rows, "month");
    expect(months.map((m) => m.startMs)).toEqual([
      day(2024, 5, 1),
      day(2024, 6, 1),
    ]);
  });
});

describe("volumeByPeriod — the honesty rules", () => {
  it("sessions without timestamps never appear (counted, not bucketed)", () => {
    const weeks = volumeByPeriod([row(null, 3600_000)], "week");
    expect(weeks).toHaveLength(0);
  });

  it("same-day sessions aggregate into one bucket", () => {
    const weeks = volumeByPeriod(
      [row(at(2024, 5, 6, 7), 0), row(at(2024, 5, 6, 20), 0)],
      "week",
    );
    expect(weeks).toHaveLength(1);
    expect(weeks[0]!.activities).toBe(2);
  });
});

describe("fitnessFatigue — the impulse-response model", () => {
  const f42 = 1 - Math.exp(-1 / CTL_TIME_CONSTANT_DAYS);
  const f7 = 1 - Math.exp(-1 / ATL_TIME_CONSTANT_DAYS);

  it("single day: both averages step from zero by the exact factor", () => {
    // One day, load = 5400 s (two sessions' moving time).
    const result = fitnessFatigue([
      row(at(2024, 5, 6, 7), 3600_000),
      row(at(2024, 5, 6, 19), 1800_000),
    ])!;
    expect(result.points).toHaveLength(1);
    expect(result.points[0]!.ctl).toBeCloseTo(5400 * f42, 9);
    expect(result.points[0]!.atl).toBeCloseTo(5400 * f7, 9);
    expect(result.points[0]!.form).toBeCloseTo(
      5400 * f42 - 5400 * f7,
      9,
    );
    expect(result.sessionCount).toBe(2);
    expect(result.spanDays).toBe(1);
  });

  it("chains across rest days (a rest day is load zero, not a hole)", () => {
    // Day 0: 1000 s. Day 1: rest. Day 2: 2000 s.
    const result = fitnessFatigue([
      row(at(2024, 5, 6), 1000_000),
      row(at(2024, 5, 8), 2000_000),
    ])!;
    expect(result.points).toHaveLength(3);
    const ctl0 = 1000 * f42;
    const atl0 = 1000 * f7;
    const ctl1 = ctl0 + (0 - ctl0) * f42;
    const atl1 = atl0 + (0 - atl0) * f7;
    const ctl2 = ctl1 + (2000 - ctl1) * f42;
    const atl2 = atl1 + (2000 - atl1) * f7;
    expect(result.points[0]!.ctl).toBeCloseTo(ctl0, 9);
    expect(result.points[1]!.ctl).toBeCloseTo(ctl1, 9);
    expect(result.points[2]!.ctl).toBeCloseTo(ctl2, 9);
    expect(result.points[2]!.atl).toBeCloseTo(atl2, 9);
    expect(result.points[2]!.form).toBeCloseTo(ctl2 - atl2, 9);
    expect(result.spanDays).toBe(3);
  });

  it("fatigue decays faster than fitness over a rest stretch", () => {
    // Ten daily sessions, then nine rest days, then one more: over the
    // rest stretch ATL must fall further than CTL (fatigue is the
    // short timescale), and form must RECOVER (rise) across it.
    const rows: LibraryIndexRow[] = [];
    for (let i = 0; i < 10; i += 1) {
      rows.push(row(at(2024, 5, 1 + i), 3600_000));
    }
    rows.push(row(at(2024, 5, 20), 3600_000));
    const result = fitnessFatigue(rows)!;
    // Days 1..20 → indices 0..19.
    const afterBlock = result.points[10]!; // day 11: first rest day
    const beforeFinal = result.points[18]!; // day 19: last rest day
    const ctlDrop = afterBlock.ctl - beforeFinal.ctl;
    const atlDrop = afterBlock.atl - beforeFinal.atl;
    expect(atlDrop).toBeGreaterThan(ctlDrop);
    expect(beforeFinal.form).toBeGreaterThan(afterBlock.form);
    // And the final (load) day: ATL responded more to it than CTL did.
    const last = result.points[19]!;
    expect(last.atl - beforeFinal.atl).toBeGreaterThan(
      last.ctl - beforeFinal.ctl,
    );
  });

  it("the honest minimum counts gate the line", () => {
    expect(FITNESS_MIN_SPAN_DAYS).toBe(21);
    expect(FITNESS_MIN_SESSIONS).toBe(8);
    // Two sessions over one day: computed but gated.
    const thin = fitnessFatigue([
      row(at(2024, 5, 6), 3600_000),
      row(at(2024, 5, 6), 1800_000),
    ])!;
    expect(thin.minCountMet).toBe(false);

    // Ten sessions over 30 days: the gate opens.
    const rows: LibraryIndexRow[] = [];
    for (let i = 0; i < 10; i += 1) {
      rows.push(row(at(2024, 5, 1 + i * 3), 3600_000));
    }
    const rich = fitnessFatigue(rows)!;
    expect(rich.sessionCount).toBe(10);
    expect(rich.spanDays).toBeGreaterThanOrEqual(21);
    expect(rich.minCountMet).toBe(true);
  });

  it("undated and zero-moving sessions are counted out, never guessed", () => {
    const result = fitnessFatigue([
      row(null, 3600_000),
      row(at(2024, 5, 6), 0),
    ])!;
    expect(result.points).toHaveLength(0);
    expect(result.untimedCount).toBe(2);
    expect(result.minCountMet).toBe(false);
  });

  it("an empty library is null (nothing to model)", () => {
    expect(fitnessFatigue([])).toBeNull();
  });
});
