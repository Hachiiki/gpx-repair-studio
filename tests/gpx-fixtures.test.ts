/**
 * Fixture corpus & generator tests (docs/MASTER_PLAN.md §N-1).
 *
 * Pure Node environment — the generator is string-based, no DOM needed.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  generateSyntheticGpx,
  mulberry32,
} from "@/features/gpx/fixtures/generators";

const FIXTURES_DIR = join(
  process.cwd(),
  "src",
  "features",
  "gpx",
  "fixtures",
  "files",
);

describe("committed corpus sanity", () => {
  it("contains the expected fixture files, all non-empty and XML-ish", () => {
    const files = readdirSync(FIXTURES_DIR).filter((f) => f.endsWith(".gpx"));
    expect(files.length).toBeGreaterThanOrEqual(29);
    for (const file of files) {
      const full = join(FIXTURES_DIR, file);
      expect(statSync(full).size, `${file} is empty`).toBeGreaterThan(0);
      const text = readFileSync(full, "utf8");
      // Optional BOM, then an XML declaration or root element.
      const stripped = text.replace(/^\uFEFF/, "").trimStart();
      expect(stripped.startsWith("<"), `${file} does not start with XML`).toBe(true);
    }
  });
});

describe("generator determinism", () => {
  it("same seed → byte-identical documents", () => {
    const a = generateSyntheticGpx({ pointCount: 500, seed: 7 });
    const b = generateSyntheticGpx({ pointCount: 500, seed: 7 });
    expect(a).toBe(b);
  });

  it("different seeds → different documents", () => {
    const a = generateSyntheticGpx({ pointCount: 500, seed: 7 });
    const b = generateSyntheticGpx({ pointCount: 500, seed: 8 });
    expect(a).not.toBe(b);
  });

  it("mulberry32 is deterministic and in [0, 1)", () => {
    const rng = mulberry32(42);
    const first = [rng(), rng(), rng()];
    const rng2 = mulberry32(42);
    const second = [rng2(), rng2(), rng2()];
    expect(first).toEqual(second);
    for (const value of first) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("generator structure", () => {
  it("emits exactly pointCount track points", () => {
    const xml = generateSyntheticGpx({ pointCount: 137, seed: 3 });
    expect((xml.match(/<trkpt /g) ?? []).length).toBe(137);
  });

  it("respects withTime / withEle switches", () => {
    const bare = generateSyntheticGpx({ pointCount: 10, withTime: false, withEle: false });
    expect(bare).not.toContain("<time>");
    expect(bare).not.toContain("<ele>");
    const full = generateSyntheticGpx({ pointCount: 10 });
    expect(full).toContain("<time>");
    expect(full).toContain("<ele>");
  });

  it("injects the requested time gap after the given index", () => {
    const xml = generateSyntheticGpx({
      pointCount: 20,
      seed: 5,
      timeGapAfter: 10,
      timeGapSeconds: 600,
    });
    // Match only point times (the metadata <time> sits before <trkseg>).
    const body = xml.slice(xml.indexOf("<trkseg>"));
    const times = [...body.matchAll(/<time>([^<]+)<\/time>/g)].map((m) =>
      Date.parse(m[1]),
    );
    expect(times).toHaveLength(20);
    // Cadence is 1 s per point; the gap adds 600 s after index 10.
    expect(times[11] - times[10]).toBe(601_000);
    expect(times[10] - times[9]).toBe(1_000);
  });

  it("escapes XML-significant characters in names", () => {
    const xml = generateSyntheticGpx({
      pointCount: 2,
      trackName: "Run & <Fast>",
      creator: "A<B&C",
    });
    expect(xml).toContain("Run &amp; &lt;Fast&gt;");
    expect(xml).not.toContain("Run & <Fast>");
  });

  it("generates a large 100k-point document", () => {
    const xml = generateSyntheticGpx({ pointCount: 100_000, seed: 1 });
    expect(xml.length).toBeGreaterThan(5_000_000);
    expect((xml.match(/<trkpt /g) ?? []).length).toBe(100_000);
  });
});
