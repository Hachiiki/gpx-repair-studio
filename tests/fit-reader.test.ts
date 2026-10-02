/**
 * FIT reader tests (Phase 14 — §EE 14.3).
 *
 * The plan's verification rule: the binary fixtures are HASH-CHECKED
 * (a change to any fixture must be deliberate — regenerate and re-pin),
 * then decoded against hand-computed goldens. The generator
 * (scripts/gen-fit-fixtures.py) is an independent encoder, so the two
 * implementations agreeing is evidence, not a tautology.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readFitFile, FIT_EPOCH_SECONDS } from "@/features/formats/fit/reader";

const FIXTURES = join(process.cwd(), "src/features/formats/fixtures/files");

function loadFit(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(FIXTURES, name)));
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** 2024-05-01T06:00:00Z in FIT epoch seconds (hand-computed). */
const T0_FIT = Date.parse("2024-05-01T06:00:00.000Z") / 1000 - FIT_EPOCH_SECONDS;

describe("FIT fixtures are hash-pinned (§EE 14 verification)", () => {
  it("activity.fit matches its pinned digest", () => {
    expect(sha256(loadFit("activity.fit"))).toBe(
      "12ee7b1380247f238cbf49f5429b58048c4733397bb2f96f78a286a9352b9e7a",
    );
  });
  it("activity-compressed.fit matches its pinned digest", () => {
    expect(sha256(loadFit("activity-compressed.fit"))).toBe(
      "3d2465d0c19c3135558c732dd3ad48f6cd4c363288e3a8296a4295f93b977ecb",
    );
  });
  it("course.fit matches its pinned digest", () => {
    expect(sha256(loadFit("course.fit"))).toBe(
      "43c2668f27951686f0c352488163c25f5c77cbaf1587933309f537bfda0733ae",
    );
  });
  it("truncated.fit matches its pinned digest", () => {
    expect(sha256(loadFit("truncated.fit"))).toBe(
      "7df3744c0980049cd03100ae24f8505c5c65cc13e55c81405fe373616bcce787",
    );
  });
});

describe("readFitFile — activity.fit (the golden)", () => {
  const outcome = readFitFile(loadFit("activity.fit"));

  it("succeeds with no warnings (CRC intact)", () => {
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.warnings).toEqual([]);
    expect(outcome.data.fileType).toBe(4);
    expect(outcome.data.manufacturer).toBe(1);
    expect(outcome.data.timeCreatedMs).toBe(Date.parse("2024-05-01T06:00:00.000Z"));
  });

  it("decodes 8 records with exact geometry, altitude, and metrics", () => {
    if (!outcome.ok) throw new Error("unexpected failure");
    expect(outcome.data.records).toHaveLength(8);
    const first = outcome.data.records[0];
    // Semicircle quantization is ~8.4e-8° — assert to 1e-6, not exact.
    expect(first.lat).toBeCloseTo(-37.95, 6);
    expect(first.lon).toBeCloseTo(145.1, 6);
    // raw altitude 2710 → 2710/5 − 500 = 42.0 m
    expect(first.ele).toBeCloseTo(42.0, 6);
    expect(first.hr).toBe(120);
    expect(first.cad).toBe(82);
    expect(first.timestampMs).toBe(Date.parse("2024-05-01T06:00:00.000Z"));
    expect(T0_FIT).toBeGreaterThan(0);
  });

  it("marks the pause record as position-less (invalid sint32 markers)", () => {
    if (!outcome.ok) throw new Error("unexpected failure");
    const pause = outcome.data.records[5];
    expect(pause.lat).toBeUndefined();
    expect(pause.lon).toBeUndefined();
    expect(pause.hr).toBe(150);
  });

  it("reads the lap and the session summary", () => {
    if (!outcome.ok) throw new Error("unexpected failure");
    expect(outcome.data.laps).toEqual([
      { startTimeMs: Date.parse("2024-05-01T06:00:00.000Z") },
    ]);
    expect(outcome.data.sessions).toEqual([
      { startTimeMs: Date.parse("2024-05-01T06:00:00.000Z"), sport: 2 },
    ]);
  });
});

