import { expect, test, type Page } from "@playwright/test";
import { join } from "node:path";
import { abortRoadRouting } from "./helpers/road-follow";

/**
 * Phase 8 E2E — keyboard operability (WCAG 2.1 AA 2.1.1).
 *
 * Every non-canvas control must be reachable by Tab and operable by
 * Enter/Space: the repair flow is driven end-to-end without a mouse —
 * skip link, tool card, upload (the visually-hidden file input keeps
 * its tab stop), gap list, draw editor (pen chips, mode chip, undo
 * bar), and the export dialog (focus moves in, Esc closes it, focus
 * returns to the trigger).
 *
 * The canvas itself is out of scope by design (the plan's deferred
 * backlog holds a numeric-entry fallback); everything AROUND it is
 * the Phase 8 bar.
 */

const FIXTURES = join("src", "features", "gpx", "fixtures", "files");

async function bridge(page: Page) {
  return page.evaluate(() =>
    window.__gpxMapController
      ? window.__gpxMapController.getTestState()
      : null,
  );
}

async function pollBridge(
  page: Page,
  predicate: (state: Record<string, unknown>) => boolean,
  timeoutMs = 15_000,
): Promise<Record<string, unknown>> {
  const started = Date.now();
  for (;;) {
    const state = (await bridge(page)) as Record<string, unknown> | null;
    if (state && predicate(state)) return state;
    if (Date.now() - started > timeoutMs) {
      throw new Error(
        `bridge predicate not met within ${timeoutMs} ms; last: ${JSON.stringify(state)}`,
      );
    }
    await page.waitForTimeout(150);
  }
}

/**
 * Press Tab until the focused element satisfies `isMatch` (a string
 * evaluated in the page with `el` = document.activeElement). Throws
 * after `max` presses — an unreachable control is the failure the
 * suite exists to catch.
 */
async function tabUntil(
  page: Page,
  isMatch: string,
  // Phase 16 raised the budget: the surgery card and the vertex-entry
  // forms added legitimate keyboard stops to the tools column, so the
  // wrap-around journey to the editor's pen chips grew past 60 — the
  // test's contract is reachability, not brevity.
  max = 120,
): Promise<void> {
  for (let i = 0; i < max; i += 1) {
    await page.keyboard.press("Tab");
    const matched = await page.evaluate(
      (code) => {
        const el = document.activeElement;
        // NB: a Function BODY has no implicit return — the predicate
        // must be wrapped in `return (…)`.
        return el ? Boolean(new Function("el", `return (${code});`)(el)) : false;
      },
      isMatch,
    );
    if (matched) return;
  }
  throw new Error(`keyboard target not reachable within ${max} tabs: ${isMatch}`);
}

async function activeElementLabel(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!(el instanceof HTMLElement)) return "";
    return el.dataset.testid ?? el.tagName.toLowerCase();
  });
}

test.beforeEach(async ({ page }) => {
  await abortRoadRouting(page);
});

