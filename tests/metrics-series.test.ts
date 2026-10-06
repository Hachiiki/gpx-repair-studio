// @vitest-environment jsdom
/**
 * Metrics-profile goldens (Phase 23.3 verification): the display
 * series the metrics charts draw — recorded metrics only, holes where
 * the file records nothing, reconstructed stretches as metric holes
 * with their estimated elevation kept, decimation to the bounded
 * count, display-only smoothing with the window disclosed.
 */

import { describe, expect, it } from "vitest";
import {
  METRICS_PROFILE_MAX_POINTS,
  buildMetricsProfile,
} from "@/features/statistics/metrics-series";
import { metricsMerge } from "./helpers/metricsTestUtils";

const lonAt = (steps: number) => -0.02 + steps * 0.008;
const LAT = 0;

describe("buildMetricsProfile — presence + holes", () => {
  it("carries the metrics that exist, holes where they do not", () => {
    const merge = metricsMerge([
      { lat: LAT, lon: lonAt(0), ele: 100, time: 0, hr: 120, cad: 82 },
      { lat: LAT, lon: lonAt(1), ele: 102, time: 10_000, hr: 130 }, // no cad
      { lat: LAT, lon: lonAt(2), ele: 104, time: 20_000, cad: 90 }, // no hr
    ]);
    const profile = buildMetricsProfile(merge)!;
    expect(profile).not.toBeNull();
    expect(profile.hasAnyEle).toBe(true);
    expect(profile.hasHr).toBe(true);
    expect(profile.hasCad).toBe(true);
    expect(profile.hasPower).toBe(false);
    // Holes are undefined, never zero.
    expect(profile.points[1].cad).toBeUndefined();
    expect(profile.points[2].hr).toBeUndefined();
    // Distances accumulate from zero.
    expect(profile.points[0].xM).toBe(0);
    expect(profile.totalDistanceM).toBeGreaterThan(0);
    // The smoothing window ships with the result (the disclosure).
    expect(profile.smoothingWindow).toBe(5);
  });

  it("a metrics-free, elevation-free route yields an all-false profile", () => {
    const merge = metricsMerge([
      { lat: LAT, lon: lonAt(0), time: 0 },
      { lat: LAT, lon: lonAt(1), time: 10_000 },
    ]);
    const profile = buildMetricsProfile(merge)!;
    expect(profile.hasHr).toBe(false);
    expect(profile.hasCad).toBe(false);
    expect(profile.hasPower).toBe(false);
    expect(profile.hasAnyEle).toBe(false);
    expect(buildMetricsProfile(null)).toBeNull();
  });

  it("extents are over the display series (post-smoothing, like the profile chart)", () => {
    const merge = metricsMerge([
      { lat: LAT, lon: lonAt(0), ele: 100, time: 0, hr: 120 },
      { lat: LAT, lon: lonAt(1), ele: 102, time: 10_000, hr: 130 },
      { lat: LAT, lon: lonAt(2), ele: 104, time: 20_000, hr: 160 },
    ]);
    const profile = buildMetricsProfile(merge, { smoothingWindow: 1 })!;
    expect(profile.minHr).toBe(120);
    expect(profile.maxHr).toBe(160);
    expect(profile.minEleM).toBe(100);
    expect(profile.maxEleM).toBe(104);
  });
});

describe("buildMetricsProfile — decimation + smoothing", () => {
  it("decimates to the bounded point count (§E-5)", () => {
    const points = Array.from({ length: 1500 }, (_, i) => ({
      lat: LAT,
      lon: -0.02 + (i * 0.008) / 500,
      ele: 100 + (i % 10),
      time: i * 1000,
      hr: 120 + (i % 40),
    }));
    const profile = buildMetricsProfile(metricsMerge(points))!;
    expect(METRICS_PROFILE_MAX_POINTS).toBe(600);
    expect(profile.points.length).toBeLessThanOrEqual(
      METRICS_PROFILE_MAX_POINTS,
    );
    expect(profile.points.length).toBeGreaterThanOrEqual(500);
  });

  it("smoothing is hole-aware and display-only (a window of 1 is identity)", () => {
    const points = Array.from({ length: 8 }, (_, i) => ({
      lat: LAT,
      lon: lonAt(i),
      ele: 100,
      time: i * 10_000,
      ...(i % 2 === 0 ? { hr: 120 + i } : {}), // alternating holes
    }));
    const identity = buildMetricsProfile(points && metricsMerge(points), {
      smoothingWindow: 1,
    })!;
    expect(identity.points[1].hr).toBeUndefined();
    expect(identity.points[0].hr).toBe(120);
    expect(identity.points[2].hr).toBe(122);

    const smoothed = buildMetricsProfile(metricsMerge(points), {
      smoothingWindow: 5,
    })!;
    // Holes stay holes; defined values stay defined (the average of
    // defined neighbors inside the window).
    expect(smoothed.points[1].hr).toBeUndefined();
    expect(smoothed.points[2].hr).not.toBeUndefined();
    expect(smoothed.smoothingWindow).toBe(5);
  });
});
