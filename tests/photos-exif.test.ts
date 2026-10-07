/**
 * Phase 26 EXIF engine tests (§26 verification: "EXIF round-trip
 * property tests — bytes in, tagged bytes out, originals untouched
 * by default").
 *
 * The fixtures come from tests/helpers/synthetic-jpeg.ts — an
 * INDEPENDENT TIFF writer — so every round-trip crosses two
 * implementations, and the maker-note/IFD1 offset rebases are
 * verified by parsing the output bytes directly, not through the
 * engine's own readers.
 */
import { describe, expect, it } from "vitest";
import {
  formatExifDateTime,
  injectGps,
  parseExifDateTime,
  readExifSummary,
  readGps,
  sniffImageKind,
  type GpsFix,
} from "@/features/photos/jpeg";
import {
  FIXTURE_MAGIC,
  buildSyntheticJpeg,
} from "./helpers/synthetic-jpeg";

/** Walk to the first Exif APP1's FF position (marker ≠ code byte). */
function exifApp1At(bytes: Uint8Array): number {
  let i = 2;
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) return -1;
    const code = bytes[i + 1]!;
    if (code === 0xda || code === 0xd9) return -1;
    const len = (bytes[i + 2]! << 8) | bytes[i + 3]!;
    if (code === 0xe1 && len >= 8) {
      let s = "";
      for (let k = 0; k < 6; k++) s += String.fromCharCode(bytes[i + 4 + k]!);
      if (s === "Exif\u0000\u0000") return i;
    }
    i += 2 + len;
  }
  return -1;
}

const FIX: GpsFix = {
  lat: -37.950123,
  lon: 145.100456,
  ele: 42.5,
  timeMs: Date.UTC(2024, 4, 1, 6, 0, 42),
};

describe("sniffImageKind (§26.3 — refusals state the format)", () => {
  it("accepts JPEG (with and without a leading APP0)", () => {
    expect(sniffImageKind(buildSyntheticJpeg())).toEqual({ kind: "jpeg" });
    expect(sniffImageKind(buildSyntheticJpeg({ app0: true }))).toEqual({
      kind: "jpeg",
    });
  });

  it("refuses HEIC/AVIF with the brand named", () => {
    expect(sniffImageKind(FIXTURE_MAGIC.heic())).toMatchObject({
      kind: "refused",
      format: "heic",
    });
    const avif = sniffImageKind(FIXTURE_MAGIC.avif());
    expect(avif).toMatchObject({ kind: "refused", format: "heic" });
    expect(avif.kind === "refused" && avif.detail).toContain("AVIF");
  });

  it("refuses camera RAW (CR2, generic TIFF-RAW, ORF, RAF)", () => {
    const cr2 = sniffImageKind(FIXTURE_MAGIC.cr2());
    expect(cr2).toMatchObject({
      kind: "refused",
      format: "raw",
    });
    expect(cr2.kind === "refused" && cr2.detail).toContain("Canon");
    expect(sniffImageKind(FIXTURE_MAGIC.nef())).toMatchObject({
      kind: "refused",
      format: "raw",
    });
    expect(sniffImageKind(FIXTURE_MAGIC.orf())).toMatchObject({
      kind: "refused",
      format: "raw",
    });
    expect(sniffImageKind(FIXTURE_MAGIC.raf())).toMatchObject({
      kind: "refused",
      format: "fujifilm-raf",
    });
  });

  it("refuses PNG and WebP with the reason stated", () => {
    expect(sniffImageKind(FIXTURE_MAGIC.png())).toMatchObject({
      kind: "refused",
      format: "png",
    });
    expect(sniffImageKind(FIXTURE_MAGIC.webp())).toMatchObject({
      kind: "refused",
      format: "webp",
    });
  });

  it("refuses unknown and tiny files", () => {
    expect(sniffImageKind(new Uint8Array(32).fill(0x42)).kind).toBe("refused");
    expect(sniffImageKind(new Uint8Array(4)).kind).toBe("refused");
  });
});

