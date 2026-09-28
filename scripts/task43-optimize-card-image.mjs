/**
 * Task 43 — optimize the generated merge card illustration for shipping.
 *
 * Raw 1344×768 PNG (scripts/qa/task43/raw/merge.png) → 896px-wide WebP
 * (public/cards/merge.webp): the cards display at ~440px in the 2-col
 * desktop grid (~890px full-width on mobile), so 896 covers a 2×
 * device ratio — the same numbers Task 42 shipped for the other four.
 */
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const ROOT = process.cwd();
const RAW = join(ROOT, "scripts/qa/task43/raw");
const OUT = join(ROOT, "public/cards");
const WIDTH = 896; // 2× the widest card display width

await mkdir(OUT, { recursive: true });

const src = join(RAW, "merge.png");
const dst = join(OUT, "merge.webp");
await sharp(src).resize({ width: WIDTH }).webp({ quality: 82 }).toFile(dst);
const meta = await sharp(dst).metadata();
console.log(`merge.webp: ${meta.width}x${meta.height}, ${meta.size} bytes`);
