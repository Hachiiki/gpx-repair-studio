/**
 * Unit tests for lib/utils/format.ts (§L-1 centralized formatting).
 * Pure string functions — node environment.
 */

import { describe, expect, it } from "vitest";
import {
  formatDateTime,
  formatDistanceForUnit,
  formatDistanceMeters,
  formatDurationCompactMs,
  formatDurationMs,
  formatLatLon,
  formatSpeedKmh,
} from "@/lib/utils/format";

describe("formatDistanceMeters", () => {
  it("renders meters below 1 km, rounded", () => {
    expect(formatDistanceMeters(0)).toBe("0 m");
    expect(formatDistanceMeters(54.4)).toBe("54 m");
    expect(formatDistanceMeters(999.4)).toBe("999 m");
  });

  it("renders kilometers with two decimals from 1 km up", () => {
    expect(formatDistanceMeters(1000)).toBe("1.00 km");
    expect(formatDistanceMeters(12_345)).toBe("12.35 km"); // rounds half up
    expect(formatDistanceMeters(42_000)).toBe("42.00 km");
  });

  it("renders an em dash for non-finite values", () => {
    expect(formatDistanceMeters(Number.NaN)).toBe("—");
    expect(formatDistanceMeters(Number.POSITIVE_INFINITY)).toBe("—");
  });
});

describe("formatDurationMs", () => {
  it("renders m:ss below one hour", () => {
    expect(formatDurationMs(0)).toBe("0:00");
    expect(formatDurationMs(5_000)).toBe("0:05");
    expect(formatDurationMs(65_000)).toBe("1:05");
    expect(formatDurationMs(2_523_000)).toBe("42:03");
  });

  it("renders h:mm:ss from one hour up", () => {
    expect(formatDurationMs(3_600_000)).toBe("1:00:00");
    expect(formatDurationMs(3_723_000)).toBe("1:02:03");
    expect(formatDurationMs(86_400_000)).toBe("24:00:00");
  });

  it("truncates sub-second remainders", () => {
    expect(formatDurationMs(1_999)).toBe("0:01");
  });

  it("renders an em dash for negative or non-finite values", () => {
    expect(formatDurationMs(-5)).toBe("—");
    expect(formatDurationMs(Number.NaN)).toBe("—");
  });
});

describe("formatSpeedKmh", () => {
  it("renders km/h with one decimal", () => {
    expect(formatSpeedKmh(0)).toBe("0.0 km/h");
    expect(formatSpeedKmh(12.34)).toBe("12.3 km/h");
    expect(formatSpeedKmh(25)).toBe("25.0 km/h");
  });

  it("renders an em dash for non-finite values", () => {
    expect(formatSpeedKmh(Number.NaN)).toBe("—");
  });
});

describe("formatDateTime", () => {
  it("renders an em dash for missing values", () => {
    expect(formatDateTime(undefined)).toBe("—");
    expect(formatDateTime(Number.NaN)).toBe("—");
  });

  it("includes the year, month, and day of the epoch", () => {
    const text = formatDateTime(Date.UTC(2024, 4, 1, 7, 0, 9));
    expect(text).toMatch(/2024/);
    expect(text).toMatch(/May|05/);
  });
});

describe("formatLatLon", () => {
  it("renders five decimals (~1 m) for both components", () => {
    expect(formatLatLon(52.520006, 13.404954)).toBe("52.52001, 13.40495");
    expect(formatLatLon(-33.8688, 151.2093)).toBe("-33.86880, 151.20930");
  });

  it("renders an em dash when either coordinate is unusable", () => {
    expect(formatLatLon(Number.NaN, 13.4)).toBe("—");
    expect(formatLatLon(52.5, Number.NaN)).toBe("—");
  });
});

describe("formatDurationCompactMs (Task 20 — the share card's time)", () => {
  it("renders seconds only below a minute", () => {
    expect(formatDurationCompactMs(0)).toBe("0s");
    expect(formatDurationCompactMs(42_000)).toBe("42s");
  });

  it("renders m / m s below one hour", () => {
    expect(formatDurationCompactMs(60_000)).toBe("1m");
    expect(formatDurationCompactMs(273_000)).toBe("4m 33s");
    expect(formatDurationCompactMs(3_180_000)).toBe("53m");
  });

  it("renders h m at one hour and above, seconds dropped (the Strava form)", () => {
    expect(formatDurationCompactMs(3_600_000)).toBe("1h");
    expect(formatDurationCompactMs(6_336_000)).toBe("1h 45m");
    expect(formatDurationCompactMs(7_200_000)).toBe("2h");
    expect(formatDurationCompactMs(28_662_000)).toBe("7h 57m");
  });

  it("renders an em dash for non-finite or negative values", () => {
    expect(formatDurationCompactMs(Number.NaN)).toBe("—");
    expect(formatDurationCompactMs(-1)).toBe("—");
  });
});

describe("formatDistanceForUnit (Task 20 — the share card's distance)", () => {
  it("keeps the km convention for km", () => {
    expect(formatDistanceForUnit(48.4, "km")).toBe("48 m");
    expect(formatDistanceForUnit(21_120, "km")).toBe("21.12 km");
  });

  it("converts to miles with two decimals for mi (any magnitude)", () => {
    expect(formatDistanceForUnit(850, "mi")).toBe("0.53 mi");
    expect(formatDistanceForUnit(21_120, "mi")).toBe("13.12 mi");
    expect(formatDistanceForUnit(0, "mi")).toBe("0.00 mi");
  });

  it("renders an em dash for non-finite values", () => {
    expect(formatDistanceForUnit(Number.NaN, "km")).toBe("—");
    expect(formatDistanceForUnit(Number.NaN, "mi")).toBe("—");
  });
});
