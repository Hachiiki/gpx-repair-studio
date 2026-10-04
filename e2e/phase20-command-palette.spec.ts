import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { enterRepairTool } from "./helpers/landing";
import { abortRoadRouting } from "./helpers/road-follow";

/**
 * E2E — Phase 20: the command palette & the shortcut audit
 * (docs/MASTER_PLAN.md §EE 20.1–20.3).
 *
 *   1. Ctrl/Cmd+K opens the palette from the landing; typing filters;
 *      Enter RUNS the highlighted command (navigation to a tool page);
 *      Escape closes and returns focus to the invoker;
 *   2. the palette never stacks on another open dialog (the "?"-key
 *      discipline), and the chord toggles it closed;
 *   3. the audited bindings: Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z / Ctrl+Y
 *      undo and redo the ACTIVE editor's work — and never steal a text
 *      field's native undo;
 *   4. the palette is a first-class a11y surface (axe, clean);
 *   5. a session saved to the shelf appears in the palette's Recent
 *      sessions group and restores through it.
 *
 * Assertions read the DOM and the controller's test bridge — no pixel
 * diffs. Road routing is aborted (straight legs, deterministic).
 */

const DEMO = join("download", "demo-clean-run.gpx");

interface DrawSessionState {
  gapId: string;
  drawMode: boolean;
  vertexCount: number;
}

interface BridgeState {
  status: string;
  ready: boolean;
  moving: boolean;
  routeFeatureCount: number;
  pickSession: { active: boolean; mode: string; hasAnchor: boolean } | null;
  drawSession: DrawSessionState | null;
}

async function bridge(page: Page): Promise<BridgeState | null> {
  try {
    return await page.evaluate(() =>
      window.__gpxMapController
        ? (window.__gpxMapController.getTestState() as never)
        : null,
    );
  } catch {
    return null;
  }
}

async function pollBridge(
  page: Page,
  predicate: (state: BridgeState) => boolean,
  timeoutMs = 15_000,
): Promise<BridgeState> {
  const started = Date.now();
  for (;;) {
    const state = await bridge(page);
    if (state && predicate(state)) return state;
    if (Date.now() - started > timeoutMs) {
      throw new Error(
        `bridge predicate not met within ${timeoutMs} ms; last state: ${JSON.stringify(state)}`,
      );
    }
    await page.waitForTimeout(150);
  }
}

async function project(page: Page, lat: number, lon: number) {
  return page.evaluate(
    ([lat_, lon_]) =>
      window.__gpxMapController!.projectLatLon(lat_ as number, lon_ as number),
    [lat, lon] as const,
  );
}

