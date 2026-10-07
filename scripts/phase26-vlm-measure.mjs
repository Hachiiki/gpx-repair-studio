/**
 * Phase 26 VLM measure — verify or disprove the critique pass's claims
 * by measuring the rendered DOM (the Phase 23/24/25 discipline: every
 * claim gets a number; nothing is fixed on a vibe).
 *
 * Claims under test:
 *   1. "IMG_0003.heic is clipped, the final c cut off" (three of four
 *      critiques) — measure the filename element's scrollWidth vs
 *      clientWidth and read the ACTUAL rendered text (an honest
 *      ellipsis is `truncate` doing its job; a hard cut would be a bug);
 *   2. "muted text fails WCAG AA contrast on the card body / footer /
 *      tolerance line" — compute the real ratios from computed styles
 *      (the tokens are the app's own, used by every card since Phase 2;
 *      axe ran zero-critical on this very surface);
 *   3. "thumbnail-to-text padding under 12 px" — measure the box gap;
 *   4. "the two intake buttons' styles are inconsistent" — deliberate
 *      (a consequential door vs the default door); recorded, not
 *      measured;
 *   5. "the dark shots rendered light" (the Phase 24/25 sweep bug
 *      class) — average brightness of the two dark PNGs.
 */
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FORMAT_FIXTURES = join("src", "features", "formats", "fixtures", "files");
const QA = "scripts/qa/phase26";


// -- node-side fixtures (the shots script's twin, kept in one place) -------
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

function seg(code, payload) {
  const out = new Uint8Array(4 + payload.length);
  out[0] = 0xff; out[1] = code;
  out[2] = (payload.length + 2) >> 8; out[3] = (payload.length + 2) & 0xff;
  out.set(payload, 4);
  return out;
}
function cat(parts) {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}
function jpeg(exif) {
  const parts = [Uint8Array.from([0xff, 0xd8])];
  if (exif) {
    const text = [...exif].map((c) => c.charCodeAt(0)).concat([0]);
    const tiff = [];
    const p16 = (v) => tiff.push(v & 0xff, (v >>> 8) & 0xff);
    const p32 = (v) => tiff.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
    p16(0x49); p16(0x49); p16(0x2a); p32(8);
    p16(1); p16(0x8769); p16(4); p32(1); p32(26); p32(0);
    p16(1); p16(0x9003); p16(2); p32(20); p32(40); p32(0);
    while (tiff.length < 52) tiff.push(0);
    for (const b of text) tiff.push(b);
    const payload = cat([Uint8Array.from([0x45, 0x78, 0x69, 0x66, 0, 0]), Uint8Array.from(tiff)]);
    parts.push(seg(0xe1, payload));
  }
  parts.push(
    seg(0xfe, new TextEncoder().encode("x")),
    seg(0xdb, new Uint8Array(67).fill(0x11)),
    seg(0xc0, Uint8Array.from([8, 0, 16, 0, 16, 1, 1, 0x22, 0])),
    Uint8Array.from([0xff, 0xda, 0, 8, 1, 1, 0, 0, 0x3f, 0]),
    new Uint8Array(64).fill(0xa5),
    Uint8Array.from([0xff, 0xd9]),
  );
  return cat(parts);
}
function heic() {
  const out = new Uint8Array(24);
  out.set([0, 0, 0, 0x18], 0);
  out.set(new TextEncoder().encode("ftypheic"), 4);
  return out;
}
function buildPhotos() {
  const dir = mkdtempSync(join(tmpdir(), "gpxr-measure26-"));
  const entries = [
    { name: "IMG_0001.jpg", bytes: jpeg("2024:05:01 16:00:03") },
    { name: "IMG_0002.jpg", bytes: jpeg(null) },
    { name: "IMG_0003.heic", bytes: heic() },
  ];
  const paths = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    writeFileSync(path, entry.bytes);
    paths.push(path);
  }
  return paths;
}

const browser = await chromium.launch();

// -- Claim 5: the dark shots are actually dark ------------------------------
async function averageBrightness(pngPath) {
  const page = await browser.newPage();
  const dataUrl = `data:image/png;base64,${readFileSync(pngPath).toString("base64")}`;
  const bright = await page.evaluate(async (url) => {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 200;
    const ctx = canvas.getContext("2d");
    // Sample the header strip (chrome, not the map tiles).
    ctx.drawImage(img, 0, 0, 1280, 60, 0, 0, 200, 200);
    const data = ctx.getImageData(0, 0, 200, 200).data;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
    }
    return sum / (data.length / 4);
  }, dataUrl);
  await page.close();
  return Math.round(bright);
}

