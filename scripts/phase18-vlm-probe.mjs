/**
 * Phase 18 VLM probe — measure every critique claim before acting
 * (the phase 15–17 ritual: the VLM says, measurement decides).
 *
 * Claims under test:
 *   V1 "Issues found" chip vertically misaligned vs Clean/Failed chips;
 *   V2 inconsistent horizontal gap chip→filename between rows;
 *   V4 the "+ Add files" button floats (not aligned to the aggregate line);
 *   V5 the failed row's error text leaves minimal right padding before
 *      the remove icon (truncation/overflow risk).
 */
import { chromium } from "@playwright/test";

const BASE = "http://localhost:3000";
const FIXTURES = "src/features/gpx/fixtures/files";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript(() => {
  localStorage.setItem("gpx-repair-studio.tour.v1", "seen");
});
await page.goto(BASE);
await page.getByTestId("landing-mode-batch").click();
const chooser = page.waitForEvent("filechooser");
await page.getByTestId("batch-intake-zone").click();
(await chooser).setFiles([
  `${FIXTURES}/deep-defects.gpx`,
  `${FIXTURES}/valid-1.1.gpx`,
  `${FIXTURES}/not-gpx.gpx`,
]);
await page.getByTestId("batch-enter-studio").waitFor({ timeout: 20_000 });
await page.getByTestId("batch-enter-studio").click();
await page.getByTestId("batch-section").waitFor();
await page.waitForTimeout(400);

const measurements = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('[data-testid="batch-queue-row"]')];
  const chipGeometry = rows.map((row) => {
    const chip = row.querySelector("[data-slot='badge']");
    const name = row.querySelector("span.truncate");
    const rect = chip?.getBoundingClientRect();
    const nameRect = name?.getBoundingClientRect();
    return {
      status: row.getAttribute("data-status"),
      chipTop: rect ? Math.round(rect.top) : null,
      chipCenterY: rect ? Math.round((rect.top + rect.bottom) / 2) : null,
      chipBottom: rect ? Math.round(rect.bottom) : null,
      chipRight: rect ? Math.round(rect.right) : null,
      nameLeft: nameRect ? Math.round(nameRect.left) : null,
      chipHeight: rect ? Math.round(rect.height) : null,
    };
  });

  // V4: the Add-files button vs the aggregate block.
  const addBtn = document
    .querySelector('[data-testid="batch-add-files"]')
    ?.getBoundingClientRect();
  const heading = document.querySelector("h2")?.getBoundingClientRect();

  // V5: the failed row's error paragraph vs the row's right edge.
  const failedRow = rows.find((r) => r.getAttribute("data-status") === "failed");
  const errorP = failedRow?.querySelector("p");
  const errorRect = errorP?.getBoundingClientRect();
  const rowRect = failedRow?.getBoundingClientRect();

  return {
    chipGeometry,
    addBtn: addBtn
      ? { top: Math.round(addBtn.top), bottom: Math.round(addBtn.bottom) }
      : null,
    headingBottom: heading ? Math.round(heading.bottom) : null,
    errorRight: errorRect ? Math.round(errorRect.right) : null,
    rowRight: rowRect ? Math.round(rowRect.right) : null,
    errorScrollWidth: errorP?.scrollWidth ?? null,
    errorClientWidth: errorP?.clientWidth ?? null,
  };
});
console.log(JSON.stringify(measurements, null, 2));

// Verdicts.
const chips = measurements.chipGeometry;
const centers = chips.map((c) => c.chipCenterY);
const heights = new Set(chips.map((c) => c.chipHeight));
const firstRowTop = chips[0]?.chipTop;
const rowTops = chips.map((c) => c.chipTop);

console.log("\n--- VERDICTS ---");
// V1: chips vertically misaligned — but rows are separate list items at
// different Y positions by design! The comparable value is the chip's
// offset WITHIN its row (chipTop - rowTop). Measure that instead:
const rowOffsets = await page.evaluate(() => {
  return [...document.querySelectorAll('[data-testid="batch-queue-row"]')].map(
    (row) => {
      const chip = row.querySelector("[data-slot='badge']");
      const chipRect = chip?.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      return {
        status: row.getAttribute("data-status"),
        offset: chipRect ? Math.round(chipRect.top - rowRect.top) : null,
      };
    },
  );
});
console.log("V1 chip-within-row offsets:", JSON.stringify(rowOffsets));
const offsets = rowOffsets.map((r) => r.offset);
console.log(
  "V1 verdict:",
  new Set(offsets).size === 1
    ? "DISPROVEN (identical offsets)"
    : `CONFIRMED (offsets differ: ${offsets.join(", ")})`,
);

const gaps = chips.map((c) =>
  c.nameLeft !== null && c.chipRight !== null ? c.nameLeft - c.chipRight : null,
);
console.log("V2 chip→name gaps (px):", gaps.join(", "));
console.log(
  "V2 verdict:",
  new Set(gaps).size === 1
    ? "DISPROVEN (identical gaps)"
    : `CONFIRMED (gaps differ by ${Math.max(...gaps) - Math.min(...gaps)}px)`,
);

console.log(
  "V4 verdict: the Add-files button sits in the header's flex row (items-end, justify-between) —",
  measurements.addBtn ? `button top ${measurements.addBtn.top}, heading bottom ${measurements.headingBottom}` : "n/a",
);

const errorPadding =
  measurements.rowRight !== null && measurements.errorRight !== null
    ? measurements.rowRight - measurements.errorRight
    : null;
console.log(
  `V5 error right padding: ${errorPadding}px, scrollWidth ${measurements.errorScrollWidth} vs clientWidth ${measurements.errorClientWidth}`,
);
console.log(
  "V5 verdict:",
  measurements.errorScrollWidth !== null &&
    measurements.errorScrollWidth <= (measurements.errorClientWidth ?? 0) + 1
    ? `DISPROVEN (no overflow; ${errorPadding}px padding remains)`
    : "CONFIRMED (text overflows or clips)",
);

await browser.close();
