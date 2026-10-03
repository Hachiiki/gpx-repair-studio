import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { enterRepairTool } from "./helpers/landing";
import { abortRoadRouting } from "./helpers/road-follow";

/**
 * Phase 16 E2E — track surgery & input freedom (§EE verification).
 *
 *   1. the surgery card lists the working segments and switches its
 *      four operations;
 *   2. a split previews, applies on Confirm only, lands in the shared
 *      change log (one undo step), and leaves the geometry untouched
 *      (a cut regroups, it never moves);
 *   3. a range deletion removes exactly the stretch, labels the
 *      working copy in the stats panel, and restores on undo;
 *   4. a duplicate lands in the export bytes (the copy's coordinates
 *      appear twice) with the metadata note disclosing it;
 *   5. a reorder changes the segment order — the list and the export
 *      agree;
 *   6. the map pick fills the form (pointer path);
 *   7. THE KEYBOARD-ONLY MILESTONE — a full gap repair completed with
 *      ZERO pointer events: upload, editor, two points typed by
 *      coordinates, one nudge, commit, export. The canvas is no
 *      longer the only way to draw (the v1-documented a11y gap,
 *      closed by §EE 16.2).
 *
 * No network: the fixtures trigger no routing (abort anyway).
 */

const FIXTURES = join("src", "features", "gpx", "fixtures", "files");
const MULTI_SEGMENT = join(FIXTURES, "multi-segment.gpx"); // 3 segments: 3+2+2 pts
const DEEP_DEFECTS = join(FIXTURES, "deep-defects.gpx"); // 1 segment, 45 pts
const TIME_GAP = join(FIXTURES, "time-gap.gpx"); // one gap, timed

async function upload(page: Page, file: string): Promise<void> {
  await page.goto("/");
  await enterRepairTool(page);
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("upload-zone").click();
  const fileChooser = await chooser;
  await fileChooser.setFiles(file);
  await page.getByTestId("surgery-card").waitFor({ state: "visible", timeout: 20_000 });
}

/** The details column's segment ids, in order. */
async function segmentIds(page: Page): Promise<string[]> {
  const list = page.getByTestId("segment-list");
  await expect(list).toBeVisible();
  return list.locator("[data-seg-id]").evaluateAll((rows) =>
    rows.map((row) => (row as HTMLElement).dataset.segId ?? ""),
  );
}

test.beforeEach(async ({ page }) => {
  await abortRoadRouting(page);
});

test.describe("the surgery card", () => {
  test("lists the working segments and switches operations", async ({ page }) => {
    await upload(page, MULTI_SEGMENT);
    expect(await segmentIds(page)).toEqual(["t0s0", "t0s1", "t0s2"]);

    const card = page.getByTestId("surgery-card");
    for (const id of ["split", "range", "duplicate", "reorder"]) {
      await expect(card.getByTestId(`surgery-tab-${id}`)).toBeVisible();
    }
    await expect(card.getByTestId("surgery-split-form")).toBeVisible();
    await card.getByTestId("surgery-tab-duplicate").click();
    await expect(card.getByTestId("surgery-duplicate-list")).toBeVisible();
    await expect(
      card.getByTestId("surgery-duplicate-button-t0s1"),
    ).toBeEnabled();
  });
});

