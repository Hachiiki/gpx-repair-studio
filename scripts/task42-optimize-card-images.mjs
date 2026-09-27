/**
 * Task 42 — optimize the generated card illustrations for shipping.
 *
 * Raw 1344×768 PNGs (scripts/qa/task42/raw/) → 896px-wide WebP
 * (public/cards/{mode}.webp): the cards display at ~440px in the 2×2
 * desktop grid (~890px full-width on mobile), so 896 covers a 2×
 * device ratio. Also builds a labeled 2×2 contact sheet
 * (download/task42-cards-preview.png) for the user and for VLM review.
 */
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const ROOT = process.cwd();
const RAW = join(ROOT, "scripts/qa/task42/raw");
const OUT = join(ROOT, "public/cards");
const SHEET = join(ROOT, "download/task42-cards-preview.png");

const MODES = ["repair", "share", "recovery", "create"];
const WIDTH = 896; // 2× the widest card display width

await mkdir(OUT, { recursive: true });

for (const mode of MODES) {
  const src = join(RAW, `${mode}.png`);
  const dst = join(OUT, `${mode}.webp`);
  await sharp(src)
    .resize({ width: WIDTH })
    .webp({ quality: 82 })
    .toFile(dst);
  const meta = await sharp(dst).metadata();
  console.log(`${mode}.webp: ${meta.width}x${meta.height}, ${meta.size} bytes`);
}

// -- labeled contact sheet (2×2 on the bone field) -------------------------
const CELL_W = 672;
const CELL_H = 384; // 1344x768 at half scale
const PAD = 24;
const LABEL_H = 44;

const cells = [];
for (let i = 0; i < MODES.length; i++) {
  const mode = MODES[i];
  const col = i % 2;
  const row = Math.floor(i / 2);
  const x = PAD + col * (CELL_W + PAD);
  const y = PAD + row * (CELL_H + LABEL_H + PAD);
  const img = await sharp(join(RAW, `${mode}.png`))
    .resize({ width: CELL_W, height: CELL_H, fit: "cover" })
    .toBuffer();
  const label = Buffer.from(
    `<svg width="${CELL_W}" height="${LABEL_H}">
       <text x="0" y="30" font-family="monospace" font-size="26" font-weight="bold" fill="#222222">${mode.toUpperCase()}</text>
     </svg>`,
  );
  cells.push({ input: img, left: x, top: y });
  cells.push({ input: label, left: x, top: y + CELL_H + 6 });
}

const SHEET_W = PAD * 3 + CELL_W * 2;
const SHEET_H = PAD * 3 + (CELL_H + LABEL_H + 6) * 2;
await sharp({
  create: {
    width: SHEET_W,
    height: SHEET_H,
    channels: 3,
    background: { r: 241, g: 241, b: 240 },
  },
})
  .composite(cells)
  .png()
  .toFile(SHEET);
console.log(`contact sheet: ${SHEET} (${SHEET_W}x${SHEET_H})`);
