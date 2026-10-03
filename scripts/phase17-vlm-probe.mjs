/**
 * Phase 17 VLM probe — measure the critique's claims before acting on
 * them (the Task 13/14/15/16 lesson: viewport crops and font metrics
 * lie).
 *
 * Claim A (snap preview): the dl values are not vertically aligned and
 * the delta "floats without a baseline". Measured: the dd boxes' left
 * edges + the delta span's baseline vs its value's baseline.
 * Claim B (consent dialog): the privacy link renders as "Privacy&Bdata"
 * (a broken entity). Measured: the link's actual textContent.
 * Claim C (consent dialog): the footer buttons are center-aligned while
 * the body is left-aligned. Measured: the footer's justify vs the
 * dialog body's text alignment.
 * Claim D (mobile): the preview box's Apply/Cancel sit below the fold.
 * Measured: the buttons' boundingClientRect vs the 390x844 viewport +
 * the sheet's scroll state.
 */
import { chromium } from "@playwright/test";

const browser = await chromium.launch();

async function mockOsrm(page) {
  await page.route(/router\.project-osrm\.org/, async (route) => {
    const url = new URL(route.request().url());
    const pairs = (url.pathname.split("/").pop() ?? "")
      .split(";")
      .map((pair) => pair.split(",").map(Number))
      .map(([lon, lat]) => ({ lat, lon }));
    const coordinates = [[pairs[0].lon, pairs[0].lat]];
    for (let i = 1; i < pairs.length; i += 1) {
      coordinates.push([
        (pairs[i - 1].lon + pairs[i].lon) / 2,
        (pairs[i - 1].lat + pairs[i].lat) / 2 + 0.0004,
      ]);
      coordinates.push([pairs[i].lon, pairs[i].lat]);
    }
    await route.fulfill({
      json: {
        code: "Ok",
        routes: [{ distance: 1800, geometry: { coordinates } }],
      },
    });
  });
}

async function setupEditor(viewport) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(() => {
    try {
      localStorage.setItem("gpx-repair-studio.tour.v1", "seen");
    } catch {
      /* tolerated */
    }
  });
  const page_ = await context.newPage();
  await mockOsrm(page_);
  await page_.goto("http://localhost:3000/");
  const card = page_.getByTestId("landing-mode-repair");
  if (await card.isVisible()) await card.click();
  await page_.getByTestId("upload-zone").waitFor({ state: "visible" });
  const chooser = page_.waitForEvent("filechooser");
  await page_.getByTestId("upload-zone").click();
  await (await chooser).setFiles("download/demo-qc-run-with-gaps.gpx");
  await page_.getByTestId("open-editor-button").first().waitFor({ state: "visible" });
  await page_.getByTestId("open-editor-button").first().click();
  await page_.getByTestId("draw-editor-panel").waitFor({ state: "visible" });
  await page_.getByTestId("road-consent-enable").click();
  await page_.getByTestId("router-consent-grant").click();
  await page_.getByTestId("road-follow-off").click();
  await page_.getByTestId("vertex-add-form-lat").fill("14.6360");
  await page_.getByTestId("vertex-add-form-lon").fill("121.0580");
  await page_.getByTestId("vertex-add-form-button").click();
  await page_.getByTestId("vertex-add-form-lat").fill("14.6372");
  await page_.getByTestId("vertex-add-form-lon").fill("121.0595");
  await page_.getByTestId("vertex-add-form-button").click();
  return { context, page: page_ };
}

// Claim A + C — desktop.
{
  const { context, page } = await setupEditor({ width: 1280, height: 900 });
  await page.getByTestId("snap-to-road-button").click();
  await page.getByTestId("snap-preview-box").waitFor({ state: "visible" });

  const alignment = await page.evaluate(() => {
    const dds = document.querySelectorAll(
      "[data-testid='snap-preview-box'] dd",
    );
    const lefts = [...dds].map((dd) => Math.round(dd.getBoundingClientRect().left));
    const values = [...dds].map((dd) =>
      Math.round(dd.querySelector("font-semibold")?.getBoundingClientRect().top ??
        dd.getBoundingClientRect().top),
    );
    const delta = document.querySelector(
      "[data-testid='snap-preview-box'] dd span",
    );
    return {
      ddLeftEdges: lefts,
      aligned: new Set(lefts).size === 1,
      deltaBaselineDelta: delta
        ? Math.round(
            delta.getBoundingClientRect().bottom -
              delta.parentElement.getBoundingClientRect().bottom,
          )
        : null,
    };
  });
  console.log("A — dl alignment:", JSON.stringify(alignment));

  // Claim C — the consent dialog's footer vs body alignment.
  await page.getByTestId("close-editor-button").click();
  await page.getByTestId("footer-router-consent").click();
  const dialogAlignment = await page.evaluate(() => {
    const dialog = document.querySelector(
      "[data-testid='router-consent-dialog']",
    );
    const footer = dialog?.querySelector("[data-slot='dialog-footer']");
    const body = dialog?.querySelector("[data-slot='dialog-content']");
    const link = dialog?.querySelector(
      "[data-testid='router-consent-privacy-link']",
    );
    return {
      footerJustify: footer
        ? getComputedStyle(footer).justifyContent
        : null,
      footerTextAlign: footer ? getComputedStyle(footer).textAlign : null,
      bodyTextAlign: body ? getComputedStyle(body).textAlign : null,
      privacyLinkText: link ? JSON.stringify(link.textContent) : null,
    };
  });
  console.log("B+C — dialog:", JSON.stringify(dialogAlignment));
  await context.close();
}

// Claim D — mobile viewport fold.
{
  const { context, page } = await setupEditor({ width: 390, height: 844 });
  await page.getByTestId("snap-to-road-button").click();
  await page.getByTestId("snap-preview-box").waitFor({ state: "visible" });
  await page.waitForTimeout(500);
  const fold = await page.evaluate(() => {
    const apply = document
      .querySelector("[data-testid='snap-apply-button']")
      ?.getBoundingClientRect();
    const box = document
      .querySelector("[data-testid='snap-preview-box']")
      ?.getBoundingClientRect();
    return {
      viewportH: window.innerHeight,
      applyBottom: apply ? Math.round(apply.bottom) : null,
      applyTop: apply ? Math.round(apply.top) : null,
      boxTop: box ? Math.round(box.top) : null,
      applyWithinViewport: apply ? apply.bottom <= window.innerHeight : null,
      applyHeight: apply ? Math.round(apply.height) : null,
    };
  });
  console.log("D — mobile fold:", JSON.stringify(fold));
  await context.close();
}

await browser.close();
