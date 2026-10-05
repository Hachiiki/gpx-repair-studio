/**
 * generate-pwa-icons.mjs — Phase 22.1 (§EE 22.1).
 *
 * Renders the app's route-mark SVG (public/logo.svg, byte-identical to
 * src/app/icon.svg) into the PNG icons an installable manifest needs:
 *
 *   public/icons/icon-192.png     — "any" purpose, 192×192
 *   public/icons/icon-512.png     — "any" purpose, 512×512
 *   public/icons/maskable-512.png — full-bleed signal field, mark kept
 *                                    inside the 80% safe zone
 *
 * Rendering uses the repo's own Playwright Chromium against a file://
 * page (deterministic: fixed viewport, deviceScaleFactor 1, no
 * animations — the SVG is static paths). The maskable variant pads the
 * 30×30 viewBox inside a 38.4×38.4 (30 / 0.78125) signal-orange field
 * so the mark survives Android's circular mask; the "any" icons fill
 * the canvas with the field edge-to-edge exactly like the favicon.
 *
 * Also prints the exact sRGB hex of the two --background theme colors
 * (oklch values from globals.css) — those hexes feed the manifest's
 * theme_color / background_color and the dual theme-color <meta> tags
 * in layout.tsx. Run:  node scripts/generate-pwa-icons.mjs
 */
import { chromium } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(process.cwd());
const OUT_DIR = path.join(ROOT, "public", "icons");

/** oklch(L C h) → sRGB hex (the same math browsers do for CSS colors). */
function oklchToHex(L, C, hDegrees) {
  const h = (hDegrees * Math.PI) / 180;
  const a = Math.cos(h) * C;
  const b = Math.sin(h) * C;
  // OKLab → LMS' → LMS → linear sRGB (Björn Ottosson's matrices).
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  const gamma = (x) => {
    const v = Math.min(1, Math.max(0, x));
    return Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));
  };
  const hex = (n) => n.toString(16).padStart(2, "0").toUpperCase();
  return `${hex(gamma(r))}${hex(gamma(g))}${hex(gamma(bl))}`;
}

/** The SVG stretched edge-to-edge (what the favicon shows). */
function plainSvg(source, size) {
  return source.replace(
    /(<svg[^>]*?)(>)/,
    `$1 width="${size}" height="${size}"$2`,
  );
}

/** The SVG padded to the maskable safe zone on a full-bleed field. */
function maskableSvg(source, size) {
  // Safe zone: mark occupies 78% of the canvas, centered.
  const markSize = Math.round(size * 0.78);
  const pad = (size - markSize) / 2;
  const inner = source
    .replace(/(<svg[^>]*?)(>)/, `$1 width="${markSize}" height="${markSize}"$2`)
    .replace(/"/g, "&quot;");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`,
    `<rect width="${size}" height="${size}" fill="#FC4C02"/>`,
    `<g transform="translate(${pad} ${pad})">${inner.replace(/&quot;/g, '"')}</g>`,
    `</svg>`,
  ].join("\n");
}

async function main() {
  // Theme colors, straight from globals.css's oklch values.
  const lightBg = oklchToHex(0.958, 0.002, 286);
  const darkBg = oklchToHex(0.196, 0.002, 286);
  console.log(`theme-color (light --background): ${lightBg}`);
  console.log(`theme-color (dark  --background): ${darkBg}`);

  const source = await readFile(path.join(ROOT, "public", "logo.svg"), "utf8");
  await mkdir(OUT_DIR, { recursive: true });

  const jobs = [
    { name: "icon-192.png", size: 192, svg: plainSvg(source, 192) },
    { name: "icon-512.png", size: 512, svg: plainSvg(source, 512) },
    { name: "maskable-512.png", size: 512, svg: maskableSvg(source, 512) },
  ];

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 600, height: 600 } });
    for (const job of jobs) {
      await page.setContent(
        `<!doctype html><html><body style="margin:0">${job.svg}</body></html>`,
      );
      const buffer = await page.locator("svg").first().screenshot();
      await writeFile(path.join(OUT_DIR, job.name), buffer);
      console.log(`wrote public/icons/${job.name} (${buffer.length} bytes)`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
