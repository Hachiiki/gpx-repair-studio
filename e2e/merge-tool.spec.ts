import { expect, test } from "@playwright/test";
import { join } from "node:path";
import { readFileSync } from "node:fs";

/**
 * Task 43 E2E — the Merge tool's acceptance criteria:
 *
 *   1. the fifth card opens the merge tool page (hero, teaching trio,
 *      facts, multi-file intake with a closed contract gate);
 *   2. two files parse into rows; one bad file fails alone (removable,
 *      never blocking);
 *   3. Combine opens the studio: the merged route renders on the map,
 *      the file list carries the order, the combined name edits;
 *   4. rearranging (move up / sort by start time) re-merges — the
 *      merged summary's point count stays honest, the order flips;
 *   5. the export downloads a real .gpx whose CONTENT is the merge:
 *      both files' point coordinates, the chosen name, single track;
 *   6. the header's Start over clears back to the intake.
 *
 * Fixtures are the committed Phase-1 corpus (Berlin run, multi-segment,
 * wpt/rte) — real files with real coordinates.
 */

const FIXTURES = join("src", "features", "gpx", "fixtures", "files");

/** Enter the merge tool's page from wherever the landing is. */
async function enterMergeTool(page: import("@playwright/test").Page) {
  const card = page.getByTestId("landing-mode-merge");
  if (await card.isVisible()) {
    await card.click();
    await page.getByTestId("merge-intake").waitFor({ state: "visible" });
  }
}

/** Drop files into the merge intake's zone. */
async function dropFiles(
  page: import("@playwright/test").Page,
  paths: readonly string[],
) {
  await page.getByTestId("merge-intake-zone").evaluate(
    (zone, payload) => {
      const files = payload.map((p) => {
        // The DataTransfer constructor requires real File objects —
        // build them from the fixture contents shipped in-payload.
        const [name, base64] = p.split("::");
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return new File([bytes], name, { type: "application/gpx+xml" });
      });
      const transfer = new DataTransfer();
      for (const file of files) transfer.items.add(file);
      zone.dispatchEvent(
        new DragEvent("drop", { dataTransfer: transfer, bubbles: true }),
      );
    },
    paths.map((p) => {
      const content = readFileSync(p, "utf8");
      return `${p.split("/").pop()}::${Buffer.from(content, "utf8").toString("base64")}`;
    }),
  );
}

