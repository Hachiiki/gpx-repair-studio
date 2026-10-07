/**
 * Phase 26 VLM sweep — screenshots of the photo-geotagging surfaces in
 * both themes, saved under scripts/qa/phase26/ for the VLM critique
 * pass. Two surfaces:
 *
 *   1. workspace — the repair map with a matched photo's pin + the
 *      legend's photos entry pinned open (the pin in context);
 *   2. card — the photos card itself, scrolled into the tools column:
 *      calibration block, the live rows (matched / no-timestamp /
 *      refused HEIC), the batch buttons, the privacy footer.
 *
 * The synthetic JPEGs are built inline (plain-node twin of
 * tests/helpers/synthetic-jpeg.ts — scripts can't import app TS).
 */
import { chromium } from "@playwright/test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FORMAT_FIXTURES = join("src", "features", "formats", "fixtures", "files");
const OUT = "scripts/qa/phase26";
mkdirSync(OUT, { recursive: true });

// -- the inline fixture writer (little-endian minimal EXIF) ---------------
function u16(a, v) { a.push(v & 0xff, (v >>> 8) & 0xff); return a; }
function u32(a, v) {
  a.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
  return a;
}
function asciiEntry(tag, text) {
  const data = [...text].map((c) => c.charCodeAt(0) & 0xff).concat([0]);
  return { tag, type: 2, count: data.length, data };
}
function buildTiff({ dateTimeOriginal }) {
  const exif = dateTimeOriginal ? [asciiEntry(0x9003, dateTimeOriginal)] : [];
  const ifd0 = [];
  if (exif.length) ifd0.push({ tag: 0x8769, type: 4, count: 1, data: [] });
  ifd0.sort((a, b) => a.tag - b.tag);
  const ifdSize = (n) => 2 + 12 * n + 4;
  let cursor = 8;
  const ifd0At = cursor; cursor += ifdSize(ifd0.length);
  const exifAt = exif.length ? cursor : -1; if (exif.length) cursor += ifdSize(exif.length);
  const payloadAt = cursor;
  let p = payloadAt;
  for (const e of [...ifd0, ...exif]) {
    if (e.data.length > 4) { e.offset = p; p += e.data.length; if (p % 2) p += 1; }
  }
  for (const e of ifd0) {
    if (e.tag === 0x8769) e.data = u32([], exifAt);
  }
  const out = [];
  u16(out, 0x49); u16(out, 0x2a); u32(out, ifd0At);
  const writeIfd = (entries, next) => {
    u16(out, entries.length);
    for (const e of entries) {
      u16(out, e.tag); u16(out, e.type); u32(out, e.count);
      if (e.data.length > 4) u32(out, e.offset);
      else { const inline = [0, 0, 0, 0]; for (let i = 0; i < e.data.length; i++) inline[i] = e.data[i]; out.push(...inline); }
    }
    u32(out, next);
  };
  writeIfd(ifd0, 0);
  if (exif.length) writeIfd(exif, 0);
  for (const e of [...ifd0, ...exif]) {
    if (e.data.length > 4) { if (out.length % 2) out.push(0); out.push(...e.data); }
  }
  return Uint8Array.from(out);
}
function segment(code, payload) {
  const out = new Uint8Array(4 + payload.length);
  out[0] = 0xff; out[1] = code;
  out[2] = (payload.length + 2) >> 8; out[3] = (payload.length + 2) & 0xff;
  out.set(payload, 4);
  return out;
}
function concat(...parts) {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}
function buildJpeg(exif) {
  const parts = [Uint8Array.from([0xff, 0xd8])];
  if (exif) {
    const tiff = buildTiff(exif);
    const payload = concat(Uint8Array.from([0x45, 0x78, 0x69, 0x66, 0, 0]), tiff);
    parts.push(segment(0xe1, payload));
  }
  parts.push(
    segment(0xfe, new TextEncoder().encode("phase26 vlm fixture")),
    segment(0xdb, new Uint8Array(67).fill(0x11)),
    segment(0xc0, Uint8Array.from([0x08, 0x00, 0x10, 0x00, 0x10, 0x01, 0x01, 0x22, 0x00])),
    Uint8Array.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00]),
    new Uint8Array(64).fill(0xa5),
    Uint8Array.from([0xff, 0xd9]),
  );
  return concat(...parts);
}
function heicMagic() {
  const out = new Uint8Array(24);
  out.set([0x00, 0x00, 0x00, 0x18], 0);
  out.set(new TextEncoder().encode("ftypheic"), 4);
  return out;
}

