// @vitest-environment jsdom
/**
 * Track-snapshot tests (Phase 19, §EE 19.2): the static SVG builder.
 *
 * Pins the contract: valid SVG structure with deterministic bytes;
 * colors and stroke widths per layer (under / base / changed); shared
 * bounds produce the SAME projection for both side-by-side panels; gap
 * boundaries break the lines like the map's join; empty input renders
 * an honest labeled empty plate.
 */

import { describe, expect, it } from "vitest";
import { parseFixture } from "./helpers/gpxTestUtils";
import {
  buildTrackSnapshotSvg,
  snapshotBounds,
  snapshotLinesOf,
  spanCoordinates,
} from "@/features/compare/trackSnapshot";

const COLORS = { base: "#222222", changed: "#FC4C02", under: "#75706B" };

describe("buildTrackSnapshotSvg — structure", () => {
  const data = parseFixture("deep-defects.gpx");
  const lines = snapshotLinesOf(data);

  it("emits a valid, labeled svg with polylines", () => {
    const svg = buildTrackSnapshotSvg({
      lines,
      colors: COLORS,
      label: "Test snapshot",
    });
    expect(svg.startsWith("<svg xmlns=")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain('role="img"');
    expect(svg).toContain("<title>Test snapshot</title>");
    expect(svg).toContain("<polyline");
    expect(svg).toContain(`stroke="${COLORS.base}"`);
  });

  it("is deterministic — same input, same bytes", () => {
    const a = buildTrackSnapshotSvg({ lines, colors: COLORS });
    const b = buildTrackSnapshotSvg({ lines, colors: COLORS });
    expect(a).toBe(b);
  });

  it("renders the changed group only when changed lines exist", () => {
    const plain = buildTrackSnapshotSvg({ lines, colors: COLORS });
    expect(plain).not.toContain(`stroke="${COLORS.changed}"`);
    const changed = buildTrackSnapshotSvg({
      lines,
      changed: lines.slice(0, 1),
      colors: COLORS,
    });
    expect(changed).toContain(`stroke="${COLORS.changed}"`);
    expect(changed.indexOf(COLORS.under)).toBe(-1);
  });

  it("renders the under (ghost) group under the base", () => {
    const svg = buildTrackSnapshotSvg({
      lines,
      under: lines.slice(0, 1),
      colors: COLORS,
    });
    expect(svg).toContain(`stroke="${COLORS.under}"`);
    // Under first, base after — z-order by document order.
    expect(svg.indexOf(COLORS.under)).toBeLessThan(svg.indexOf(COLORS.base));
  });

  it("empty input renders an honest empty plate", () => {
    const svg = buildTrackSnapshotSvg({ lines: [], colors: COLORS, label: "Nothing" });
    expect(svg).toContain("<svg");
    expect(svg).not.toContain("<polyline");
    expect(svg).toContain("<title>Nothing</title>");
  });
});

describe("buildTrackSnapshotSvg — the shared-bounds rule", () => {
  const data = parseFixture("deep-defects.gpx");
  const all = snapshotLinesOf(data);
  const half = all.slice(0, Math.max(1, Math.floor(all.length / 2)));

  it("both panels built on one bounds share the same viewBox", () => {
    const bounds = snapshotBounds(all, half);
    expect(bounds).not.toBeNull();
    const left = buildTrackSnapshotSvg({
      lines: all,
      colors: COLORS,
      bounds,
    });
    const right = buildTrackSnapshotSvg({
      lines: half,
      colors: COLORS,
      bounds,
    });
    const viewBox = (svg: string) =>
      /viewBox="([^"]+)"/.exec(svg)?.[1] ?? "";
    expect(viewBox(left)).toBe(viewBox(right));
  });

  it("a shared bounds that covers a wider extent rescales both", () => {
    const own = snapshotBounds(half);
    const shared = snapshotBounds(all, half);
    expect(shared!.maxLon).toBeGreaterThanOrEqual(own!.maxLon);
    const svg = buildTrackSnapshotSvg({
      lines: half,
      colors: COLORS,
      bounds: shared,
    });
    // The smaller set still renders inside the shared box.
    expect(svg).toContain("<polyline");
  });
});

describe("snapshotLinesOf — the honesty rules", () => {
  it("breaks lines at gap boundaries (before ends, after starts)", () => {
    const data = parseFixture("four-time-gaps.gpx");
    // Without breaks: one continuous run of usable points.
    const continuous = snapshotLinesOf(data);
    // With breaks at every point id (extreme case): single-point runs
    // drop, proving the break logic runs — instead, use realistic
    // before/after sets: every point is a boundary, so nothing draws.
    const allIds = new Set<string>();
    for (const segment of data.segments) {
      for (const point of segment.points) allIds.add(point.id);
    }
    const broken = snapshotLinesOf(data, {
      beforePointIds: allIds,
      afterPointIds: new Set<string>(),
    });
    expect(continuous.length).toBeGreaterThan(0);
    expect(broken.length).toBe(0);
  });

  it("skips unusable (damaged) points", () => {
    const data = parseFixture("bad-coords.gpx");
    const lines = snapshotLinesOf(data);
    // Every emitted coordinate is finite — damage never enters a line.
    for (const line of lines) {
      for (const [lon, lat] of line.coordinates) {
        expect(Number.isFinite(lon)).toBe(true);
        expect(Number.isFinite(lat)).toBe(true);
      }
    }
  });
});

describe("spanCoordinates", () => {
  const data = parseFixture("deep-defects.gpx");

  it("slices the inclusive index range", () => {
    const slice = spanCoordinates(data, "t0s0", 2, 5);
    expect(slice).not.toBeNull();
    expect(slice!.coordinates).toHaveLength(4);
  });

  it("returns null for out-of-range or too-short slices", () => {
    expect(spanCoordinates(data, "t0s0", 50, 60)).toBeNull();
    expect(spanCoordinates(data, "missing", 0, 5)).toBeNull();
    expect(spanCoordinates(data, "t0s0", 0, 0)).toBeNull();
  });
});
