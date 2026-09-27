import type { Page } from "@playwright/test";

/**
 * Task 42 — the landing opens on the TOOL CARDS (the tab switcher is
 * gone). Every repair-section spec uploads through the repair tool's
 * page, so this enters it from wherever the landing currently is:
 *
 *   - cards showing → open the repair card and wait for its intake;
 *   - already on a tool page (e.g. after a "New file" reset kept the
 *     remembered tool) → nothing to do.
 *
 * The cards are part of the prerendered HTML, so the visibility probe
 * is race-free right after goto — the same contract the old tab clicks
 * relied on.
 */
export async function enterRepairTool(page: Page): Promise<void> {
  const card = page.getByTestId("landing-mode-repair");
  if (await card.isVisible()) {
    await card.click();
    await page.getByTestId("upload-zone").waitFor({ state: "visible" });
  }
}
