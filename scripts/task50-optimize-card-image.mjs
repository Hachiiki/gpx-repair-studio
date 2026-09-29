/**
 * Task 50 — optimize the generated plan card illustration for shipping.
 *
 * Raw 1344×768 PNG (scripts/qa/task50/raw/) → 896px-wide WebP
 * (public/cards/plan.webp), the exact pipeline Task 42/43 used so all
 * six cards share one size and quality. Also drops a preview PNG in
 * download/ for VLM review.
 */
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const ROOT = process.cwd();
const RAW = join(ROOT, "scripts/qa/task50/raw");
const OUT = join(ROOT, "public/cards");
const PREVIEW = join(ROOT, "download/task50-plan-card-preview.png");

const WIDTH = 896; // 2× the widest card display width

await mkdir(OUT, { recursive: true });

const src = join(RAW, "plan.png");
const dst = join(OUT, "plan.webp");
await sharp(src).resize({ width: WIDTH }).webp({ quality: 82 }).toFile(dst);
const meta = await sharp(dst).metadata();
console.log(`plan.webp: ${meta.width}x${meta.height}, ${meta.size} bytes`);

await sharp(src).resize({ width: WIDTH }).png().toFile(PREVIEW);
console.log(`preview: ${PREVIEW}`);
