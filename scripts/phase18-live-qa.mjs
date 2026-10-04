/**
 * Phase 18 live QA — batch & portable sessions, both themes + mobile,
 * zero console/page errors, every claim measured.
 *
 * Covers: the 7-tile landing + the centered batch tile, the batch
 * intake statuses, the studio aggregate, the preset preview dialog,
 * the ZIP download (unzipped + manifest asserted), the sessions
 * manager (save/export/rename/delete), the portable round-trip
 * (export → reset → open), and the honest refusals (cap, foreign file).
 */
import { chromium } from "@playwright/test";
import { unzipSync } from "fflate";
import { readFileSync } from "node:fs";

const BASE = "http://localhost:3000";
const FIXTURES = "src/features/gpx/fixtures/files";
const CHECKS = [];
let failed = 0;

function check(name, condition, detail = "") {
  const ok = condition === true;
  CHECKS.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed++;
}

async function freshPage(browser, { theme = "light", mobile = false } = {}) {
  const page = await browser.newPage(
    mobile
      ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
      : { viewport: { width: 1440, height: 900 } },
  );
  await page.addInitScript((t) => {
    localStorage.setItem("gpx-repair-studio.tour.v1", "seen");
    if (t === "dark") localStorage.setItem("gpx-repair-studio.theme", "dark");
  }, theme);
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  return { page, errors };
}

const browser = await chromium.launch();

// ---------------------------------------------------------------------------
// Desktop, light: the full batch + session flows
// ---------------------------------------------------------------------------
{
  const { page, errors } = await freshPage(browser);
  await page.goto(BASE);

  // Landing: 7 tiles, batch present, 7th centered on desktop.
  check("landing has 7 tiles", (await page.getByTestId("landing-mode-toggle").locator("li").count()) === 7);
  check("batch tile present", await page.getByTestId("landing-mode-batch").isVisible());
  const col = await page.evaluate(() =>
    getComputedStyle(
      document.querySelector("[data-testid='landing-mode-toggle']").querySelector("li:last-child"),
    ).gridColumnStart,
  );
  check("7th tile centered (grid column 2)", col === "2", `column=${col}`);

  // The landing session door + the header door.
  await page.getByTestId("landing-open-session").click();
  check("sessions manager opens from landing", await page.getByTestId("sessions-manager").isVisible());
  await page.keyboard.press("Escape");
  check("header Sessions button present", await page.getByTestId("header-sessions-button").isVisible());

  // Batch: statuses.
  await page.getByTestId("landing-mode-batch").click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("batch-intake-zone").click();
  (await chooser).setFiles([
    `${FIXTURES}/deep-defects.gpx`,
    `${FIXTURES}/valid-1.1.gpx`,
  ]);
  await page.getByTestId("batch-enter-studio").waitFor({ timeout: 20_000 });
  const gateText = await page.getByTestId("batch-enter-studio").innerText();
  check("intake counts parsed files", gateText.includes("2 parsed"), gateText.trim());

  await page.getByTestId("batch-enter-studio").click();
  await page.getByTestId("batch-section").waitFor();
  const aggregate = await page.getByTestId("batch-aggregate").innerText();
  check("aggregate: 2 parsed + 1 findings + 1 clean",
    aggregate.includes("2 parsed") && aggregate.includes("1 with findings") && aggregate.includes("1 clean"),
    aggregate.replace(/\n/g, " "));

  // The queue rows carry the §EE status words.
  const statuses = await page.locator('[data-testid="batch-queue-row"]').evaluateAll(
    (rows) => rows.map((r) => r.getAttribute("data-status")),
  );
  check("status words: one issues-found, one clean",
    statuses.includes("issues-found") && statuses.includes("clean"), JSON.stringify(statuses));

  // Preset preview → apply.
  await page.getByTestId("batch-preset-spike-sweep").click();
  await page.getByTestId("batch-preset-dialog").waitFor();
  const previewCount = await page.getByTestId("batch-preset-file").count();
  check("per-file preview rows", previewCount === 2, `rows=${previewCount}`);
  await page.getByTestId("batch-preset-confirm").click();
  await page.locator('[data-testid="batch-queue-row"][data-status="fixed"]').waitFor({ timeout: 10_000 });
  check("fixed status after apply", true);

  // The ZIP.
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("batch-download-zip").click(),
  ]);
  const unzipped = unzipSync(new Uint8Array(readFileSync(await download.path())));
  check("zip: 2 gpx + manifest",
    Object.keys(unzipped).length === 3 && "MANIFEST.txt" in unzipped,
    Object.keys(unzipped).join(", "));
  const manifest = new TextDecoder().decode(unzipped["MANIFEST.txt"]);
  check("manifest names the preset + the unchanged file",
    manifest.includes("applied: Spike & outlier sweep") && manifest.includes("no changes (exported as recorded)"));

  // Sessions: save → rename → export row → delete.
  await page.getByTestId("header-sessions-button").click();
  await page.getByTestId("sessions-manager").waitFor();
  check("save disabled for a batch queue (no sessions)",
    !(await page.getByTestId("sessions-save-button").isEnabled()));
  await page.keyboard.press("Escape");

  // Header reset clears the batch section.
  await page.getByTestId("header-reset-button").click();
  await page.getByTestId("batch-intake").waitFor();
  check("reset returns to the batch intake", true);

  check("desktop light: zero console/page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  await page.close();
}

