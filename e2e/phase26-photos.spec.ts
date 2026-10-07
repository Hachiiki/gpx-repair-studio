/**
 * Phase 26 E2E — photo geotagging (§26 verification):
 *
 *   1. the live match preview: synthetic JPEGs added through the card's
 *      intake (one whose camera clock says 16:00:03 — Melbourne local
 *      for the fixture's 06:00:03 UTC start — one without a timestamp,
 *      one HEIC refused), the calibration proving itself live (the
 *      zone select re-matches, the drift slider re-matches), the map
 *      pin + legend entry through the bridge;
 *   2. the batch ZIP (§26.4): downloaded, unzipped in Node, the tagged
 *      entry's GPS read back EXACTLY (an independent reader over the
 *      app's own writer), the manifest's honest lines;
 *   3. axe: zero critical violations on the card.
 *
 * The JPEGs are built by tests/helpers/synthetic-jpeg.ts — a fixture
 * writer independent of the app's engine — and the read-back uses the
 * engine's own reader: two implementations cross-checking, the same
 * discipline as the unit goldens.
 */
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { readGps } from "../src/features/photos/jpeg";
import { buildSyntheticJpeg, FIXTURE_MAGIC } from "../tests/helpers/synthetic-jpeg";
import { enterRepairTool } from "./helpers/landing";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const FORMAT_FIXTURES = join("src", "features", "formats", "fixtures", "files");

function criticals(results: Awaited<ReturnType<AxeBuilder["analyze"]>>) {
  return results.violations.filter((v) => v.impact === "critical");
}

/** Load ride.tcx through the landing's repair door (the card's map). */
async function loadRideTcx(page: Page): Promise<void> {
  await enterRepairTool(page);
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByTestId("upload-zone").click();
  const chooser = await chooserPromise;
  await chooser.setFiles([join(FORMAT_FIXTURES, "ride.tcx")]);
  await expect(page.getByTestId("map-toolbar")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByTestId("photos-card")).toBeVisible();
}

/**
 * Add photos through the card's intake door. Returns the temp dir (the
 * caller keeps the files alive for the ZIP test's read-back).
 */
async function addPhotos(
  page: Page,
  files: { name: string; bytes: Uint8Array }[],
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "gpxr-phase26-"));
  const paths: string[] = [];
  for (const file of files) {
    const path = join(dir, file.name);
    await writeFile(path, file.bytes);
    paths.push(path);
  }
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByTestId("photos-add-button").click();
  const chooser = await chooserPromise;
  await chooser.setFiles(paths);
  await expect(page.getByTestId("photo-row")).toHaveCount(files.length);
  return dir;
}

/** The Melbourne camera (UTC+10:00) — the fixture's own zone. */
async function setMelbourneZone(page: Page): Promise<void> {
  await page.getByTestId("photos-tz").click();
  await page.getByRole("option", { name: "UTC+10:00", exact: true }).click();
}

