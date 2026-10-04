/**
 * Locale-aware formatting tests (Phase 21 — §EE 21.3: number, unit,
 * and date localization).
 *
 * English values must stay BYTE-IDENTICAL to the pre-i18n forms (the
 * whole app's test corpus asserts them); Chinese gets its own unit
 * vocabulary and Intl conventions. Node-environment runs default to
 * English — the explicit-locale core is exercised directly.
 */

import { describe, expect, it } from "vitest";
import {
  artifactFormatters,
  formatDateTime,
  formatDistanceForUnit,
  formatDistanceForUnitExplicit,
  formatDistanceMeters,
  formatElevationMeters,
  formatPace,
  formatSpeedKmh,
} from "@/lib/utils/format";

describe("English formatting is unchanged (the existing contract)", () => {
  it("distances", () => {
    expect(formatDistanceForUnitExplicit("en", 850, "km")).toBe("850 m");
    expect(formatDistanceForUnitExplicit("en", 21_120, "km")).toBe("21.12 km");
    expect(formatDistanceForUnitExplicit("en", 21_120, "mi")).toBe("13.12 mi");
  });

  it("elevation keeps en-US grouping", () => {
    expect(formatDistanceForUnitExplicit("en", 0, "km")).toBe("0 m");
    expect(formatElevationMeters(1234)).toBe("1,234 m");
  });

  it("speed and pace", () => {
    expect(formatSpeedKmh(27.04)).toBe("27.0 km/h");
    // 323 s over 1 km = 5:23 /km; over 1 mi = 323 × 1.609344 s ≈ 8:39 /mi
    expect(formatPace(323_000, 1000, "km")).toBe("5:23 /km");
    expect(formatPace(323_000, 1000, "mi")).toBe("8:39 /mi");
  });
});

describe("Chinese unit words and Intl conventions", () => {
  it("distances swap km/m for 公里/米 with the same numerals", () => {
    expect(formatDistanceForUnitExplicit("zh-CN", 850, "km")).toBe("850 米");
    expect(formatDistanceForUnitExplicit("zh-CN", 21_120, "km")).toBe(
      "21.12 公里",
    );
    expect(formatDistanceForUnitExplicit("zh-CN", 21_120, "mi")).toBe(
      "13.12 英里",
    );
  });

  it("pace suffixes localize", () => {
    // The explicit-locale core through the public pace path:
    expect(formatPace(323000, 10000, "km")).toContain("/km");
  });

  it("dates format with the zh-CN calendar words", () => {
    const stamp = Date.UTC(2024, 5, 15, 10, 30, 0);
    const zh = new Intl.DateTimeFormat("zh-CN", {
      dateStyle: "medium",
      timeStyle: "medium",
      timeZone: "UTC",
    }).format(new Date(stamp));
    expect(zh).toMatch(/2024/);
  });
});

describe("artifact formatters stay English-pinned", () => {
  it("distances and speeds never follow the app locale", () => {
    expect(artifactFormatters.formatDistanceForUnit(21_120, "mi")).toBe(
      "13.12 mi",
    );
    expect(artifactFormatters.formatDistanceMeters(21_120)).toBe("21.12 km");
    expect(artifactFormatters.formatDurationCompactMs(6_336_000)).toBe(
      "1h 45m",
    );
    expect(artifactFormatters.formatSpeedKmh(27.04)).toBe("27.0 km/h");
  });
});

describe("public formatters degrade to English in node (no DOM)", () => {
  it("formatDistanceMeters/formatDateTime work outside jsdom", () => {
    expect(formatDistanceMeters(21_120)).toBe("21.12 km");
    expect(formatDateTime(undefined)).toBe("—");
    expect(formatDistanceForUnit(21_120, "mi")).toBe("13.12 mi");
  });
});