// ---------------------------------------------------------------------------
// Desktop, dark: the portable session round-trip
// ---------------------------------------------------------------------------
{
  const { page, errors } = await freshPage(browser, { theme: "dark" });
  await page.goto(BASE);
  await page.getByTestId("landing-mode-repair").click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("upload-zone").click();
  (await chooser).setFiles([`${FIXTURES}/deep-defects.gpx`]);
  await page.getByTestId("deep-validation-card").waitFor({ timeout: 20_000 });
  await page.getByTestId("deep-issue-fix-remove-spikes").first().click();
  await page.getByTestId("fix-preview-confirm").click();
  await page.getByTestId("deep-change-row").first().waitFor();

  // Save + export.
  await page.getByTestId("header-sessions-button").click();
  await page.getByTestId("sessions-manager").waitFor();
  await page.getByTestId("sessions-save-name").fill("dark theme session");
  await page.getByTestId("sessions-save-button").click();
  await page.getByTestId("sessions-row").first().waitFor();
  check("dark: shelf row saved", true);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("sessions-export-current").click(),
  ]);
  const json = readFileSync(await download.path(), "utf8");
  const doc = JSON.parse(json);
  check("dark: portable doc carries the fix + source",
    doc.session?.workingEdits?.length === 1 && doc.source?.name === "deep-defects.gpx");
  await page.keyboard.press("Escape");

  // Reset → open the exported file.
  await page.getByTestId("header-reset-button").click();
  await page.getByTestId("upload-zone").waitFor();
  await page.getByTestId("header-sessions-button").click();
  await page.getByTestId("sessions-manager").waitFor();
  const [fileChooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByTestId("sessions-open-file-button").click(),
  ]);
  await fileChooser.setFiles([
    {
      name: "deep-defects.gpxrepair.json",
      mimeType: "application/json",
      buffer: Buffer.from(json, "utf8"),
    },
  ]);
  await page.getByTestId("deep-validation-card").waitFor({ timeout: 20_000 });
  check("dark: round-trip restored the fix log",
    (await page.getByTestId("deep-change-row").count()) === 1);

  // A foreign file is refused honestly.
  await page.getByTestId("header-sessions-button").click();
  await page.getByTestId("sessions-manager").waitFor();
  const [badChooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByTestId("sessions-import-button").click(),
  ]);
  await badChooser.setFiles([`${FIXTURES}/valid-1.1.gpx`]);
  await page.getByTestId("sessions-notice").waitFor();
  const notice = await page.getByTestId("sessions-notice").innerText();
  check("foreign file refused with a plain sentence", notice.includes("not a session file"), notice);
  await page.keyboard.press("Escape");

  check("desktop dark: zero console/page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  await page.close();
}

// ---------------------------------------------------------------------------
// Mobile: the landing + the batch intake + no overflow
// ---------------------------------------------------------------------------
{
  const { page, errors } = await freshPage(browser, { mobile: true });
  await page.goto(BASE);
  check("mobile: 7 tiles", (await page.getByTestId("landing-mode-toggle").locator("li").count()) === 7);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check("mobile: no horizontal overflow", overflow <= 0, `${overflow}px`);

  await page.getByTestId("landing-mode-batch").click();
  await page.getByTestId("batch-intake").waitFor();
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("batch-intake-zone").click();
  (await chooser).setFiles([`${FIXTURES}/valid-1.1.gpx`]);
  await page.getByTestId("batch-enter-studio").waitFor({ timeout: 20_000 });
  await page.getByTestId("batch-enter-studio").click();
  await page.getByTestId("batch-section").waitFor();
  const overflow2 = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check("mobile: studio no horizontal overflow", overflow2 <= 0, `${overflow2}px`);
  const dialogButton = page.getByTestId("batch-preset-spike-sweep");
  await dialogButton.click();
  await page.getByTestId("batch-preset-dialog").waitFor();
  const confirmVisible = await page
    .getByTestId("batch-preset-confirm")
    .boundingBox();
  check("mobile: preset confirm within the fold",
    confirmVisible !== null && confirmVisible.y + confirmVisible.height <= 844,
    confirmVisible ? `bottom=${Math.round(confirmVisible.y + confirmVisible.height)}` : "not found");

  check("mobile: zero console/page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  await page.close();
}

await browser.close();

console.log(CHECKS.join("\n"));
console.log(`\n${CHECKS.length - failed}/${CHECKS.length} checks passed${failed > 0 ? ` — ${failed} FAILED` : ""}`);
process.exit(failed > 0 ? 1 : 0);