test.describe("split", () => {
  test("previews, applies on Confirm, and undoes as one step", async ({ page }) => {
    await upload(page, MULTI_SEGMENT);
    const card = page.getByTestId("surgery-card");

    await card.getByTestId("surgery-split-segment").selectOption("t0s0");
    await card.getByTestId("surgery-split-number").fill("2");
    await expect(card.getByTestId("surgery-split-resolution")).toBeVisible();
    await card.getByTestId("surgery-split-apply").click();

    // The preview gate — nothing applied yet.
    const dialog = page.getByTestId("fix-preview-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("cut in two after point #2");
    expect(await segmentIds(page)).toEqual(["t0s0", "t0s1", "t0s2"]);

    await dialog.getByTestId("fix-preview-confirm").click();
    await expect(dialog).toBeHidden();

    // The cut: one more segment, the derived id follows the scheme.
    expect(await segmentIds(page)).toEqual(["t0s0", "t0s0~s1", "t0s1", "t0s2"]);
    // The stats panel labels the working copy.
    await expect(page.getByTestId("stats-working-note")).toContainText(
      "1 segment split",
    );

    // One undo step — the shared change log in the deep card.
    await page.getByTestId("deep-undo-last").click();
    expect(await segmentIds(page)).toEqual(["t0s0", "t0s1", "t0s2"]);
  });
});

test.describe("delete range", () => {
  test("removes exactly the stretch and restores on undo", async ({ page }) => {
    await upload(page, MULTI_SEGMENT);
    const card = page.getByTestId("surgery-card");

    await card.getByTestId("surgery-tab-range").click();
    await card.getByTestId("surgery-range-segment").selectOption("t0s0");
    await card.getByTestId("surgery-range-from").fill("1");
    await card.getByTestId("surgery-range-to").fill("2");
    await card.getByTestId("surgery-range-apply").click();

    const dialog = page.getByTestId("fix-preview-dialog");
    await expect(dialog).toContainText("2 points leave the working copy");
    await dialog.getByTestId("fix-preview-confirm").click();

    await expect(page.getByTestId("stats-working-note")).toContainText(
      "2 points removed",
    );
    // The segment keeps its place — with one survivor.
    const ids = await segmentIds(page);
    expect(ids).toEqual(["t0s0", "t0s1", "t0s2"]);
    await expect(page.getByTestId("segment-list")).toContainText(
      "1 point",
    );

    await page.getByTestId("deep-undo-last").click();
    await expect(page.getByTestId("segment-list")).toContainText(
      "3 points",
    );
  });
});

test.describe("duplicate", () => {
  test("lands in the export bytes with the note disclosing it", async ({ page }) => {
    await upload(page, MULTI_SEGMENT);
    const card = page.getByTestId("surgery-card");

    await card.getByTestId("surgery-tab-duplicate").click();
    await card.getByTestId("surgery-duplicate-button-t0s1").click();
    const dialog = page.getByTestId("fix-preview-dialog");
    await expect(dialog).toContainText("A copy of t0s1 (2 points)");
    await dialog.getByTestId("fix-preview-confirm").click();

    expect(await segmentIds(page)).toEqual([
      "t0s0",
      "t0s1",
      "t0s1~d1",
      "t0s2",
    ]);
    await expect(page.getByTestId("stats-working-note")).toContainText(
      "1 copy inserted",
    );

    // Export: the copy's coordinates appear twice, the note says so.
    await page.getByTestId("open-export-button").click();
    const exportDialog = page.getByTestId("export-dialog");
    await expect(exportDialog).toBeVisible();
    await expect(exportDialog.getByTestId("export-working-note")).toContainText(
      "1 copy inserted",
    );
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      exportDialog.getByTestId("export-download-button").click(),
    ]);
    const path = await download.path();
    if (path === null) throw new Error("download produced no file");
    const xml = readFileSync(path, "utf8");
    // t0s1's two points, present once in the source and once in the copy.
    expect(xml.match(/52\.520141/g)?.length).toBe(2);
    expect(xml.match(/52\.520186/g)?.length).toBe(2);
    expect(xml).toContain("1 segment copy was inserted");
  });
});

test.describe("reorder", () => {
  test("moves segments within the track — list and export agree", async ({ page }) => {
    await upload(page, MULTI_SEGMENT);
    const card = page.getByTestId("surgery-card");

    await card.getByTestId("surgery-tab-reorder").click();
    await card.getByTestId("surgery-reorder-start").click();
    // t0s0 down, twice → [t0s1, t0s2, t0s0].
    await card.getByTestId("surgery-reorder-down-t0s0").click();
    await card.getByTestId("surgery-reorder-down-t0s0").click();
    await card.getByTestId("surgery-reorder-apply").click();

    const dialog = page.getByTestId("fix-preview-dialog");
    await expect(dialog).toContainText("Reorder segments");
    await dialog.getByTestId("fix-preview-confirm").click();

    expect(await segmentIds(page)).toEqual(["t0s1", "t0s2", "t0s0"]);

    // The export keeps the new order (Mode A: the first <trkseg> is
    // t0s1's — its coordinates lead the track).
    await page.getByTestId("open-export-button").click();
    const exportDialog = page.getByTestId("export-dialog");
    await expect(exportDialog).toBeVisible();
    const [reorderDownload] = await Promise.all([
      page.waitForEvent("download"),
      exportDialog.getByTestId("export-download-button").click(),
    ]);
    const reorderPath = await reorderDownload.path();
    if (reorderPath === null) throw new Error("download produced no file");
    const reorderXml = readFileSync(reorderPath, "utf8");
    const firstSeg = reorderXml.slice(
      reorderXml.indexOf("<trkseg>"),
      reorderXml.indexOf("</trkseg>"),
    );
    expect(firstSeg).toContain("52.520141"); // t0s1's first point leads
    expect(firstSeg).not.toContain("52.520006"); // t0s0 no longer first
    expect(reorderXml).toContain("segments were rearranged manually");
  });
});

