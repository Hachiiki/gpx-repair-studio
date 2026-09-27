import sharp from "sharp";
import { join } from "node:path";

/**
 * Task 40 QA prep — crop the rendered STRAVA wordmark from the 1×
 * export and synthesize the pre-fix (Task-23 stretched) variant for
 * a VLM before/after critique.
 *
 * The old render differed from the new one ONLY in the x scale
 * (0.598 vs 0.444 at the same 55px ink height), so stretching the
 * new crop horizontally by 330/244.95 = 1.347 reproduces the old
 * squeeze exactly.
 */
const SRC = join(process.cwd(), "download", "share-card-spec-rev-1x.png");
const OUT = join(process.cwd(), "download");

// The contained ink lands at x 417.5–662.5, y 1280–1335. Crop with
// generous margins so the letters have breathing room.
const CROP = { left: 360, top: 1250, width: 360, height: 120 };

const fresh = await sharp(SRC)
  .extract(CROP)
  .png()
  .toFile(join(OUT, "task40-logo-after.png"));

// The simulated Task-23 stretch: same crop, 1.347× wider.
const STRETCH = 330 / (55 * (551.8 / 123.9)); // ≈ 1.347
const squeezed = await sharp(SRC)
  .extract(CROP)
  .resize({ width: Math.round(CROP.width * STRETCH) })
  .png()
  .toFile(join(OUT, "task40-logo-before-simulated.png"));

console.log(
  `after: ${fresh.width}x${fresh.height}, before (simulated stretch ×${STRETCH.toFixed(3)}): ${squeezed.width}x${squeezed.height}`,
);
