/**
 * Phase 26 batch ZIP tests (§26.4): the entries, the name dedupe, and
 * the manifest's honesty — matched photos tagged, unmatched copied
 * unchanged WITH the reason, the calibration stated, the two promises
 * (nothing uploaded, no original modified) in the footer.
 */
import { describe, expect, it } from "vitest";
import { injectGps, readGps } from "@/features/photos/jpeg";
import type { PhotoMatch } from "@/features/photos/matching";
import {
  buildPhotoManifest,
  buildPhotoZipEntries,
  type PhotoZipItem,
} from "@/features/photos/zip";
import { buildSyntheticJpeg } from "./helpers/synthetic-jpeg";

const EXPORTED_AT = new Date(Date.UTC(2026, 9, 7, 1, 2, 3));

const MATCHED: PhotoMatch = {
  id: "p1",
  status: "matched",
  deltaMs: 3000,
  lat: -37.950123,
  lon: 145.100456,
  ele: 42,
  trackTimeMs: Date.UTC(2024, 4, 1, 6, 0, 42),
  onReconstructed: false,
};

const FLAGGED: PhotoMatch = {
  ...MATCHED,
  id: "p1f",
  onReconstructed: true,
};

function item(overrides: Partial<PhotoZipItem>): PhotoZipItem {
  return {
    fileName: "IMG_0001.jpg",
    bytes: buildSyntheticJpeg(),
    injected: null,
    match: MATCHED,
    exifTime: "2024:05:01 06:00:45",
    timezoneOffsetMinutes: 600,
    driftSeconds: 0,
    ...overrides,
  };
}

describe("buildPhotoZipEntries", () => {
  it("names tagged copies .geotagged.jpg, unchanged photos keep theirs", () => {
    const { entries, outcomes } = buildPhotoZipEntries(
      [
        item({ injected: buildSyntheticJpeg() }),
        item({ fileName: "IMG_0002.jpg", match: { id: "p2", status: "no-timestamp" }, exifTime: null }),
      ],
      EXPORTED_AT,
    );
    expect(outcomes).toEqual([
      { entryName: "IMG_0001.geotagged.jpg", tagged: true },
      { entryName: "IMG_0002.jpg", tagged: false },
    ]);
    expect(entries.map((entry) => entry.name)).toEqual([
      "IMG_0001.geotagged.jpg",
      "IMG_0002.jpg",
      "MANIFEST.txt",
    ]);
  });

  it("dedupes colliding names — nothing silently overwritten", () => {
    const { outcomes } = buildPhotoZipEntries(
      [
        item({ fileName: "ride.jpg", injected: buildSyntheticJpeg() }),
        item({ fileName: "ride.jpg", injected: buildSyntheticJpeg() }),
        item({ fileName: "ride.jpg", match: { id: "p3", status: "no-timestamp" }, exifTime: null }),
      ],
      EXPORTED_AT,
    );
    expect(outcomes.map((outcome) => outcome.entryName)).toEqual([
      "ride.geotagged.jpg",
      "ride.geotagged - 2.jpg",
      "ride.jpg",
    ]);
  });

  it("the tagged entry's bytes are the injected JPEG (GPS readable back)", () => {
    const injected = injectGps(buildSyntheticJpeg(), {
      lat: -37.950123,
      lon: 145.100456,
      ele: 42,
      timeMs: Date.UTC(2024, 4, 1, 6, 0, 42),
    })!;
    const { entries } = buildPhotoZipEntries(
      [item({ injected })],
      EXPORTED_AT,
    );
    // The entry IS the injected buffer (no re-encode, no re-write).
    expect(entries[0]!.bytes).toBe(injected);
    const gps = readGps(entries[0]!.bytes)!;
    expect(gps.lat).toBeCloseTo(-37.950123, 6);
    expect(gps.lon).toBeCloseTo(145.100456, 6);
  });

  it("handles the empty batch (manifest only, honest counts)", () => {
    const { entries, outcomes } = buildPhotoZipEntries([], EXPORTED_AT);
    expect(outcomes).toEqual([]);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.name).toBe("MANIFEST.txt");
    const text = new TextDecoder().decode(entries[0]!.bytes);
    expect(text).toContain("0 photos");
    expect(text).toContain("0 of 0 photos geotagged");
  });
});

describe("buildPhotoManifest (the honest narrator)", () => {
  it("states the calibration, the camera clock, and the outcome per photo", () => {
    const manifest = buildPhotoManifest(
      [
        item({}),
        item({
          fileName: "IMG_0002.jpg",
          match: { id: "p2", status: "no-timestamp" },
          exifTime: null,
        }),
        item({
          fileName: "IMG_0003.jpg",
          match: { id: "p3", status: "out-of-window", nearestDeltaSec: 400 },
          exifTime: "2024:05:01 08:00:00",
        }),
      ],
      [
        { entryName: "IMG_0001.geotagged.jpg", tagged: true },
        { entryName: "IMG_0002.jpg", tagged: false },
        { entryName: "IMG_0003.jpg", tagged: false },
      ],
      EXPORTED_AT,
    );
    expect(manifest).toContain("Exported 2026-10-07T01:02:03.000Z");
    expect(manifest).toContain("camera clock set to UTC+10:00");
    expect(manifest).toContain("— IMG_0001.jpg");
    expect(manifest).toContain("camera clock: 2024:05:01 06:00:45");
    expect(manifest).toContain("+3 s from the track");
    expect(manifest).toContain("GPS written into the copy: IMG_0001.geotagged.jpg");
    expect(manifest).toContain("no timestamp to match — copied unchanged");
    expect(manifest).toContain("outside the track's time by 400 s — copied unchanged");
    expect(manifest).toContain("1 of 3 photos geotagged");
  });

  it("discloses the drift nudge and the reconstruction flag", () => {
    const manifest = buildPhotoManifest(
      [item({ match: FLAGGED, driftSeconds: -125 })],
      [{ entryName: "IMG_0001.geotagged.jpg", tagged: true }],
      EXPORTED_AT,
    );
    expect(manifest).toContain("a \u2212125 s drift nudge");
    expect(manifest).toContain("drawn-in repair stretch");
  });

  it("carries the two promises verbatim", () => {
    const manifest = buildPhotoManifest(
      [item({})],
      [{ entryName: "IMG_0001.geotagged.jpg", tagged: true }],
      EXPORTED_AT,
    );
    expect(manifest).toContain(
      "no photo was uploaded anywhere, and no original file was modified",
    );
  });
});