describe("EXIF DateTimeOriginal parsing", () => {
  it("parses the exact camera format into naive epoch ms", () => {
    expect(parseExifDateTime("2024:05:01 06:00:42")).toBe(
      Date.UTC(2024, 4, 1, 6, 0, 42),
    );
  });

  it("rejects impossible dates and malformed strings", () => {
    expect(parseExifDateTime("2024:13:01 00:00:00")).toBeNull();
    expect(parseExifDateTime("2024:02:30 00:00:00")).toBeNull();
    expect(parseExifDateTime("2024-05-01 06:00:42")).toBeNull();
    expect(parseExifDateTime("2024:05:01")).toBeNull();
    expect(parseExifDateTime("2024:05:01 24:00:00")).toBeNull();
    expect(parseExifDateTime("")).toBeNull();
  });

  it("round-trips through formatExifDateTime", () => {
    const ms = Date.UTC(2023, 11, 31, 23, 59, 59);
    expect(formatExifDateTime(ms)).toBe("2023:12:31 23:59:59");
    expect(parseExifDateTime(formatExifDateTime(ms))).toBe(ms);
  });
});

describe("readExifSummary", () => {
  it("returns null when the JPEG has no EXIF", () => {
    expect(readExifSummary(buildSyntheticJpeg({ app0: true }))).toBeNull();
  });

  it("reads DateTimeOriginal in both endiannesses", () => {
    for (const endian of ["II", "MM"] as const) {
      const jpeg = buildSyntheticJpeg({
        exif: {
          endian,
          make: "Testcam",
          model: "Mark II",
          dateTimeOriginal: "2024:05:01 06:00:42",
        },
      });
      expect(readExifSummary(jpeg)).toEqual({
        dateTimeOriginal: "2024:05:01 06:00:42",
        hasGps: false,
      });
    }
  });

  it("reports a missing clock as null and an existing GPS block", () => {
    const noClock = buildSyntheticJpeg({ exif: { make: "Testcam" } });
    expect(readExifSummary(noClock)?.dateTimeOriginal).toBeNull();
    const geotagged = buildSyntheticJpeg({
      exif: { dateTimeOriginal: "2024:05:01 06:00:42", gps: { lat: 1.5, lon: -2.25 } },
    });
    expect(readExifSummary(geotagged)).toEqual({
      dateTimeOriginal: "2024:05:01 06:00:42",
      hasGps: true,
    });
  });
});

describe("readGps (the independent-fixture cross-check)", () => {
  it("reads a fixture-built GPS block back to decimal degrees", () => {
    const jpeg = buildSyntheticJpeg({
      exif: { gps: { lat: -37.95, lon: 145.1 } },
    });
    const gps = readGps(jpeg);
    expect(gps).not.toBeNull();
    expect(gps!.lat).toBeCloseTo(-37.95, 5);
    expect(gps!.lon).toBeCloseTo(145.1, 5);
  });

  it("returns null without a GPS block", () => {
    expect(readGps(buildSyntheticJpeg())).toBeNull();
    expect(
      readGps(buildSyntheticJpeg({ exif: { make: "Testcam" } })),
    ).toBeNull();
  });
});