describe("readFitFile — activity-compressed.fit", () => {
  const outcome = readFitFile(loadFit("activity-compressed.fit"));

  it("succeeds (14-byte header CRC verified)", () => {
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.data.warnings).toEqual([]);
  });

  it("reconstructs every compressed timestamp exactly", () => {
    if (!outcome.ok) throw new Error("unexpected failure");
    expect(outcome.data.records).toHaveLength(12);
    for (let i = 0; i < 12; i += 1) {
      const record = outcome.data.records[i];
      const expectedMs = Date.parse("2024-05-01T06:00:00.000Z") + i * 3000;
      expect(
        record.timestampMs,
        `record ${i} timestamp (offset wrap case)`,
      ).toBe(expectedMs);
      expect(record.lat).toBeCloseTo(-37.95 + 0.000045 * i, 6);
    }
  });
});

describe("readFitFile — course.fit", () => {
  const outcome = readFitFile(loadFit("course.fit"));

  it("recognizes the course file type and name", () => {
    if (!outcome.ok) throw new Error("unexpected failure");
    expect(outcome.data.fileType).toBe(6);
    expect(outcome.data.courseNames).toEqual(["Hill Repeats"]);
  });

  it("decodes the course points with UTF-8 names intact", () => {
    if (!outcome.ok) throw new Error("unexpected failure");
    expect(outcome.data.records).toHaveLength(5);
    expect(outcome.data.coursePoints).toHaveLength(2);
    expect(outcome.data.coursePoints[0].name).toBe("Start & Café");
    expect(outcome.data.coursePoints[1].name).toBe('Summit "Uetliberg"');
    expect(outcome.data.coursePoints[0].lat).toBeCloseTo(47.3567, 6);
  });
});

describe("readFitFile — truncated.fit (the repair stance)", () => {
  const outcome = readFitFile(loadFit("truncated.fit"));

  it("recovers the records that precede the truncation", () => {
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    // The fixture cuts inside record 6: exactly 5 decode.
    expect(outcome.data.records).toHaveLength(5);
    expect(outcome.data.records[0].lat).toBeCloseTo(-37.95, 6);
  });

  it("discloses the truncation and the CRC mismatch as warnings", () => {
    if (!outcome.ok) return;
    const joined = outcome.data.warnings.join(" | ");
    expect(joined).toContain("truncated");
    expect(joined).toContain("CRC mismatch");
  });
});

describe("readFitFile — hard failures", () => {
  it("rejects a too-short file", () => {
    const result = readFitFile(new Uint8Array(8));
    expect(result.ok).toBe(false);
    if (result.ok || result.error.kind !== "malformed-fitness-file") {
      throw new Error("expected a malformed-fitness-file error");
    }
    expect(result.error.message).toContain("bytes");
  });

  it("rejects a missing .FIT signature", () => {
    const bytes = new Uint8Array(20);
    bytes[0] = 12;
    const result = readFitFile(bytes);
    expect(result.ok).toBe(false);
    if (result.ok || result.error.kind !== "malformed-fitness-file") {
      throw new Error("expected a malformed-fitness-file error");
    }
    expect(result.error.message).toContain(".FIT");
  });

  it("rejects a header-only file with no positioned record", () => {
    const bytes = new Uint8Array(14);
    bytes[0] = 12;
    bytes[8] = 0x2e;
    bytes[9] = 0x46;
    bytes[10] = 0x49;
    bytes[11] = 0x54;
    const result = readFitFile(bytes);
    expect(result.ok).toBe(false);
    if (result.ok || result.error.kind !== "malformed-fitness-file") {
      throw new Error("expected a malformed-fitness-file error");
    }
    expect(result.error.message).toContain("no data messages");
  });
});