// -- the sweep ---------------------------------------------------------------
const PHOTO_DIR = mkdtempSync(join(tmpdir(), "gpxr-vlm26-"));
const PHOTOS = [
  { name: "IMG_0001.jpg", bytes: buildJpeg({ dateTimeOriginal: "2024:05:01 16:00:03" }) },
  { name: "IMG_0002.jpg", bytes: buildJpeg({}) },
  { name: "IMG_0003.heic", bytes: heicMagic() },
];
for (const photo of PHOTOS) {
  writeFileSync(join(PHOTO_DIR, photo.name), photo.bytes);
}

const browser = await chromium.launch();

async function freshPage(theme) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.addInitScript((t) => {
    localStorage.setItem("gpx-repair-studio.tour.v1", "seen");
    localStorage.setItem(
      "gpx-repair-studio.tool-tours.v1",
      JSON.stringify({ repair: "seen", share: "seen", recovery: "seen", create: "seen", merge: "seen", plan: "seen", batch: "seen" }),
    );
    // The theme key is a RAW string (the Phase 25 measure lesson).
    localStorage.setItem("gpx-repair-studio.theme.v1", t);
  }, theme);
  await page.goto("http://localhost:3000/");
  return page;
}

async function loadTrack(page) {
  const card = page.getByTestId("landing-mode-repair");
  if (await card.isVisible()) await card.click();
  await page.getByTestId("upload-zone").waitFor({ state: "visible" });
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("upload-zone").click();
  (await chooser).setFiles(join(FORMAT_FIXTURES, "ride.tcx"));
  await page.getByTestId("map-toolbar").waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
}

/** Add the three photos and calibrate to Melbourne; waits for the match. */
async function setupPhotos(page) {
  await loadTrack(page);
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("photos-add-button").click();
  (await chooser).setFiles(PHOTOS.map((p) => join(PHOTO_DIR, p.name)));
  await page.getByTestId("photo-row").nth(2).waitFor({ timeout: 10_000 });
  await page.getByTestId("photos-tz").click();
  await page.getByRole("option", { name: "UTC+10:00", exact: true }).click();
  await page
    .getByTestId("photo-row")
    .first()
    .filter({ has: page.getByTestId("photo-match") })
    .waitFor({ timeout: 10_000 });
  await page.waitForTimeout(600);
}

async function shot(theme, name, action) {
  const page = await freshPage(theme);
  await action(page);
  await page.screenshot({ path: join(OUT, `${theme}-${name}.png`), fullPage: false });
  await page.close();
  console.log(`${theme}-${name}.png saved`);
}

// Surface 1 — the workspace: pin on the map, legend pinned open.
for (const theme of ["light", "dark"]) {
  await shot(theme, "workspace", async (page) => {
    await setupPhotos(page);
    await page.waitForFunction(
      () => window.__gpxMapController?.getTestState().photoPins.visible === true,
      undefined,
      { timeout: 10_000 },
    );
    await page.getByTestId("map-legend-toggle").click();
    // Bring the photos card's top into the tools column's view.
    await page.getByTestId("photos-card").scrollIntoViewIfNeeded();
    await page.waitForTimeout(1_200);
  });
}

// Surface 2 — the card close-up: calibration + rows + footer.
for (const theme of ["light", "dark"]) {
  await shot(theme, "card", async (page) => {
    await setupPhotos(page);
    await page.getByTestId("photos-card").scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.getByTestId("photos-card").screenshot({ path: join(OUT, `${theme}-card.png`) });
  });
}

await browser.close();
console.log("screenshots saved to", OUT);