describe("injectGps — the round-trip properties", () => {
  it("A: builds EXIF from scratch (behind APP0), original untouched", () => {
    for (const app0 of [false, true]) {
      const original = buildSyntheticJpeg({ app0 });
      const frozen = original.slice();
      const out = injectGps(original, FIX);
      expect(out).not.toBeNull();
      // Originals untouched — the §26.2 default.
      expect([...original]).toEqual([...frozen]);
      expect(out!.length).toBeGreaterThan(original.length);
      // The segment lands where DCF expects (behind SOI/APP0).
      const insertAt = app0 ? 2 + 2 + 16 : 2;
      expect(out![insertAt]).toBe(0xff);
      expect(out![insertAt + 1]).toBe(0xe1);
      const gps = readGps(out!);
      expect(gps!.lat).toBeCloseTo(FIX.lat, 6);
      expect(gps!.lon).toBeCloseTo(FIX.lon, 6);
      expect(gps!.ele).toBeCloseTo(FIX.ele!, 1);
      expect(gps!.timeMs).toBe(FIX.timeMs);
      // The tail (SOS onward) is preserved byte-for-byte.
      const sosIn = original.indexOf(0xda, 2);
      expect(out!.subarray(out!.length - (original.length - sosIn))).toEqual(
        original.subarray(sosIn),
      );
    }
  });

  it("B: adds GPS to existing EXIF, preserving the camera clock and tags", () => {
    for (const endian of ["II", "MM"] as const) {
      const original = buildSyntheticJpeg({
        exif: {
          endian,
          make: "Testcam",
          model: "Mark II",
          orientation: 6,
          dateTimeOriginal: "2024:05:01 06:00:42",
        },
      });
      const out = injectGps(original, FIX)!;
      expect(out).not.toBeNull();
      const summary = readExifSummary(out);
      expect(summary).toEqual({
        dateTimeOriginal: "2024:05:01 06:00:42",
        hasGps: true,
      });
      // Make/Model payloads survive (ASCII scan of the output bytes).
      const text = new TextDecoder().decode(out);
      expect(text).toContain("Testcam\u0000");
      expect(text).toContain("Mark II\u0000");
      const gps = readGps(out)!;
      expect(gps.lat).toBeCloseTo(FIX.lat, 6);
      expect(gps.lon).toBeCloseTo(FIX.lon, 6);
    }
  });

  it("C: replaces an existing GPS block (append + repoint, zero shifts)", () => {
    const original = buildSyntheticJpeg({
      exif: {
        dateTimeOriginal: "2024:05:01 06:00:42",
        gps: { lat: 1.5, lon: -2.25 },
      },
    });
    const out = injectGps(original, FIX)!;
    const gps = readGps(out)!;
    expect(gps.lat).toBeCloseTo(FIX.lat, 6);
    expect(gps.lon).toBeCloseTo(FIX.lon, 6);
    // The camera clock survived the replacement.
    expect(readExifSummary(out)?.dateTimeOriginal).toBe("2024:05:01 06:00:42");
    // Injecting again replaces again (idempotent outcome).
    const again = injectGps(out, { ...FIX, lat: 10, lon: 20 })!;
    expect(readGps(again)!.lat).toBeCloseTo(10, 6);
  });

  it("D: rebases the sub-IFD pointer and maker-note offsets (the +12 walk)", () => {
    const maker = new Uint8Array(64).fill(0x9c);
    const original = buildSyntheticJpeg({
      exif: {
        dateTimeOriginal: "2024:05:01 06:00:42",
        bigUndefinedTag: { tag: 0x927c, bytes: maker },
      },
    });
    const out = injectGps(original, FIX)!;
    // The maker-note payload bytes still exist exactly once, and the
    // 0x927C entry's rebased offset points AT them.
    const text = new TextDecoder().decode(out);
    expect(text).toContain("2024:05:01 06:00:42\u0000");
    // Parse the output TIFF: locate the APP1, IFD0, the Exif sub-IFD,
    // and check the 0x927C data offset lands on the payload.
    const segAt = exifApp1At(out);
    expect(segAt).toBeGreaterThan(0);
    const tiffStart = segAt + 10;
    const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    const little = out[tiffStart] === 0x49;
    const ifd0At = tiffStart + view.getUint32(tiffStart + 4, little);
    let exifIfdAt = -1;
    const n0 = view.getUint16(ifd0At, little);
    for (let i = 0; i < n0; i++) {
      const at = ifd0At + 2 + 12 * i;
      if (view.getUint16(at, little) === 0x8769) {
        exifIfdAt = tiffStart + view.getUint32(at + 8, little);
      }
    }
    expect(exifIfdAt).toBeGreaterThan(0);
    const nExif = view.getUint16(exifIfdAt, little);
    let makerAt = -1;
    for (let i = 0; i < nExif; i++) {
      const at = exifIfdAt + 2 + 12 * i;
      if (view.getUint16(at, little) === 0x927c) {
        makerAt = tiffStart + view.getUint32(at + 8, little);
      }
    }
    expect(makerAt).toBeGreaterThan(0);
    expect(out.subarray(makerAt, makerAt + maker.length)).toEqual(maker);
  });

  it("E: preserves an IFD1 thumbnail chain", () => {
    const original = buildSyntheticJpeg({
      exif: {
        dateTimeOriginal: "2024:05:01 06:00:42",
        thumbnailIfd: true,
      },
    });
    const out = injectGps(original, FIX)!;
    // IFD0's next-IFD pointer must still resolve to a readable IFD1
    // with its Compression entry intact.
    const segAt = exifApp1At(out);
    expect(segAt).toBeGreaterThan(0);
    const tiffStart = segAt + 10;
    const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    const little = out[tiffStart] === 0x49;
    const ifd0At = tiffStart + view.getUint32(tiffStart + 4, little);
    const n0 = view.getUint16(ifd0At, little);
    const nextRaw = view.getUint32(ifd0At + 2 + 12 * n0, little);
    expect(nextRaw).toBeGreaterThan(0);
    const ifd1At = tiffStart + nextRaw;
    const n1 = view.getUint16(ifd1At, little);
    expect(n1).toBe(1);
    expect(view.getUint16(ifd1At + 2, little)).toBe(0x0103); // Compression
  });

  it("F: skips non-Exif APP1 segments (XMP) and keeps them in the file", () => {
    const original = buildSyntheticJpeg({
      exif: { dateTimeOriginal: "2024:05:01 06:00:42" },
      xmpApp1: true,
    });
    const out = injectGps(original, FIX)!;
    expect(readGps(out)).not.toBeNull();
    const text = new TextDecoder().decode(out);
    expect(text).toContain("ns.adobe.com/xap/1.0/");
    expect(text).toContain("standard XMP");
  });

  it("G: the negative-number honesty (S/W refs, below-sea altitude)", () => {
    const fix: GpsFix = {
      lat: -33.86785,
      lon: -118.1689,
      ele: -12.25,
      timeMs: Date.UTC(2024, 0, 15, 12, 30, 5),
    };
    const out = injectGps(buildSyntheticJpeg(), fix)!;
    const gps = readGps(out)!;
    expect(gps.lat).toBeCloseTo(fix.lat, 6);
    expect(gps.lon).toBeCloseTo(fix.lon, 6);
    expect(gps.ele).toBeCloseTo(fix.ele!, 1);
    expect(gps.timeMs).toBe(fix.timeMs);
  });

  it("H: DMS carrying at the 60-second boundary stays exact", () => {
    // 37.9999999° ≈ 37° 59′ 59.9996″ — the carry path through minutes.
    const fix: GpsFix = {
      lat: 37.9999999,
      lon: 0.0000005,
      timeMs: Date.UTC(2024, 6, 4, 1, 2, 3),
    };
    const gps = readGps(injectGps(buildSyntheticJpeg(), fix)!)!;
    expect(gps.lat).toBeCloseTo(fix.lat, 6);
    expect(gps.lon).toBeCloseTo(fix.lon, 7);
  });

  it("I: seeded-random fixes round-trip at EXIF precision, originals untouched", () => {
    let seed = 2026_05_01;
    const rand = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    };
    for (let i = 0; i < 25; i++) {
      const fix: GpsFix = {
        lat: rand() * 180 - 90,
        lon: rand() * 360 - 180,
        ele: rand() * 4000 - 200,
        timeMs: Date.UTC(2020 + Math.floor(rand() * 6), rand() * 12, rand() * 28, rand() * 24, rand() * 60, rand() * 60),
      };
      const original = buildSyntheticJpeg({
        exif: { endian: i % 2 ? "MM" : "II", dateTimeOriginal: "2024:05:01 06:00:42" },
      });
      const frozen = original.slice();
      const out = injectGps(original, fix)!;
      expect([...original]).toEqual([...frozen]);
      const gps = readGps(out)!;
      expect(gps.lat).toBeCloseTo(fix.lat, 6);
      expect(gps.lon).toBeCloseTo(fix.lon, 6);
      expect(gps.ele).toBeCloseTo(fix.ele!, 1);
      expect(readExifSummary(out)?.dateTimeOriginal).toBe("2024:05:01 06:00:42");
    }
  });
});
