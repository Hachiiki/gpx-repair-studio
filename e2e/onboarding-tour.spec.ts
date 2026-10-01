import { expect, test } from "@playwright/test";

/**
 * Onboarding tour & info dialog (Phase 11) — the release-polish surfaces.
 *
 * These specs deliberately opt OUT of the config's seeded storageState
 * (which marks the tour as seen for every other suite) so the tour can
 * be tested as the fresh-browser behavior it is:
 *
 *   - first run: the 4-step overlay auto-opens on the tool cards;
 *   - next walks the steps; Get started finishes and remembers;
 *   - after the tour (or a skip), a reload never re-offers it;
 *   - the "Take the tour" link replays it on demand;
 *   - a returning browser with restorable work is NOT greeted (the
 *     restore prompt has priority — covered by session-recovery.spec,
 *     asserted here only through the seen-seed's absence of overlay);
 *   - the About / Privacy & Data dialog opens from the footer, its
 *     tabs switch, and the privacy pane carries the egress table.
 */

// A truly fresh browser: no seeded tour flag (the config seeds "seen").
test.use({
  storageState: {
    cookies: [],
    origins: [],
  },
});

test.describe("onboarding tour — first run", () => {
  test("auto-opens on the tool cards and walks to the end", async ({
    page,
  }) => {
    await page.goto("/");

    const tour = page.getByTestId("onboarding-tour");
    await expect(tour).toBeVisible();
    await expect(page.getByTestId("tour-step-title-0")).toBeVisible();
    await expect(page.getByTestId("tour-step-title-0")).toContainText(
      "Your files stay on this device",
    );
    await expect(page.getByTestId("tour-skip")).toBeVisible();
    // Step 1 has no Back; the dots show four steps.
    await expect(page.getByTestId("tour-back")).toHaveCount(0);

    await page.getByTestId("tour-next").click();
    await expect(page.getByTestId("tour-step-title-1")).toContainText(
      "Pick a tool",
    );

    await page.getByTestId("tour-next").click();
    await expect(page.getByTestId("tour-step-title-2")).toContainText(
      "Draw, then refine",
    );

    await page.getByTestId("tour-next").click();
    await expect(page.getByTestId("tour-step-title-3")).toContainText(
      "Nothing is lost, nothing is invented",
    );
    await expect(page.getByTestId("tour-next")).toHaveText("Get started");

    // Finishing closes the overlay and remembers.
    await page.getByTestId("tour-next").click();
    await expect(tour).toHaveCount(0);
    expect(
      await page.evaluate(
        () => window.localStorage.getItem("gpx-repair-studio.tour.v1"),
      ),
    ).toBe("seen");

    // A reload never re-offers it.
    await page.goto("/");
    await expect(page.getByTestId("onboarding-tour")).toHaveCount(0);
    // The manual replay link is there for whenever it is wanted.
    await expect(page.getByTestId("landing-start-tour")).toBeVisible();
  });

  test("skip counts as seen", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("onboarding-tour")).toBeVisible();
    await page.getByTestId("tour-skip").click();
    await expect(page.getByTestId("onboarding-tour")).toHaveCount(0);
    expect(
      await page.evaluate(
        () => window.localStorage.getItem("gpx-repair-studio.tour.v1"),
      ),
    ).toBe("seen");
  });

  test("back walks backward and Esc closes-remembers", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("tour-step-title-0")).toBeVisible();
    await page.getByTestId("tour-next").click();
    await page.getByTestId("tour-next").click();
    await expect(page.getByTestId("tour-step-title-2")).toBeVisible();
    await page.getByTestId("tour-back").click();
    await expect(page.getByTestId("tour-step-title-1")).toBeVisible();
    await page.getByTestId("tour-back").click();
    await expect(page.getByTestId("tour-step-title-0")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("onboarding-tour")).toHaveCount(0);
    expect(
      await page.evaluate(
        () => window.localStorage.getItem("gpx-repair-studio.tour.v1"),
      ),
    ).toBe("seen");
  });

  test("the Take the tour link replays it on demand", async ({ page }) => {
    // Seen browser (the seeded default shape, set manually to be explicit).
    await page.addInitScript(() => {
      window.localStorage.setItem("gpx-repair-studio.tour.v1", "seen");
    });
    await page.goto("/");
    await expect(page.getByTestId("onboarding-tour")).toHaveCount(0);
    await page.getByTestId("landing-start-tour").click();
    await expect(page.getByTestId("tour-step-title-0")).toBeVisible();
  });
});

test.describe("about & privacy dialog", () => {
  // Seen tour for these (the dialog is the subject, not the greeting).
  test.use({
    storageState: {
      cookies: [],
      origins: [
        {
          origin: "http://localhost:3000",
          localStorage: [{ name: "gpx-repair-studio.tour.v1", value: "seen" }],
        },
      ],
    },
  });

  test("footer opens About with attributions and the version", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTestId("footer-about").click();

    const dialog = page.getByTestId("info-dialog");
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId("about-pane")).toBeVisible();
    await expect(page.getByTestId("about-pane")).toContainText("MapLibre");
    await expect(page.getByTestId("about-pane")).toContainText(
      "OpenStreetMap contributors",
    );
    await expect(page.getByTestId("about-version")).toContainText(
      "local-first",
    );
  });

  test("footer opens Privacy & Data with the egress table", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTestId("footer-privacy").click();

    await expect(page.getByTestId("privacy-pane")).toBeVisible();
    const table = page.getByTestId("privacy-egress-table");
    await expect(table).toBeVisible();
    await expect(table).toContainText("tiles.openfreemap.org");
    await expect(table).toContainText("router.project-osrm.org");
    await expect(table).toContainText("valhalla1.openstreetmap.de");
    await expect(table).toContainText("api.open-meteo.com");
    // The storage disclosure names both on-device keys.
    await expect(page.getByTestId("privacy-storage-sessions")).toContainText(
      "gpx-repair-studio.sessions",
    );
    await expect(page.getByTestId("privacy-storage-settings")).toContainText(
      "gpx-repair-studio.settings.v1",
    );
  });

  test("tabs switch panes inside the open dialog", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("footer-privacy").click();
    await expect(page.getByTestId("privacy-pane")).toBeVisible();

    await page.getByTestId("info-tab-about").click();
    await expect(page.getByTestId("about-pane")).toBeVisible();
    await expect(page.getByTestId("privacy-pane")).toHaveCount(0);

    // Arrow keys walk back to privacy (the tabs pattern).
    await page.getByRole("tab", { name: /privacy/i }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("privacy-pane")).toBeVisible();

    // Esc closes; the footer line stays.
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("info-dialog")).toHaveCount(0);
    await expect(
      page.getByText(/All processing happens in your browser/i),
    ).toBeVisible();
  });
});
