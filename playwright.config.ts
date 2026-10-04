import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration — E2E tests.
 *
 * No `webServer` is configured on purpose: this sandbox runs the Next.js dev
 * server automatically on port 3000 (never start it yourself). Tests target
 * that already-running server via baseURL.
 *
 * Phase 0 ships Chromium only (smoke coverage); WebKit + mobile viewports are
 * added when real UI phases land (Phases 2+), per the master plan §N.
 *
 * Phase 11 — the seeded storageState below marks the onboarding tour as
 * already seen, so the ~110 existing specs never meet the first-run
 * overlay. The tour's own spec (e2e/onboarding-tour.spec.ts) opts OUT of
 * the seed with a test-local storageState override — the tour is a
 * fresh-browser behavior and gets a fresh browser there.
 */

/** Same key/value as src/lib/storage/tour-flag.ts writes (kept in sync by tests). */
const SEEN_TOUR_STATE = {
  cookies: [],
  origins: [
    {
      origin: "http://localhost:3000",
      localStorage: [
        { name: "gpx-repair-studio.tour.v1", value: "seen" },
        /* Phase 19 — every per-tool tour marked seen too, so the
         * existing suites never meet the offer banner (the tool-tour
         * specs opt out with test-local overrides, same as the
         * onboarding spec). */
        {
          name: "gpx-repair-studio.tool-tours.v1",
          value: JSON.stringify({
            repair: "seen",
            share: "seen",
            recovery: "seen",
            create: "seen",
            merge: "seen",
            plan: "seen",
            batch: "seen",
          }),
        },
      ],
    },
  ],
};

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  // The sandbox has ~4 GB RAM; the dev server (~1.4 GB) plus parallel
  // WebGL Chromium renderers (~1 GB each) must stay under it or the kernel
  // OOM-killer takes either the dev server or a renderer down mid-run
  // (observed with 6 and with 2 workers once the Phase 4 draw specs joined
  // the suite). Serial execution keeps the whole suite comfortably inside
  // the budget; CI environments with more RAM can raise this.
  workers: 1,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    // The export workflow (Phase 7) downloads the repaired GPX through a
    // blob URL anchor click — specs assert on the downloaded bytes.
    acceptDownloads: true,
    // Phase 11 — every spec starts with the tour already seen (see header).
    storageState: SEEN_TOUR_STATE,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