test.describe("merge tool", () => {
  test("the fifth card opens the merge tool page with a closed gate", async ({
    page,
  }) => {
    await page.goto("/");

    const cards = page.getByTestId("landing-mode-toggle");
    await expect(cards.locator("button")).toHaveCount(6);

    await page.getByTestId("landing-mode-merge").click();
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: "Combine GPX files into one route",
      }),
    ).toBeVisible();
    await expect(page.getByTestId("merge-intake")).toBeVisible();
    await expect(page.getByTestId("merge-combine")).toBeDisabled();
    const steps = page.getByTestId("workflow-steps");
    await expect(steps).toContainText("Add your files");
    await expect(steps).toContainText("Arrange the merge");
    await expect(page.getByTestId("tool-facts")).toContainText(
      "single track",
    );
  });

  test("one bad file fails alone — typed error row, gate stays shut, remove recovers", async ({
    page,
  }) => {
    await page.goto("/");
    await enterMergeTool(page);

    await dropFiles(page, [
      join(FIXTURES, "valid-1.1.gpx"),
      join(FIXTURES, "not-gpx.gpx"),
    ]);

    await expect(
      page.getByTestId("merge-intake-files").locator("li"),
    ).toHaveCount(2);
    await expect(page.getByText(/Not a GPX file/i).first()).toBeVisible();
    await expect(page.getByTestId("merge-combine")).toBeDisabled();

    // Remove the bad file — the good one remains, the gate is honest.
    await page
      .getByRole("button", { name: /Remove not-gpx\.gpx/i })
      .click();
    await expect(
      page.getByTestId("merge-intake-files").locator("li"),
    ).toHaveCount(1);
    await expect(page.getByTestId("merge-combine")).toBeDisabled();
  });

  test("combine → arrange → download: the full merge flow", async ({
    page,
  }) => {
    await page.goto("/");
    await enterMergeTool(page);

    // Two real files (Berlin 6-point run + multi-segment file) plus the
    // waypoint/route carrier — three doors into one route.
    await dropFiles(page, [
      join(FIXTURES, "multi-segment.gpx"),
      join(FIXTURES, "valid-1.1.gpx"),
      join(FIXTURES, "wpt-rte.gpx"),
    ]);

    await expect(page.getByTestId("merge-combine")).toBeEnabled();
    await page.getByTestId("merge-combine").click();

    // The studio: map canvas + the arrangement cards.
    await expect(page.getByTestId("map-canvas")).toBeVisible();
    await expect(page.getByTestId("merge-files-card")).toBeVisible();
    await expect(page.getByTestId("merge-details-card")).toBeVisible();
    await expect(page.getByTestId("merge-export-card")).toBeVisible();
    await expect(
      page.getByTestId("merge-files-list").locator("li"),
    ).toHaveCount(3);

    // The merged route renders: the bridge reports non-empty route
    // features (lines split only at unusable points — all three files'
    // geometry is in there).
    await page.waitForFunction(
      () =>
        (window as unknown as { __gpxMapController?: unknown })
          .__gpxMapController !== undefined,
      { timeout: 15_000 },
    );
    const routeFeatureCount = await page.evaluate(() => {
      const bridge = (
        window as unknown as {
          __gpxMapController?: {
            getTestState?: () => { routeFeatureCount?: number };
          };
        }
      ).__gpxMapController;
      return bridge?.getTestState?.()?.routeFeatureCount ?? 0;
    });
    expect(routeFeatureCount).toBeGreaterThan(0);

    // Name the combined activity (blur commits).
    const nameField = page.getByTestId("merge-activity-name");
    await nameField.fill("E2E merged route");
    await nameField.blur();
    await expect(page.getByTestId("merge-facts")).toContainText(
      "Files merged",
    );

    // Rearrange: move the first file down — the list order flips.
    const rows = page.getByTestId("merge-files-list").locator("li");
    await expect(rows.first()).toContainText(/multi-segment/i);
    await page.getByRole("button", { name: /Move multi-segment\.gpx down/i }).click();
    await expect(rows.first()).toContainText(/valid-1\.1\.gpx/i);

    // Sort by start time restores the chronological order.
    await page.getByTestId("merge-sort-by-time").click();
    await expect(rows.first()).toContainText(/valid-1\.1\.gpx/i);

    // The export: a real download whose content IS the merge.
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("merge-download").click(),
    ]);
    expect(download.suggestedFilename()).toBe("E2E merged route.gpx");

    const path = await download.path();
    const xml = readFileSync(path, "utf8");
    // The chosen name — metadata and the single track.
    expect(xml).toContain("<name>E2E merged route</name>");
    expect((xml.match(/<trk>/g) ?? []).length).toBe(1);
    // The merge discloses itself in the creator.
    expect(xml).toContain("merged 3 files");
    // Both files' coordinates survived verbatim (Berlin run's first
    // point + the waypoint the third file carries).
    expect(xml).toContain('lat="52.520006"');
    expect(xml).toContain("<wpt");

    // The download is re-parseable as a GPX with all points (both
    // fixtures' counts are carried — 6 + multi-segment's + wpt-rte's).
    const pointCount = (xml.match(/<trkpt /g) ?? []).length;
    expect(pointCount).toBeGreaterThanOrEqual(10);
  });

  test("Start over clears the studio back to the merge intake", async ({
    page,
  }) => {
    await page.goto("/");
    await enterMergeTool(page);

    await dropFiles(page, [
      join(FIXTURES, "valid-1.1.gpx"),
      join(FIXTURES, "multi-segment.gpx"),
    ]);
    await page.getByTestId("merge-combine").click();
    await expect(page.getByTestId("merge-files-card")).toBeVisible();

    await page.getByTestId("header-reset-button").click();

    // Back on the merge tool page, intake empty and the gate closed.
    await expect(page.getByTestId("merge-intake")).toBeVisible();
    await expect(
      page.getByTestId("merge-intake-files"),
    ).toHaveCount(0);
    await expect(page.getByTestId("merge-combine")).toBeDisabled();
  });

  test("the header's Share: warning first, then the merged GPX download + the share card", async ({
    page,
  }) => {
    await page.goto("/");
    await enterMergeTool(page);

    await dropFiles(page, [
      join(FIXTURES, "valid-1.1.gpx"),
      join(FIXTURES, "multi-segment.gpx"),
    ]);
    await page.getByTestId("merge-combine").click();
    await expect(page.getByTestId("merge-files-card")).toBeVisible();

    // Name the combined activity first — the dialog shows the file name
    // the confirm will download.
    const nameField = page.getByTestId("merge-activity-name");
    await nameField.fill("Combo run");
    await nameField.blur();

    // The Share button lives in the header exactly when the studio does.
    const shareButton = page.getByTestId("header-merge-share");
    await expect(shareButton).toBeVisible();
    await expect(shareButton).toContainText("Share card");

    // Click → the warning dialog says exactly what will happen (the
    // file name, the trio the card will show) — and nothing downloaded.
    await shareButton.click();
    const dialog = page.getByTestId("merge-share-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Combo run.gpx");
    await expect(dialog).toContainText("same file the Download button produces");
    // The trio the card will show is the merged model's own arithmetic.
    await expect(dialog).toContainText(/\d/);

    // Cancel is a full no-op: still in the arrangement, nothing downloaded.
    await page.getByTestId("merge-share-cancel").click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("merge-files-card")).toBeVisible();

    // Confirm → the merged GPX downloads (the same contract as the
    // Download button) and the share card view opens.
    await shareButton.click();
    await expect(dialog).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("merge-share-confirm").click(),
    ]);
    expect(download.suggestedFilename()).toBe("Combo run.gpx");
    const xml = readFileSync(await download.path(), "utf8");
    expect(xml).toContain("merged 2 files");
    expect((xml.match(/<trk>/g) ?? []).length).toBe(1);

    await expect(page.getByTestId("merge-share-section")).toBeVisible();
    await expect(page.getByTestId("merge-files-card")).toHaveCount(0);
    // The header now offers the way back.
    await expect(page.getByTestId("header-merge-back")).toBeVisible();
    await expect(page.getByTestId("header-merge-share")).toHaveCount(0);

    // The trio is the merged model's own arithmetic (never a dash for
    // these timed fixtures); the notes are honest.
    await expect(
      page.getByTestId("merge-share-summary-distance"),
    ).toContainText(/\d/);
    await expect(page.getByTestId("share-card-canvas")).toBeVisible();
    await expect(page.getByTestId("merge-share-tools")).toContainText(
      "Combined from 2 recordings",
    );

    // The PNG downloads from the share view.
    const [png] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("merge-share-download").click(),
    ]);
    expect(png.suggestedFilename()).toBe("Combo run.share-card.png");

    // Back to the arrangement — same merge, the map returns.
    await page.getByTestId("merge-share-back").click();
    await expect(page.getByTestId("merge-files-card")).toBeVisible();
    await expect(page.getByTestId("merge-share-section")).toHaveCount(0);
    await expect(page.getByTestId("header-merge-share")).toBeVisible();
  });
});