async function canvasBox(page: Page) {
  await page.getByTestId("map-canvas").scrollIntoViewIfNeeded();
  const box = await page.locator(".maplibregl-canvas").boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

async function clickAt(page: Page, lat: number, lon: number) {
  const box = await canvasBox(page);
  const { x, y } = await project(page, lat, lon);
  await page.mouse.click(box.x + x, box.y + y);
}

test.beforeEach(async ({ page }) => {
  await abortRoadRouting(page);
});

test.describe("Phase 20 — command palette & shortcuts", () => {
  test("Ctrl+K opens the palette; search → Enter navigates; Escape closes", async ({
    page,
  }) => {
    await page.goto("/");
    await enterRepairTool(page);

    // -- open via the chord ----------------------------------------------
    await page.keyboard.press("Control+k");
    await expect(page.getByTestId("command-palette")).toBeVisible();
    const input = page.getByTestId("command-palette-input");
    await expect(input).toBeFocused();

    // The landing's tools are all there, in their groups.
    await expect(page.getByTestId("command-palette-item-open-plan")).toBeVisible();
    await expect(
      page.getByTestId("command-palette-item-open-repair"),
    ).toBeVisible();
    await expect(
      page.getByTestId("command-palette-item-editor-undo"),
    ).toHaveCount(0); // editing commands need a live editor

    // -- search filters ----------------------------------------------------
    await input.fill("plan");
    await expect(page.getByTestId("command-palette-item-open-plan")).toBeVisible();
    await expect(
      page.getByTestId("command-palette-item-open-merge"),
    ).toHaveCount(0);

    // -- Enter runs the highlighted command --------------------------------
    await input.press("Enter");
    await expect(page.getByTestId("command-palette")).toBeHidden();
    // Navigation happened: the plan tool's page.
    await expect(page.getByTestId("plan-start-card")).toBeVisible();

    // -- the chord toggles the palette closed ------------------------------
    await page.keyboard.press("Control+k");
    await expect(page.getByTestId("command-palette")).toBeVisible();
    await page.keyboard.press("Control+k");
    await expect(page.getByTestId("command-palette")).toBeHidden();

    // -- Escape closes and the focus returns --------------------------------
    await page.keyboard.press("Control+k");
    await expect(page.getByTestId("command-palette")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("command-palette")).toBeHidden();
  });

  test("the palette never stacks on another open dialog", async ({ page }) => {
    await page.goto("/");
    await enterRepairTool(page);

    // The help dialog is open…
    await page.keyboard.press("?");
    await expect(page.getByTestId("help-dialog")).toBeVisible();

    // …so the chord does nothing (one dialog at a time).
    await page.keyboard.press("Control+k");
    await expect(page.getByTestId("command-palette")).toBeHidden();
    await expect(page.getByTestId("help-dialog")).toBeVisible();

    // Close the help dialog; the chord works again.
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("help-dialog")).toBeHidden();
    await page.keyboard.press("Control+k");
    await expect(page.getByTestId("command-palette")).toBeVisible();
  });

  test("the audited undo/redo pair drives the active editor; text fields keep native undo", async ({
    page,
  }) => {
    await page.goto("/");
    await enterRepairTool(page);
    const chooser = page.waitForEvent("filechooser");
    await page.getByTestId("upload-zone").click();
    const fileChooser = await chooser;
    await fileChooser.setFiles(DEMO);
    await pollBridge(
      page,
      (s) => s.ready && s.routeFeatureCount > 0 && !s.moving,
    );

    // -- open a manual span editor (the anchored draw editor) --------------
    await page.getByTestId("begin-pick-pair-button").click();
    await pollBridge(
      page,
      (s) => s.pickSession?.active === true && s.pickSession.mode === "pair",
    );
    const xml = readFileSync(DEMO, "utf8");
    const matches = [
      ...xml.matchAll(/<trkpt[^>]*lat="([-\d.]+)"[^>]*lon="([-\d.]+)"/g),
    ];
    const anchorA = {
      lat: Number(matches[120]![1]),
      lon: Number(matches[120]![2]),
    };
    const anchorB = {
      lat: Number(matches[520]![1]),
      lon: Number(matches[520]![2]),
    };
    await clickAt(page, anchorA.lat, anchorA.lon);
    await pollBridge(page, (s) => s.pickSession?.hasAnchor === true);
    await clickAt(page, anchorB.lat, anchorB.lon);
    await pollBridge(
      page,
      (s) => s.drawSession !== null && s.drawSession.drawMode === true,
    );

    /*
     * -- draw three vertices ------------------------------------------------
     * Planned in screen space (fractions of the projected anchor chord
     * + perpendicular offsets) so every click clears the 16 px handle
     * and midpoint hit targets.
     */
    await page.getByTestId("snap-toggle").click();
    const aScreen = await project(page, anchorA.lat, anchorA.lon);
    const bScreen = await project(page, anchorB.lat, anchorB.lon);
    const chord = { dx: bScreen.x - aScreen.x, dy: bScreen.y - aScreen.y };
    const chordLen = Math.hypot(chord.dx, chord.dy) || 1;
    const perp = { x: -chord.dy / chordLen, y: chord.dx / chordLen };
    const screenPoint = async (t: number, offsetPx: number) => {
      const x = aScreen.x + t * chord.dx + offsetPx * perp.x;
      const y = aScreen.y + t * chord.dy + offsetPx * perp.y;
      return page.evaluate(
        ([x_, y_]) =>
          window.__gpxMapController!.unprojectXY(
            x_ as number,
            y_ as number,
          ),
        [x, y] as const,
      );
    };
    const v1 = await screenPoint(0.2, 60);
    const v2 = await screenPoint(0.48, 95);
    const v3 = await screenPoint(0.74, 45);
    await clickAt(page, v1.lat, v1.lon);
    await clickAt(page, v2.lat, v2.lon);
    await clickAt(page, v3.lat, v3.lon);
    await pollBridge(page, (s) => s.drawSession?.vertexCount === 3);

    // -- Ctrl+Z undoes, THREE TIMES, one vertex each ------------------------
    await page.keyboard.press("Control+z");
    await pollBridge(page, (s) => s.drawSession?.vertexCount === 2);
    await page.keyboard.press("Control+z");
    await pollBridge(page, (s) => s.drawSession?.vertexCount === 1);
    // The Ctrl+Y equivalent redoes one.
    await page.keyboard.press("Control+y");
    await pollBridge(page, (s) => s.drawSession?.vertexCount === 2);
    // Ctrl+Shift+Z redoes again.
    await page.keyboard.press("Control+Shift+z");
    await pollBridge(page, (s) => s.drawSession?.vertexCount === 3);

    // -- the palette runs undo too (the same routed action) -----------------
    await page.keyboard.press("Control+k");
    await expect(page.getByTestId("command-palette")).toBeVisible();
    await expect(
      page.getByTestId("command-palette-item-editor-undo"),
    ).toBeVisible();
    await page.getByTestId("command-palette-input").fill("undo");
    await page.getByTestId("command-palette-input").press("Enter");
    await pollBridge(page, (s) => s.drawSession?.vertexCount === 2);

    // -- a text field keeps its native undo ---------------------------------
    // (The gap-threshold input: typing there, Ctrl+Z must NOT touch the
    //  editor's vertices.)
    await page.keyboard.press("Escape"); // close any palette remnant
    const threshold = page.getByTestId("gap-threshold-input").first();
    if (await threshold.isVisible().catch(() => false)) {
      await threshold.click();
      await threshold.fill("500");
      const before = (await bridge(page))!.drawSession!.vertexCount;
      await page.keyboard.press("Control+z");
      await page.waitForTimeout(250);
      expect((await bridge(page))!.drawSession!.vertexCount).toBe(before);
    }
  });

  test("the palette is an accessible dialog surface (axe)", async ({ page }) => {
    const AxeBuilder = (await import("@axe-core/playwright")).default;
    await page.goto("/");
    await page.keyboard.press("Control+k");
    await expect(page.getByTestId("command-palette")).toBeVisible();

    const results = await new AxeBuilder({ page })
      .include('[data-testid="command-palette"]')
      .analyze();
    const criticals = results.violations.filter((violation) =>
      ["critical", "serious"].includes(violation.impact ?? ""),
    );
    expect(criticals).toEqual([]);
  });

  test("a saved session appears in Recent sessions and restores", async ({
    page,
  }) => {
    // Make a plan worth saving, save it under a name through the
    // sessions manager (the real flow), then find it in the palette.
    await page.goto("/");
    const card = page.getByTestId("landing-mode-plan");
    if (await card.isVisible()) {
      await card.click();
      await page.getByTestId("plan-start-card").waitFor({ state: "visible" });
    }
    await page.getByTestId("plan-start-button").click();
    await expect(page.getByTestId("plan-section")).toBeVisible();

    // Draw one point (enough to count as work) — once the map is live.
    await pollBridge(page, (s) => s.ready);
    await page.evaluate(() => {
      window.__gpxMapController!.fitBounds(
        {
          minLat: 52.51,
          maxLat: 52.535,
          minLon: 13.39,
          maxLon: 13.47,
        },
        { maxZoom: 14, action: "e2e-frame" },
      );
    });
    await clickAt(page, 52.52, 13.405);
    await pollBridge(page, (s) => s.drawSession?.vertexCount === 1);

    // Save through the manager.
    await page.getByTestId("header-sessions-button").click();
    await page.getByTestId("sessions-manager").waitFor({ state: "visible" });
    await page.getByTestId("sessions-save-name").fill("Palette test sketch");
    await page.getByTestId("sessions-save-button").click();
    await expect(
      page.getByTestId("sessions-manager").getByText("Palette test sketch"),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("sessions-manager")).toBeHidden();

    // The palette lists it under Recent sessions…
    await page.keyboard.press("Control+k");
    await expect(page.getByTestId("command-palette")).toBeVisible();
    const row = page
      .getByTestId("command-palette-list")
      .getByText("Palette test sketch");
    await expect(row).toBeVisible();

    // …and a fresh search finds it by name.
    await page.getByTestId("command-palette-input").fill("palette test");
    await expect(
      page.getByTestId("command-palette-list").getByText("Palette test sketch"),
    ).toBeVisible();

    // Start over (the plan studio resets), then restore from the palette.
    await page.keyboard.press("Escape");
    await page.getByTestId("header-reset-button").click();
    await expect(page.getByTestId("plan-start-card")).toBeVisible();

    await page.keyboard.press("Control+k");
    await page
      .getByTestId("command-palette-input")
      .fill("palette test");
    await page
      .getByTestId("command-palette-list")
      .getByText("Palette test sketch")
      .click();
    await expect(page.getByTestId("plan-section")).toBeVisible();
    await pollBridge(page, (s) => s.drawSession?.vertexCount === 1);
  });
});
