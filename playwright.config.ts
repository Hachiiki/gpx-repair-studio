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
 */
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
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
