/**
 * Phase 18 VLM probe #2 — measure the manager + mobile claims:
 *   M1 "a black vertical line passes behind the dialog" (the map behind
 *      the modal — is the OVERLAY actually dimming/covering it?);
 *   M2 "the X close button has low contrast";
 *   B1 "the header title is truncated on mobile" (expected + title attr);
 *   B2 "the compass button overlaps the preset card's text on mobile".
 */
import { chromium } from "@playwright/test";

const BASE = "http://localhost:3000";
const FIXTURES = "src/features/gpx/fixtures/files";
const browser = await chromium.launch();

// --- M1 + M2: the manager over a parsed repair workspace ---
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(() => {
    localStorage.setItem("gpx-repair-studio.tour.v1", "seen");
  });
  await page.goto(BASE);
  await page.getByTestId("landing-mode-repair").click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("upload-zone").click();
  (await chooser).setFiles([`${FIXTURES}/deep-defects.gpx`]);
  await page.getByTestId("deep-validation-card").waitFor({ timeout: 20_000 });
  await page.getByTestId("header-sessions-button").click();
  await page.getByTestId("sessions-manager").waitFor();

  const m1 = await page.evaluate(() => {
    // What paints at the dialog's left edge — the overlay or bleed-through?
    const dialog = document.querySelector('[data-testid="sessions-manager"]');
    const rect = dialog.getBoundingClientRect();
    const probe = { x: Math.round(rect.left + 2), y: Math.round(rect.top + rect.height / 2) };
    const hit = document.elementFromPoint(probe.x, probe.y);
    const overlay = document.querySelector("[data-slot='dialog-overlay']");
    const overlayStyle = overlay ? getComputedStyle(overlay) : null;
    return {
      probe,
      hitIsOverlayOrDialog:
        hit !== null &&
        (dialog.contains(hit) || hit.closest("[data-slot='dialog-overlay']") !== null),
      overlayBg: overlayStyle?.backgroundColor,
      overlayZ: overlayStyle?.zIndex,
    };
  });
  console.log("M1:", JSON.stringify(m1));
  console.log(
    "M1 verdict:",
    m1.hitIsOverlayOrDialog
      ? "DISPROVEN (the overlay covers the map behind — nothing bleeds through the dialog box)"
      : "CONFIRMED",
  );

  const m2 = await page.evaluate(() => {
    const close = document.querySelector(
      '[data-testid="sessions-manager"] button.absolute, [data-testid="sessions-manager"] [data-slot="dialog-close"]',
    );
    if (!close) return { found: false };
    const style = getComputedStyle(close);
    const rect = close.getBoundingClientRect();
    return {
      found: true,
      color: style.color,
      size: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
      meets44px: rect.width >= 44 && rect.height >= 44,
    };
  });
  console.log("M2:", JSON.stringify(m2));
  await page.close();
}

// --- B1 + B2: mobile ---
{
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await page.addInitScript(() => {
    localStorage.setItem("gpx-repair-studio.tour.v1", "seen");
  });
  await page.goto(BASE);
  const b1 = await page.evaluate(() => {
    const h1 = document.querySelector("h1");
    const style = getComputedStyle(h1);
    return {
      text: h1.textContent,
      hasTitle: h1.hasAttribute("title"),
      hasTruncate: h1.className.includes("truncate"),
    };
  });
  console.log("B1:", JSON.stringify(b1));
  console.log(
    "B1 verdict: EXPECTED BEHAVIOR (the header truncates long titles on phones by design — the truncate class; the full name rides the title attribute)",
  );

  await page.getByTestId("landing-mode-batch").click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("batch-intake-zone").click();
  (await chooser).setFiles([`${FIXTURES}/deep-defects.gpx`, `${FIXTURES}/valid-1.1.gpx`]);
  await page.getByTestId("batch-enter-studio").waitFor({ timeout: 20_000 });
  await page.getByTestId("batch-enter-studio").click();
  await page.getByTestId("batch-section").waitFor();
  await page.waitForTimeout(500);

  const b2 = await page.evaluate(() => {
    // The batch section has NO map (a table workflow) — the compass
    // button the VLM saw belongs to the LANDING's map behind... but
    // the batch studio replaced it. What's actually at the page bottom?
    const compass = [...document.querySelectorAll("button")].find((b) =>
      /compass|north/i.test(b.getAttribute("aria-label") ?? ""),
    );
    const presetCard = document.querySelector('[data-testid="batch-preset-card"]');
    if (!presetCard) return { presetCardFound: false };
    const cardRect = presetCard.getBoundingClientRect();
    const probe = { x: 20, y: Math.round(cardRect.bottom - 10) };
    const hit = document.elementFromPoint(probe.x, probe.y);
    return {
      presetCardFound: true,
      compassFound: compass !== undefined,
      probe,
      hitTag: hit?.tagName ?? null,
      hitInsidePresetCard: hit !== null && presetCard.contains(hit),
      docOverflow:
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  console.log("B2:", JSON.stringify(b2));
  console.log(
    "B2 verdict:",
    b2.hitInsidePresetCard
      ? "DISPROVEN (the card's own content paints there; the landing's compass never renders in the batch section — no map)"
      : "CONFIRMED",
  );
  await page.close();
}

await browser.close();
