import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Task 20 E2E — the Strava-style share card (layout per Task 23):
 *
 *   1. the full happy path: landing mode toggle → upload → the share
 *      view (stage + canvas + honest trio) → download → assert the
 *      PNG itself: signature, IHDR 1080×1920, and decoded pixels —
 *      the solid-black background dominating, with the orange route
 *      and white artwork actually painted (the file is the contract,
 *      like Phase 7);
 *   2. honesty: a no-timestamp file renders "—" pace/time with the
 *      explanation, and still downloads;
 *   3. the view bridge: share → repair workspace → the map comes
 *      ALIVE (controller re-created — the lifecycle fix) → back to
 *      share via the header action.
 */

const FIXTURES = join("src", "features", "gpx", "fixtures", "files");

async function upload(page: Page, path: string) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("upload-zone").click();
  const fileChooser = await chooser;
  await fileChooser.setFiles(path);
}

interface BridgeState {
  status: string;
  ready: boolean;
}

async function mapReady(page: Page): Promise<boolean> {
  try {
    const state = (await page.evaluate(() =>
      window.__gpxMapController
        ? (window.__gpxMapController.getTestState() as unknown as BridgeState)
        : null,
    )) as BridgeState | null;
    return state?.ready === true;
  } catch {
    return false;
  }
}

interface PngAnalysis {
  width: number;
  height: number;
  transparent: number;
  orange: number;
  white: number;
  dark: number;
  total: number;
}

/** Decode the downloaded PNG in-page and classify its pixels. */
async function analyzePng(page: Page, bytes: Buffer): Promise<PngAnalysis> {
  return page.evaluate(async (base64) => {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("PNG decode failed"));
      img.src = `data:image/png;base64,${base64}`;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let transparent = 0;
    let orange = 0;
    let white = 0;
    let dark = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a === 0) transparent += 1;
      // #FC4C02 with antialiasing tolerance.
      if (a > 200 && r > 220 && g > 30 && g < 130 && b < 60) orange += 1;
      if (a > 200 && r > 230 && g > 230 && b > 230) white += 1;
      // Opaque near-black: the card's #000000 background (Task 23).
      if (a > 200 && r < 40 && g < 40 && b < 40) dark += 1;
    }
    return {
      width: img.width,
      height: img.height,
      transparent,
      orange,
      white,
      dark,
      total: canvas.width * canvas.height,
    };
  }, bytes.toString("base64"));
}

