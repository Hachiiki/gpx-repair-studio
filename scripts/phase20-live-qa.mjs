/**
 * Phase 20 live QA — command palette & shortcuts, both themes + mobile,
 * zero console/page errors.
 *
 * Covers: Ctrl/Cmd+K open/close/toggle, input focus, grouped listing,
 * search → Enter navigation, Escape + focus return, the no-stack rule
 * over the help dialog, the audited undo/redo chords driving a real
 * editor (and NOT stealing a text field's native undo), the generated
 * cheat sheet in the help dialog, the Recent-sessions group after a
 * real save, and the palette in dark mode + on a mobile viewport.
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const BASE = "http://localhost:3000";
const DEMO = "download/demo-clean-run.gpx";
const CHECKS = [];
let failed = 0;

function check(name, condition, detail = "") {
  const ok = condition === true;
  CHECKS.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed++;
}

async function freshPage(
  browser,
  { theme = "light", mobile = false } = {},
) {
  const page = await browser.newPage(
    mobile
      ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
      : { viewport: { width: 1440, height: 900 } },
  );
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.addInitScript((options) => {
    localStorage.setItem("gpx-repair-studio.tour.v1", "seen");
    localStorage.setItem(
      "gpx-repair-studio.tool-tours.v1",
      JSON.stringify({
        repair: "seen",
        share: "seen",
        recovery: "seen",
        create: "seen",
        merge: "seen",
        plan: "seen",
        batch: "seen",
      }),
    );
    if (options.theme === "dark") {
      localStorage.setItem("gpx-repair-studio.theme.v1", "dark");
    }
  }, { theme });
  return { page, errors };
}

async function bridgeState(page) {
  return page.evaluate(() =>
    window.__gpxMapController
      ? window.__gpxMapController.getTestState()
      : null,
  );
}

async function waitFor(predicate, timeoutMs = 15000, label = "condition") {
  const started = Date.now();
  for (;;) {
    const value = await predicate();
    if (value) return value;
    if (Date.now() - started > timeoutMs) {
      throw new Error(`timeout waiting for ${label}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

async function run() {
  const browser = await chromium.launch();

  // -- light theme, desktop --------------------------------------------------
  {
    const { page, errors } = await freshPage(browser, {});
    await page.goto(BASE, { waitUntil: "networkidle" });

    // The chord opens the palette with the input focused.
    await page.keyboard.press("Control+k");
    await waitFor(
      () => page.getByTestId("command-palette").isVisible(),
      5000,
      "palette open",
    );
    check(
      "Ctrl+K opens the palette",
      await page.getByTestId("command-palette").isVisible(),
    );
    check(
      "the search input is focused on open",
      await page
        .getByTestId("command-palette-input")
        .evaluate((el) => document.activeElement === el),
    );
    check(
      "the landing's tool commands are listed",
      await page.getByTestId("command-palette-item-open-plan").isVisible(),
    );
    check(
      "editing commands are hidden without a live editor",
      (await page.getByTestId("command-palette-item-editor-undo").count()) === 0,
    );
    check(
      "the recent-sessions group is absent on an empty shelf",
      (await page.locator("[cmdk-group-heading]", { hasText: "Recent sessions" }).count()) === 0,
    );

    // Search → Enter navigates to the plan tool page.
    await page.getByTestId("command-palette-input").fill("plan");
    await page.getByTestId("command-palette-input").press("Enter");
    await waitFor(
      () => page.getByTestId("plan-start-card").isVisible(),
      5000,
      "plan tool page",
    );
    check(
      "search + Enter navigates (the plan tool page)",
      await page.getByTestId("plan-start-card").isVisible(),
    );

    // The chord toggles the palette closed.
    await page.keyboard.press("Control+k");
    await waitFor(
      () => page.getByTestId("command-palette").isVisible(),
      5000,
      "palette reopen",
    );
    await page.keyboard.press("Control+k");
    await waitFor(
      async () => !(await page.getByTestId("command-palette").isVisible()),
      5000,
      "palette toggle close",
    );
    check("Ctrl+K toggles the palette closed", true);

    // Escape closes (settled — Radix closes asynchronously).
    await page.keyboard.press("Control+k");
    await page.keyboard.press("Escape");
    await waitFor(
      async () => !(await page.getByTestId("command-palette").isVisible()),
      5000,
      "palette Escape close",
    );
    check("Escape closes the palette", true);

    // The no-stack rule over the help dialog.
    await page.keyboard.press("?");
    await waitFor(
      () => page.getByTestId("help-dialog").isVisible(),
      5000,
      "help dialog",
    );
    await page.keyboard.press("Control+k");
    check(
      "Ctrl+K does not stack on an open dialog",
      !(await page.getByTestId("command-palette").isVisible()) &&
        (await page.getByTestId("help-dialog").isVisible()),
    );
    // The generated cheat sheet carries the audited bindings.
    const helpText = await page.getByTestId("help-dialog").innerText();
    check(
      "the cheat sheet documents Ctrl+K (palette)",
      helpText.includes("Ctrl K"),
    );
    check(
      "the cheat sheet documents the undo/redo pair",
      helpText.includes("Ctrl Z") && helpText.includes("Ctrl Shift Z"),
    );
    await page.keyboard.press("Escape");

    // A session saved through the manager appears in Recent sessions.
    await page.getByTestId("plan-start-button").click();
    await waitFor(
      () => page.getByTestId("plan-section").isVisible(),
      5000,
      "plan studio",
    );
    const state = await waitFor(
      async () => {
        const s = await bridgeState(page);
        return s?.ready ? s : null;
      },
      15000,
      "plan map ready",
    );
    check("the plan studio's map is live", Boolean(state?.ready));
    const projected = await page.evaluate(() => {
      window.__gpxMapController.fitBounds(
        { minLat: 52.51, maxLat: 52.535, minLon: 13.39, maxLon: 13.47 },
        { maxZoom: 14, action: "qa-frame" },
      );
      return window.__gpxMapController.projectLatLon(52.52, 13.405);
    });
    const box = await page.locator(".maplibregl-canvas").boundingBox();
    await page.mouse.click(box.x + projected.x, box.y + projected.y);
    await waitFor(
      async () => (await bridgeState(page))?.drawSession?.vertexCount === 1,
      5000,
      "drawn point",
    );
    await page.getByTestId("header-sessions-button").click();
    await page.getByTestId("sessions-manager").waitFor({ state: "visible" });
    await page.getByTestId("sessions-save-name").fill("Live QA palette row");
    await page.getByTestId("sessions-save-button").click();
    await waitFor(
      () =>
        page
          .getByTestId("sessions-manager")
          .getByText("Live QA palette row")
          .isVisible(),
      5000,
      "saved row",
    );
    await page.keyboard.press("Escape");
    await waitFor(
      async () => !(await page.getByTestId("sessions-manager").isVisible()),
      5000,
      "manager closed",
    );

    await page.keyboard.press("Control+k");
    await waitFor(
      () => page.getByTestId("command-palette").isVisible(),
      5000,
      "palette for sessions",
    );
    check(
      "the saved session appears under Recent sessions",
      await page
        .getByTestId("command-palette-list")
        .getByText("Live QA palette row")
        .isVisible(),
    );
    await page.keyboard.press("Escape");

    // Clean the shelf so later runs start fresh.
    await page.getByTestId("header-sessions-button").click();
    await page.getByTestId("sessions-manager").waitFor({ state: "visible" });
    const deleteButton = page
      .getByTestId("sessions-manager")
      .getByTestId(/sessions-delete-button/)
      .first();
    if (await deleteButton.isVisible().catch(() => false)) {
      await deleteButton.click();
      await page.waitForTimeout(300);
    }
    await page.keyboard.press("Escape");

    check(
      "zero console/page errors (light, desktop)",
      errors.length === 0,
      errors.slice(0, 3).join(" | "),
    );
    await page.close();
  }

  // -- dark theme + the undo/redo chords in a real editor --------------------
  {
    const { page, errors } = await freshPage(browser, { theme: "dark" });
    await page.goto(BASE, { waitUntil: "networkidle" });

    // Enter the repair tool and upload the demo file.
    const repairCard = page.getByTestId("landing-mode-repair");
    if (await repairCard.isVisible()) {
      await repairCard.click();
      await page.getByTestId("upload-zone").waitFor({ state: "visible" });
    }
    const chooser = page.waitForEvent("filechooser");
    await page.getByTestId("upload-zone").click();
    const fileChooser = await chooser;
    await fileChooser.setFiles(DEMO);
    await waitFor(
      async () => {
        const s = await bridgeState(page);
        return s?.ready && s.routeFeatureCount > 0 && !s.moving;
      },
      15000,
      "parsed file",
    );

    // Open a manual span editor and draw two points.
    await page.getByTestId("begin-pick-pair-button").click();
    const xml = readFileSync(DEMO, "utf8");
    const matches = [
      ...xml.matchAll(/<trkpt[^>]*lat="([-\d.]+)"[^>]*lon="([-\d.]+)"/g),
    ];
    const anchorA = {
      lat: Number(matches[120][1]),
      lon: Number(matches[120][2]),
    };
    const anchorB = {
      lat: Number(matches[520][1]),
      lon: Number(matches[520][2]),
    };
    const project = async (lat, lon) =>
      page.evaluate(([lat_, lon_]) =>
        window.__gpxMapController.projectLatLon(lat_, lon_),
      [lat, lon]);
    const box = await page.locator(".maplibregl-canvas").boundingBox();
    const aScreen = await project(anchorA.lat, anchorA.lon);
    const bScreen = await project(anchorB.lat, anchorB.lon);
    const clickAtScreen = async (x, y) =>
      page.mouse.click(box.x + x, box.y + y);
    await clickAtScreen(aScreen.x, aScreen.y);
    await waitFor(
      async () => (await bridgeState(page))?.pickSession?.hasAnchor === true,
      5000,
      "first anchor",
    );
    await clickAtScreen(bScreen.x, bScreen.y);
    await waitFor(
      async () => {
        const s = await bridgeState(page);
        return s?.drawSession !== null;
      },
      5000,
      "editor open",
    );
    await page.getByTestId("snap-toggle").click();
    const chord = {
      dx: bScreen.x - aScreen.x,
      dy: bScreen.y - aScreen.y,
    };
    const len = Math.hypot(chord.dx, chord.dy) || 1;
    await clickAtScreen(
      aScreen.x + 0.25 * chord.dx + 60 * (-chord.dy / len),
      aScreen.y + 0.25 * chord.dy + 60 * (chord.dx / len),
    );
    await clickAtScreen(
      aScreen.x + 0.55 * chord.dx + 90 * (-chord.dy / len),
      aScreen.y + 0.55 * chord.dy + 90 * (chord.dx / len),
    );
    await waitFor(
      async () => (await bridgeState(page))?.drawSession?.vertexCount === 2,
      5000,
      "two drawn points",
    );

    // The audited chords: undo, undo, redo.
    await page.keyboard.press("Control+z");
    await waitFor(
      async () => (await bridgeState(page))?.drawSession?.vertexCount === 1,
      5000,
      "undo 1",
    );
    check("Ctrl+Z undoes the active editor", true);
    await page.keyboard.press("Control+Shift+z");
    await waitFor(
      async () => (await bridgeState(page))?.drawSession?.vertexCount === 2,
      5000,
      "redo",
    );
    check("Ctrl+Shift+Z redoes", true);

    // The palette in dark mode lists the editing commands.
    await page.keyboard.press("Control+k");
    await waitFor(
      () => page.getByTestId("command-palette").isVisible(),
      5000,
      "dark palette",
    );
    check(
      "editing commands appear with a live editor",
      await page.getByTestId("command-palette-item-editor-undo").isVisible(),
    );
    check(
      "navigate commands are hidden mid-session",
      (await page.getByTestId("command-palette-item-open-plan").count()) === 0,
    );
    await page.keyboard.press("Escape");

    // A text field keeps its native undo (the vertex count is untouchable).
    await page.getByTestId("draw-editor-panel").scrollIntoViewIfNeeded();
    const latInput = page.getByTestId("vertex-lat-input").first();
    if (await latInput.isVisible().catch(() => false)) {
      await latInput.click();
      const before = (await bridgeState(page))?.drawSession?.vertexCount;
      await page.keyboard.press("Control+z");
      await page.waitForTimeout(250);
      check(
        "a focused text field keeps native undo (vertices untouched)",
        (await bridgeState(page))?.drawSession?.vertexCount === before,
      );
    }

    check(
      "zero console/page errors (dark, editor)",
      errors.length === 0,
      errors.slice(0, 3).join(" | "),
    );
    await page.close();
  }

  // -- mobile viewport --------------------------------------------------------
  {
    const { page, errors } = await freshPage(browser, { mobile: true });
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.keyboard.press("Control+k");
    await waitFor(
      () => page.getByTestId("command-palette").isVisible(),
      5000,
      "mobile palette",
    );
    const box = await page
      .getByTestId("command-palette")
      .boundingBox();
    check(
      "the palette fits the mobile viewport",
      box !== null && box.width <= 390 && box.x >= 0,
      box ? `w=${Math.round(box.width)} x=${Math.round(box.x)}` : "no box",
    );
    await page.keyboard.press("Escape");
    check(
      "zero console/page errors (mobile)",
      errors.length === 0,
      errors.slice(0, 3).join(" | "),
    );
    await page.close();
  }

  await browser.close();
  console.log(CHECKS.join("\n"));
  console.log(`\n${CHECKS.length - failed}/${CHECKS.length} checks passed`);
  if (failed > 0) process.exit(1);
}

run().catch((error) => {
  console.error(CHECKS.join("\n"));
  console.error("\nFATAL:", error);
  process.exit(1);
});