test.describe("Phase 26 — photo geotagging", () => {
  test.use({
    storageState: {
      cookies: [],
      origins: [
        {
          origin: "http://localhost:3000",
          localStorage: [
            { name: "gpx-repair-studio.tour.v1", value: "seen" },
          ],
        },
      ],
    },
  });

  test.beforeEach(async ({ page }) => {
    // Photos live in memory only — nothing to wipe, but the shelf from
    // other specs must not bleed in (the heatmap toggle reads it).
    await page.goto("/");
    await page.evaluate(async () => {
      const dbs = await indexedDB.databases();
      for (const db of dbs) {
        if (db.name === "gpx-repair-studio.sessions") {
          indexedDB.deleteDatabase(db.name);
        }
      }
    });
  });

  test("the live match preview: calibration re-matches, the pin lands, refusals are named", async ({
    page,
  }) => {
    await loadRideTcx(page);

    // 16:00:03 on a Melbourne camera = 06:00:03 UTC = the fixture's
    // second point, exactly. One photo with the clock, one without,
    // one HEIC the tool must refuse by name.
    const withClock = buildSyntheticJpeg({
      exif: { dateTimeOriginal: "2024:05:01 16:00:03" },
    });
    const noClock = buildSyntheticJpeg({ exif: { make: "Testcam" } });
    const heic = FIXTURE_MAGIC.heic();
    await addPhotos(page, [
      { name: "IMG_0001.jpg", bytes: withClock },
      { name: "IMG_0002.jpg", bytes: noClock },
      { name: "IMG_0003.heic", bytes: heic },
    ]);

    // The zone is explicit (the browser's own zone is only a default).
    await setMelbourneZone(page);

    // One match, one honest no-timestamp, one refusal with the format
    // named — and the count says 1 of 2 (refusals never count).
    const matchedRow = page.getByTestId("photo-row").first();
    await expect(matchedRow).toHaveAttribute("data-status", "matched");
    await expect(page.getByTestId("photo-match")).toContainText(
      "-37.9496, 145.1000",
    );
    await expect(
      page.getByTestId("photo-row").nth(1),
    ).toHaveAttribute("data-status", "no-timestamp");
    const refusedRow = page.getByTestId("photo-row").nth(2);
    await expect(refusedRow).toHaveAttribute("data-status", "refused");
    await expect(refusedRow).toContainText(/Convert to JPEG first/i);
    await expect(page.getByTestId("photos-count")).toContainText("1 of 2 matched");

    // The pin: one matched photo → one Point feature, visible.
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.__gpxMapController!.getTestState()))
            .photoPins,
        { timeout: 10_000 },
      )
      .toMatchObject({ visible: true, pinCount: 1 });
    await expect(page.getByTestId("map-legend-photos")).toBeAttached();

    // Calibration is LIVE: the drift slider's End key = +5 minutes →
    // the photo re-matches at the 06:05:03 point, new coordinates.
    const slider = page.getByRole("slider", { name: /camera clock nudge/i });
    await slider.click();
    await page.keyboard.press("End");
    await expect(page.getByTestId("photos-drift-value")).toContainText("+5:00");
    await expect(page.getByTestId("photo-match")).toContainText(
      "-37.9469, 145.1002",
      { timeout: 10_000 },
    );

    // And the zone select re-matches the other way: UTC+00:00 strands
    // the photo outside the track's time — stated, never snapped.
    // (The zero option's label is the bare "UTC".)
    await page.getByTestId("photos-tz").click();
    await page.getByRole("option", { name: "UTC", exact: true }).click();
    await expect(page.getByTestId("photo-row").first()).toHaveAttribute(
      "data-status",
      "out-of-window",
      { timeout: 10_000 },
    );
    await expect(page.getByTestId("photo-row").first()).toContainText(
      /Outside the track's time/i,
    );
    // Off is off: no pin, no legend row.
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.__gpxMapController!.getTestState()))
            .photoPins.pinCount,
      )
      .toBe(0);
    await expect(page.getByTestId("map-legend-photos")).toBeHidden();
  });

  test("the batch ZIP: tagged bytes out, GPS read back exactly, the manifest honest", async ({
    page,
  }) => {
    await loadRideTcx(page);
    const withClock = buildSyntheticJpeg({
      exif: { dateTimeOriginal: "2024:05:01 16:00:03" },
    });
    const noClock = buildSyntheticJpeg({ exif: { make: "Testcam" } });
    await addPhotos(page, [
      { name: "IMG_0001.jpg", bytes: withClock },
      { name: "IMG_0002.jpg", bytes: noClock },
    ]);
    await setMelbourneZone(page);
    await expect(page.getByTestId("photo-row").first()).toHaveAttribute(
      "data-status",
      "matched",
    );

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("photos-zip-button").click(),
    ]);
    expect(download.suggestedFilename()).toBe("ride.photos.zip");
    const zipPath = await download.path();
    expect(zipPath).not.toBeNull();
    const { readFileSync } = await import("node:fs");
    const zip = unzipSync(readFileSync(zipPath!));
    expect(Object.keys(zip).sort()).toEqual([
      "IMG_0001.geotagged.jpg",
      "IMG_0002.jpg",
      "MANIFEST.txt",
    ]);

    // The tagged entry's GPS — the fixture's second point, exactly
    // (06:00:03 UTC on the fix's own clock).
    const gps = readGps(zip["IMG_0001.geotagged.jpg"]!)!;
    expect(gps).not.toBeNull();
    expect(gps.lat).toBeCloseTo(-37.949555, 5);
    expect(gps.lon).toBeCloseTo(145.100027, 5);
    expect(gps.timeMs).toBe(Date.UTC(2024, 4, 1, 6, 0, 3));

    // The manifest: the calibration stated, both photos narrated, the
    // two promises in the footer.
    const manifest = new TextDecoder().decode(zip["MANIFEST.txt"]!);
    expect(manifest).toContain("camera clock set to UTC+10:00");
    expect(manifest).toContain("camera clock: 2024:05:01 16:00:03");
    expect(manifest).toContain("camera clock: no timestamp in EXIF");
    expect(manifest).toContain("no timestamp to match — copied unchanged");
    expect(manifest).toContain("1 of 2 photos geotagged");
    expect(manifest).toContain(
      "no photo was uploaded anywhere, and no original file was modified",
    );
  });

  test("axe: zero critical violations on the photos card", async ({ page }) => {
    await loadRideTcx(page);
    await addPhotos(page, [
      {
        name: "IMG_0001.jpg",
        bytes: buildSyntheticJpeg({
          exif: { dateTimeOriginal: "2024:05:01 16:00:03" },
        }),
      },
      { name: "IMG_0003.heic", bytes: FIXTURE_MAGIC.heic() },
    ]);
    await setMelbourneZone(page);
    await expect(page.getByTestId("photo-row").first()).toHaveAttribute(
      "data-status",
      "matched",
    );
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(criticals(results), JSON.stringify(criticals(results))).toEqual([]);
  });
});