test.describe("share card (Task 20)", () => {
  test("happy path: toggle → upload → honest trio → PNG pixels", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTestId("landing-mode-share").click();
    // The hero teaches the share flow once the mode flips.
    await expect
      .poll(() =>
        page
          .getByRole("heading", { level: 2 })
          .filter({ hasText: "Create a share card" })
          .count(),
      )
      .toBe(1);

    await upload(page, join(FIXTURES, "time-gap.gpx"));
    await expect(page.getByTestId("share-section")).toBeVisible();
    await expect(page.getByTestId("share-card-canvas")).toBeVisible();

    // The honest trio, golden values from the fixture's real stats.
    await expect(page.getByTestId("share-summary-distance")).toHaveText(
      "48 m",
    );
    await expect(page.getByTestId("share-summary-pace")).toHaveText(
      "6:12 /km",
    );
    await expect(page.getByTestId("share-summary-time")).toHaveText("5m 18s");

    // Download and assert the file itself.
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("share-download").click(),
    ]);
    expect(download.suggestedFilename()).toBe("time-gap.share-card.png");

    const bytes = readFileSync(await download.path());
    // PNG signature.
    expect([...bytes.subarray(0, 8)]).toEqual([
      137, 80, 78, 71, 13, 10, 26, 10,
    ]);
    // IHDR: 1080×1920, big-endian.
    expect(bytes.readUInt32BE(16)).toBe(1080);
    expect(bytes.readUInt32BE(20)).toBe(1920);

    const analysis = await analyzePng(page, bytes);
    expect(analysis.width).toBe(1080);
    expect(analysis.height).toBe(1920);
    // Task 23: the card is fully opaque — solid #000000 background.
    expect(analysis.transparent).toBe(0);
    expect(analysis.dark / analysis.total).toBeGreaterThan(0.5);
    // The route line is really there, in the spec's orange.
    expect(analysis.orange).toBeGreaterThan(200);
    // The wordmark / stats / icon are painted white.
    expect(analysis.white).toBeGreaterThan(300);
  });

  test("the 2× export doubles the backing resolution", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("landing-mode-share").click();
    await upload(page, join(FIXTURES, "time-gap.gpx"));
    await expect(page.getByTestId("share-section")).toBeVisible();

    await page.getByTestId("share-scale-2x").click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("share-download").click(),
    ]);
    const bytes = readFileSync(await download.path());
    expect(bytes.readUInt32BE(16)).toBe(2160);
    expect(bytes.readUInt32BE(20)).toBe(3840);
  });

  test("honesty: no timestamps → “—” pace and time with the reason", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTestId("landing-mode-share").click();
    await upload(page, join(FIXTURES, "no-time.gpx"));
    await expect(page.getByTestId("share-section")).toBeVisible();

    await expect(page.getByTestId("share-summary-distance")).toHaveText(
      "14 m",
    );
    await expect(page.getByTestId("share-summary-pace")).toHaveText("—");
    await expect(page.getByTestId("share-summary-time")).toHaveText("—");
    await expect(page.getByTestId("share-section")).toContainText(
      "no usable timestamps",
    );

    // A distance-only card is still a valid share graphic.
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("share-download").click(),
    ]);
    const bytes = readFileSync(await download.path());
    expect(bytes.readUInt32BE(16)).toBe(1080);
  });

  test("the unit toggle converts the trio and the card follows", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTestId("landing-mode-share").click();
    await upload(page, join(FIXTURES, "time-gap.gpx"));
    await expect(page.getByTestId("share-section")).toBeVisible();

    await page.getByTestId("pace-unit-mi").click();
    await expect(page.getByTestId("share-summary-distance")).toHaveText(
      "0.03 mi",
    );
    await expect(page.getByTestId("share-summary-pace")).toHaveText(
      "9:59 /mi",
    );
  });

  test("view bridge: share → repair (map alive) → back via the header", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTestId("landing-mode-share").click();
    await upload(page, join(FIXTURES, "time-gap.gpx"));
    await expect(page.getByTestId("share-section")).toBeVisible();

    // Into the repair workspace — the same file, no re-parse.
    await page.getByTestId("share-open-repair").click();
    await expect(page.getByTestId("repair-section")).toBeVisible();

    // The map controller must have been re-created and gone ready —
    // the lifecycle fix (a dead map after a view switch is the bug).
    await expect
      .poll(() => mapReady(page), { timeout: 15_000 })
      .toBe(true);

    // And back to the card from the header.
    await page.getByTestId("header-share-link").click();
    await expect(page.getByTestId("share-section")).toBeVisible();
    await expect(page.getByTestId("share-summary-distance")).toHaveText(
      "48 m",
    );
  });

  test("the repair landing default is unchanged (regression)", async ({
    page,
  }) => {
    await page.goto("/");
    // Default mode: the repair hero, the repair trio — existing tests'
    // contract.
    await expect
      .poll(() =>
        page
          .getByRole("heading", { level: 2 })
          .filter({ hasText: "Repair incomplete GPS recordings" })
          .count(),
      )
      .toBe(1);
    await expect(page.getByTestId("landing-mode-repair")).toHaveAttribute(
      "aria-checked",
      "true",
    );

    // A normal upload still opens the repair workspace.
    await upload(page, join(FIXTURES, "time-gap.gpx"));
    await expect(page.getByTestId("repair-section")).toBeVisible();
    await expect(page.getByTestId("share-section")).toHaveCount(0);
  });
});