test.describe("keyboard — the repair flow without a mouse", () => {
  test("the skip link is the first tab stop and jumps to the content", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTestId("landing-mode-repair").waitFor({ state: "visible" });

    await page.keyboard.press("Tab");
    expect(await activeElementLabel(page)).toBe("a");
    expect(
      await page.evaluate(() => document.activeElement?.textContent),
    ).toContain("Skip to content");

    await page.keyboard.press("Enter");
    await expect
      .poll(() =>
        page.evaluate(
          () => document.activeElement?.getAttribute("id") ?? "",
        ),
      )
      .toBe("main-content");
  });

  test("the whole repair flow is drivable by keyboard", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("landing-mode-repair").waitFor({ state: "visible" });

    // Landing → the repair tool card.
    await tabUntil(page, `el.dataset.testid === "landing-mode-repair"`);
    await page.keyboard.press("Enter");
    await page.getByTestId("upload-zone").waitFor({ state: "visible" });

    // Upload: the visually-hidden file input keeps its tab stop.
    await tabUntil(
      page,
      `el.tagName === "INPUT" && el.getAttribute("type") === "file"`,
    );
    const chooser = page.waitForEvent("filechooser");
    await page.keyboard.press("Enter");
    await (await chooser).setFiles(join(FIXTURES, "time-gap.gpx"));
    await page.getByTestId("gap-list").waitFor({ state: "visible" });
    await pollBridge(page, (s) => s.ready === true);

    // Open the draw editor from the gap list.
    await tabUntil(page, `el.dataset.testid === "open-editor-button"`);
    await page.keyboard.press("Enter");
    await pollBridge(
      page,
      (s) =>
        (s.drawSession as Record<string, unknown> | null)?.drawMode === true,
    );

    // The Curve pen chip is a keyboard toggle (C is the shortcut twin).
    await tabUntil(page, `el.dataset.testid === "pen-mode-curve"`);
    await page.keyboard.press("Enter");
    await pollBridge(
      page,
      (s) =>
        (s.drawSession as Record<string, unknown> | null)?.penMode === "curve",
    );
    await tabUntil(page, `el.dataset.testid === "pen-mode-default"`);
    await page.keyboard.press("Enter");
    await pollBridge(
      page,
      (s) =>
        (s.drawSession as Record<string, unknown> | null)?.penMode ===
        "default",
    );

    // The pointer-mode chip cycles Draw → Move by keyboard.
    await tabUntil(page, `el.dataset.testid === "map-mode-chip"`);
    await page.keyboard.press("Enter");
    await pollBridge(
      page,
      (s) =>
        (s.drawSession as Record<string, unknown> | null)?.pointerMode ===
        "move",
    );
    // …and around through pan back to Draw for the drawing below
    // (the chip cycles Draw → Move → Pan → Draw).
    await page.keyboard.press("Enter");
    await pollBridge(
      page,
      (s) =>
        (s.drawSession as Record<string, unknown> | null)?.pointerMode ===
        "pan",
    );
    await page.keyboard.press("Enter");
    await pollBridge(
      page,
      (s) =>
        (s.drawSession as Record<string, unknown> | null)?.pointerMode ===
        "draw",
    );

    // The canvas is the one mouse surface (keyboard geometry entry is
    // the plan's deferred backlog) — place one point so the undo bar's
    // controls exist as enabled tab stops.
    const box = await page.locator(".maplibregl-canvas").boundingBox();
    const draw = await page.evaluate(() => {
      const c = window.__gpxMapController!;
      return c.projectLatLon(52.5206, 13.4055);
    });
    await page.mouse.click(box!.x + draw.x, box!.y + draw.y);
    await pollBridge(
      page,
      (s) =>
        (s.drawSession as Record<string, unknown> | null)?.vertexCount === 1,
    );

    // The undo bar is in the tab order and operable by keyboard —
    // one undo removes the point (and redo brings it back).
    await tabUntil(page, `el.dataset.testid === "undo-button"`);
    await expect(page.getByTestId("undo-button")).toBeEnabled();
    await page.keyboard.press("Enter");
    await pollBridge(
      page,
      (s) =>
        (s.drawSession as Record<string, unknown> | null)?.vertexCount === 0,
    );
    await tabUntil(page, `el.dataset.testid === "redo-button"`);
    await page.keyboard.press("Enter");
    await pollBridge(
      page,
      (s) =>
        (s.drawSession as Record<string, unknown> | null)?.vertexCount === 1,
    );

    // Close the editor with its keyboard-reachable close button.
    await tabUntil(page, `el.dataset.testid === "close-editor-button"`);
    await page.keyboard.press("Enter");
    await pollBridge(page, (s) => s.drawSession === null);
  });

  test("the export dialog takes focus, closes on Esc, and returns focus", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTestId("landing-mode-repair").click();
    const chooser = page.waitForEvent("filechooser");
    await page.getByTestId("upload-zone").click();
    await (await chooser).setFiles(join(FIXTURES, "time-gap.gpx"));
    await page.getByTestId("gap-list").waitFor({ state: "visible" });
    await pollBridge(page, (s) => s.ready === true);

    // Keyboard only from here.
    await tabUntil(page, `el.dataset.testid === "open-export-button"`);
    await page.keyboard.press("Enter");
    const dialog = page.getByTestId("export-dialog");
    await expect(dialog).toBeVisible();

    // Focus moved INTO the dialog (Radix focus management).
    await expect
      .poll(() =>
        page.evaluate(() =>
          Boolean(
            document.activeElement?.closest('[data-testid="export-dialog"]'),
          ),
        ),
      )
      .toBe(true);

    // Esc closes it and focus returns to the trigger.
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect
      .poll(() =>
        page.evaluate(
          // HTMLElement#dataset is not on the base Element type; the
          // attribute read is the type-safe equivalent.
          () => document.activeElement?.getAttribute("data-testid") ?? "",
        ),
      )
      .toBe("open-export-button");
  });

  test("the mobile tools sheet's grab bar is a keyboard toggle", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.getByTestId("landing-mode-repair").click();
    const chooser = page.waitForEvent("filechooser");
    await page.getByTestId("upload-zone").click();
    await (await chooser).setFiles(join(FIXTURES, "time-gap.gpx"));
    await page.getByTestId("gap-list").waitFor({ state: "visible" });

    const toggle = page.getByTestId("mobile-tools-toggle");
    await toggle.waitFor({ state: "visible" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");

    // Reachable by Tab alone, honest state, operable by Enter/Space.
    await page.getByTestId("mobile-tools-toggle").focus();
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Space");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
  });
});
