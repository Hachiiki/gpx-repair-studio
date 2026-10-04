import { expect, test, type Page } from "@playwright/test";
import { join } from "node:path";
import { enterRepairTool } from "./helpers/landing";

/**
 * ScrollArea clamp regression — the repair-studio overlap a user hit:
 * with more than one detected gap, the gap rows painted PAST their
 * ScrollArea and over the Export card below (and the same latent bug
 * sat in every ScrollArea whose parent chain is a plain block —
 * CardContent, not a grid that stretches the root to a definite
 * height).
 *
 * Root cause: the Radix viewport's `height: 100%` only resolves when
 * the Root has a definite height; under a `max-h-*`-only Root inside a
 * block parent it computes to `auto`, so the viewport grew to full
 * content height and the Root (overflow visible) let it paint through.
 * The shared component now carries `max-h-[inherit]` on the viewport,
 * so it clamps itself to the Root's max-height whatever the ancestor
 * layout is.
 *
 * These specs pin BOTH properties that must hold at once:
 *   - clamped: the viewport never exceeds its Root's box (nothing
 *     paints outside the list);
 *   - reachable: when content is taller than the clamp the viewport
 *     scrolls internally (scrollHeight > clientHeight) — a clamp that
 *     merely clipped away rows would be a worse bug than the overlap.
 */

const FIXTURES = join("src", "features", "gpx", "fixtures", "files");

async function upload(page: Page, file: string): Promise<void> {
  await page.goto("/");
  await enterRepairTool(page);
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("upload-zone").click();
  const fileChooser = await chooser;
  await fileChooser.setFiles(join(FIXTURES, file));
}

interface ListGeometry {
  rootBottom: number;
  viewportClientHeight: number;
  viewportScrollHeight: number;
  exportTop: number | null;
  exportHitInsideGapList: boolean | null;
}

async function gapListGeometry(page: Page): Promise<ListGeometry> {
  return page.evaluate(() => {
    const list = document.querySelector('[data-testid="gap-list"]');
    const root = list?.querySelector("[data-slot='scroll-area']");
    const viewport = list?.querySelector("[data-slot='scroll-area-viewport']");
    if (!root || !viewport) throw new Error("gap list scroll area missing");

    // The Export card is the next card in the tools column — probe just
    // inside its top edge and ask what actually paints there. Rects of
    // clipped (scrolled-out) content always extend below the viewport;
    // the hit test is what proves nothing paints over the neighbor.
    const exportCard = document.querySelector('[data-testid="export-card"]');
    let exportTop: number | null = null;
    let exportHitInsideGapList: boolean | null = null;
    if (exportCard) {
      const rect = exportCard.getBoundingClientRect();
      exportTop = rect.top;
      const hit = document.elementFromPoint(
        Math.round(rect.left + rect.width / 2),
        Math.round(rect.top + 8),
      );
      exportHitInsideGapList = hit
        ? hit.closest('[data-testid="gap-list"]') !== null
        : null;
    }

    return {
      rootBottom: root.getBoundingClientRect().bottom,
      viewportClientHeight: viewport.clientHeight,
      viewportScrollHeight: viewport.scrollHeight,
      exportTop,
      exportHitInsideGapList,
    };
  });
}

test("scroll clamp: multiple gap rows stay inside the list, never over the export card", async ({
  page,
}) => {
  await upload(page, "four-time-gaps.gpx");
  await page.getByTestId("gap-list").waitFor({ timeout: 20_000 });
  await expect(page.getByTestId("gap-row")).toHaveCount(4);

  // The Export card lives far down the tools column — bring it into
  // the viewport so the hit-test probe (elementFromPoint only answers
  // for on-screen points) can ask what actually paints on it.
  await page.getByTestId("export-card").scrollIntoViewIfNeeded();

  const geometry = await gapListGeometry(page);

  // Clamped: the viewport is the Root's only in-flow child, so a
  // self-clamping viewport keeps the Root's box equal to it. If the
  // clamp ever regresses, the viewport (806 px of rows here) dwarfs
  // the 384 px Root.
  expect(geometry.viewportClientHeight).toBeLessThanOrEqual(385);
  expect(geometry.viewportScrollHeight).toBeGreaterThan(
    geometry.viewportClientHeight,
  );

  // The four rows are taller than the clamp, so the list MUST scroll —
  // content stays reachable, not clipped away.
  expect(geometry.viewportScrollHeight).toBeGreaterThan(384);

  // Nothing from the gap list paints over the Export card below it.
  expect(geometry.exportTop).not.toBeNull();
  expect(geometry.rootBottom).toBeLessThanOrEqual(
    (geometry.exportTop as number) + 0.5,
  );
  expect(geometry.exportHitInsideGapList).toBe(false);
});

test("scroll clamp: every clamped ScrollArea in the workspace keeps its viewport inside its root", async ({
  page,
}) => {
  // The generic invariant on a file that populates every tools column
  // list at once: deep validation issues (grid parent — already worked
  // before the fix), and the details column's validation report and
  // segment list (plain CardContent — the same latent bug class the
  // gap list had). One sweep asserts the fix for the whole family.
  await upload(page, "deep-defects.gpx");
  await page.getByTestId("deep-validation-card").waitFor({
    timeout: 20_000,
  });
  await page.getByTestId("details-section").waitFor();
  await expect(page.getByTestId("deep-issue-row").first()).toBeVisible();

  const offenders = await page.evaluate(() => {
    const bad: string[] = [];
    for (const root of document.querySelectorAll(
      "[data-slot='scroll-area']",
    )) {
      const viewport = root.querySelector("[data-slot='scroll-area-viewport']");
      if (!viewport) continue;
      // The viewport may never be taller than the Root's padding box
      // (clientHeight). An unclamped viewport under a max-h Root is
      // exactly the overlap bug.
      if (viewport.clientHeight > root.clientHeight + 1) {
        bad.push(
          root.closest("[data-testid]")?.getAttribute("data-testid") ??
            root.className.slice(0, 60),
        );
      }
    }
    return bad;
  });
  expect(offenders).toEqual([]);

  // And the deep issue list itself stays reachable: six issue rows
  // under the 22rem clamp must scroll, not clip.
  const deepGeometry = await page.evaluate(() => {
    const card = document.querySelector(
      '[data-testid="deep-validation-card"]',
    );
    const viewport = card?.querySelector(
      "[data-slot='scroll-area-viewport']",
    ) as HTMLElement | null;
    if (!viewport) throw new Error("deep viewport missing");
    return {
      clientHeight: viewport.clientHeight,
      scrollHeight: viewport.scrollHeight,
    };
  });
  expect(deepGeometry.clientHeight).toBeLessThanOrEqual(353);
  expect(deepGeometry.scrollHeight).toBeGreaterThan(
    deepGeometry.clientHeight,
  );
});