test.describe("the map pick (pointer path)", () => {
  test("a click on a recorded point fills the split form", async ({ page }) => {
    await upload(page, MULTI_SEGMENT);
    const card = page.getByTestId("surgery-card");

    await card.getByTestId("surgery-split-pick").click();
    await expect(card.getByTestId("surgery-pick-status")).toBeVisible();

    // Click on t0s0's second point (52.520051, 13.405024).
    const box = await page.locator(".maplibregl-canvas").boundingBox();
    const projected = await page.evaluate(() => {
      const c = window.__gpxMapController!;
      return c.projectLatLon(52.520051, 13.405024);
    });
    await page.mouse.click(box!.x + projected.x, box!.y + projected.y);

    await expect(card.getByTestId("surgery-split-number")).toHaveValue("2");
    await expect(card.getByTestId("surgery-split-resolution")).toBeVisible();
    await expect(card.getByTestId("surgery-pick-status")).toBeHidden();
  });
});

test.describe("the keyboard-only milestone (zero pointer events)", () => {
  /**
   * The whole repair runs without a single pointer event — the §EE 16.2
   * milestone that closes the v1-documented limitation ("the canvas is
   * the one mouse surface"). Every interaction is Tab / Enter / typing
   * on a form control; the assertions ride the page's own state.
   */
  test("a full gap repair completed with zero pointer events", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/");
    await page
      .getByTestId("landing-mode-repair")
      .waitFor({ state: "visible" });

    // Landing → the repair tool card (keyboard).
    await tabUntil(page, `el.dataset.testid === "landing-mode-repair"`);
    await page.keyboard.press("Enter");
    await page.getByTestId("upload-zone").waitFor({ state: "visible" });

    // Upload — the visually-hidden file input keeps its tab stop.
    await tabUntil(page, `el.tagName === "INPUT" && el.getAttribute("type") === "file"`);
    const chooser = page.waitForEvent("filechooser");
    await page.keyboard.press("Enter");
    await (await chooser).setFiles(TIME_GAP);
    await page.getByTestId("gap-list").waitFor({ state: "visible" });

    // Open the draw editor from the gap list.
    await tabUntil(page, `el.dataset.testid === "open-editor-button"`);
    await page.keyboard.press("Enter");
    await page.getByTestId("draw-editor-panel").waitFor({ state: "visible" });

    // THE NEW PART — add two points by typing coordinates.
    const addLat = page.getByTestId("vertex-add-form-lat");
    const addLon = page.getByTestId("vertex-add-form-lon");
    await addLat.focus();
    await page.keyboard.type("52.5199");
    await addLon.focus();
    await page.keyboard.type("13.4044");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("vertex-row")).toHaveCount(1);

    await addLat.focus();
    await page.keyboard.type("52.5202");
    await addLon.focus();
    await page.keyboard.type("13.4049");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("vertex-row")).toHaveCount(2);

    // Nudge the first point north by one step — the handle + arrow.
    // (Tab reaches the first row's handle.)
    await tabUntil(page, `el.dataset.testid === "vertex-nudge-handle"`);
    await page.keyboard.press("ArrowUp");
    await expect(
      page.getByTestId("vertex-row").nth(0).getByTestId("vertex-lat-input"),
    ).not.toHaveValue("52.5199");

    // Edit the second point by typing (the row inputs commit on Enter).
    const secondLat = page
      .getByTestId("vertex-row")
      .nth(1)
      .getByTestId("vertex-lat-input");
    await secondLat.focus();
    await page.keyboard.press("End");
    await page.keyboard.type("1");
    await page.keyboard.press("Enter");

    // Commit the repair and export — keyboard all the way.
    await tabUntil(page, `el.dataset.testid === "done-editing-button"`);
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("draw-editor-panel")).toBeHidden();

    await tabUntil(page, `el.dataset.testid === "open-export-button"`);
    await page.keyboard.press("Enter");
    const dialog = page.getByTestId("export-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("2");

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      tabUntil(
        page,
        `el.dataset.testid === "export-download-button"`,
      ).then(() => page.keyboard.press("Enter")),
    ]);
    const path = await download.path();
    if (path === null) throw new Error("download produced no file");
    const xml = readFileSync(path, "utf8");

    // The typed geometry is in the file, labeled as reconstructed.
    expect(xml).toContain("52.5199");
    expect(xml).toContain("13.4044");
    expect(xml).toContain("52.5202");
    expect(xml).toContain("13.4049");
    expect(xml).toContain("gpxr:reconstructed");
  });
});

/**
 * Press Tab until the focused element satisfies `isMatch` (a string
 * evaluated in the page with `el` = document.activeElement) — the
 * keyboard spec's helper, copied for this spec's zero-pointer rule.
 */
async function tabUntil(page: Page, isMatch: string, max = 80): Promise<void> {
  for (let i = 0; i < max; i += 1) {
    const matched = await page.evaluate(
      (code) => {
        const el = document.activeElement;
        return el ? Boolean(new Function("el", `return (${code});`)(el)) : false;
      },
      isMatch,
    );
    if (matched) return;
    await page.keyboard.press("Tab");
  }
  throw new Error(`keyboard target not reachable within ${max} tabs: ${isMatch}`);
}