// -- Claims 1–3: live DOM measurements ----------------------------------------
async function measureCard(theme) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.addInitScript((t) => {
    localStorage.setItem("gpx-repair-studio.tour.v1", "seen");
    localStorage.setItem("gpx-repair-studio.tool-tours.v1", JSON.stringify({
      repair: "seen", share: "seen", recovery: "seen", create: "seen",
      merge: "seen", plan: "seen", batch: "seen",
    }));
    localStorage.setItem("gpx-repair-studio.theme.v1", t);
  }, theme);
  await page.goto("http://localhost:3000/");

  // Enter the repair tool, load the fixture (same scene as the shots).
  const card = page.getByTestId("landing-mode-repair");
  if (await card.isVisible()) await card.click();
  await page.getByTestId("upload-zone").waitFor({ state: "visible" });
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("upload-zone").click();
  (await chooser).setFiles(join(FORMAT_FIXTURES, "ride.tcx"));
  await page.getByTestId("map-toolbar").waitFor({ timeout: 20_000 });

  // Build the same three photos node-side (File objects cannot cross
  // the evaluate boundary — temp files, the shots script's twin).
  const photoFiles = buildPhotos();
  const chooser2 = page.waitForEvent("filechooser");
  await page.getByTestId("photos-add-button").click();
  (await chooser2).setFiles(photoFiles);
  await page.getByTestId("photo-row").nth(2).waitFor({ timeout: 10_000 });
  await page.getByTestId("photos-tz").click();
  await page.getByRole("option", { name: "UTC+10:00", exact: true }).click();
  await page.getByTestId("photos-card").scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);

  const measurements = await page.evaluate(() => {
    const out = {};
    // Claim 1 — the refused row's filename: honest ellipsis or hard cut?
    const refusedRow = document.querySelectorAll('[data-testid="photo-row"]')[2];
    const nameP = refusedRow.querySelector("p.truncate");
    out.filename = {
      text: nameP.textContent,
      scrollWidth: nameP.scrollWidth,
      clientWidth: nameP.clientWidth,
      ellipsized: getComputedStyle(nameP).textOverflow === "ellipsis",
      clippedHard: nameP.scrollWidth > nameP.clientWidth,
    };
    // Claim 2 — contrast ratios for the muted texts vs their surfaces.
    // Chromium reports oklch/lab computed colors: parse either and
    // convert to sRGB (both fg and bg take the same path, so the ratio
    // stays honest even with the small D50/D65 approximation).
    const ratio = (fgEl, bgEl) => {
      const parseColor = (color) => {
        const nums = color.match(/-?[\d.]+/g);
        if (nums === null) return [0, 0, 0, 1];
        if (color.startsWith("lab")) {
          const [L, a, b] = nums.slice(0, 3).map(Number);
          const fin = (t) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
          const yk = (L + 16) / 116;
          const x = fin(a / 500 + yk) * 0.95047;
          const y = fin(yk);
          const z = fin(yk - b / 200) * 1.08883;
          const lin = [
            3.2406 * x - 1.5372 * y - 0.4986 * z,
            -0.9689 * x + 1.8758 * y + 0.0415 * z,
            0.0557 * x - 0.204 * y + 1.057 * z,
          ].map((c) => Math.max(0, Math.min(1, c)));
          const gam = lin.map((c) =>
            c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055,
          );
          return [...gam, 1];
        }
        if (color.startsWith("oklch")) {
          const [L, C, H] = nums.slice(0, 3).map(Number);
          const hRad = (H * Math.PI) / 180;
          return parseColor(`lab(${L} ${Math.cos(hRad) * C} ${Math.sin(hRad) * C})`);
        }
        const [r, g, b, a] = nums.slice(0, 4).map(Number);
        return [r / 255, g / 255, b / 255, a === undefined ? 1 : a];
      };
      const lum = (color) => {
        const [r, g, b] = parseColor(color).map((v) => {
          const s = Math.max(0, Math.min(1, v));
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const fg = getComputedStyle(fgEl).color;
      let bgEl2 = bgEl;
      let bg = getComputedStyle(bgEl2).backgroundColor;
      let guard = 0;
      while (parseColor(bg)[3] === 0 && bgEl2.parentElement && guard < 20) {
        bgEl2 = bgEl2.parentElement;
        bg = getComputedStyle(bgEl2).backgroundColor;
        guard += 1;
      }
      const l1 = lum(fg);
      const l2 = lum(bg);
      const hi = Math.max(l1, l2);
      const lo = Math.min(l1, l2);
      return Number(((hi + 0.05) / (lo + 0.05)).toFixed(2));
    };
    const card = document.querySelector('[data-testid="photos-card"]');
    out.contrast = {
      footer: ratio(document.querySelector('[data-testid="photos-footer"]'), card),
      tolerance: ratio(
        [...card.querySelectorAll("p")].find((p) => p.textContent.includes("120 s")) ?? card.querySelector("p"),
        card,
      ),
      status: ratio(
        document.querySelectorAll('[data-testid="photo-row"]')[1].querySelector("p.font-mono"),
        card,
      ),
    };
    // Claim 3 — the thumbnail-to-text gap inside a row.
    const firstRow = document.querySelector('[data-testid="photo-row"]');
    const thumb = firstRow.querySelector("img, span[aria-hidden]");
    const textCol = firstRow.querySelector(".min-w-0");
    out.thumbGap = Math.round(
      textCol.getBoundingClientRect().left - thumb.getBoundingClientRect().right,
    );
    return out;
  });
  await page.close();
  return measurements;
}

console.log("— Claim 5: the dark shots' brightness (dark ≈ <80, light ≈ >200)");
console.log("  dark-workspace:", await averageBrightness(join(QA, "dark-workspace.png")));
console.log("  dark-card:", await averageBrightness(join(QA, "dark-card.png")));

for (const theme of ["light", "dark"]) {
  const m = await measureCard(theme);
  console.log(`\n— ${theme} theme —`);
  console.log("  Claim 1 (filename):", JSON.stringify(m.filename));
  console.log("  Claim 2 (contrast AA ≥ 4.5):", JSON.stringify(m.contrast));
  console.log("  Claim 3 (thumb→text gap px):", m.thumbGap);
}

await browser.close();
