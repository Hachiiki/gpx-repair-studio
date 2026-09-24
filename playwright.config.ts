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
