import sharp from "sharp";
import { join } from "node:path";

/**
 * Task 41 QA prep — prove the exported share-card PNG's alpha channel
 * by compositing the real 1× download onto three backdrops:
 *
 *   1. white        — the harshest light surface (also demonstrates
 *                     the known white-artwork caveat: the wordmark,
 *                     stats, and shoe are white ink);
 *   2. checkerboard — the universal "this image is transparent"
 *                     indicator;
 *   3. dark gray    — the intended "shown on dark" surface.
 */
const SRC = join(process.cwd(), "download", "share-card-spec-rev-1x.png");
const OUT = join(process.cwd(), "download");

const W = 1080;
const H = 1920;

// 1) White backdrop.
await sharp(SRC)
  .composite([{ input: { create: { width: W, height: H, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } } , blend: "dest-over" }])
  .png()
  .toFile(join(OUT, "task41-on-white.png"));

// 2) Checkerboard (24px squares, light gray/white).
const squares = [];
for (let y = 0; y < Math.ceil(H / 24); y += 1) {
  for (let x = 0; x < Math.ceil(W / 24); x += 1) {
    const light = (x + y) % 2 === 0;
    squares.push({
      input: {
        create: {
          width: 24,
          height: 24,
          channels: 4,
          background: light
            ? { r: 255, g: 255, b: 255, alpha: 1 }
            : { r: 205, g: 205, b: 205, alpha: 1 },
        },
      },
      left: x * 24,
      top: y * 24,
    });
  }
}
const checker = await sharp({
  create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
})
  .composite(squares)
  .png()
  .toBuffer();
await sharp(SRC)
  .composite([{ input: checker, blend: "dest-over" }])
  .png()
  .toFile(join(OUT, "task41-on-checkerboard.png"));

// 3) Dark gray backdrop (the "shown on dark" surface).
await sharp(SRC)
  .composite([
    {
      input: { create: { width: W, height: H, channels: 4, background: { r: 34, g: 34, b: 34, alpha: 1 } } },
      blend: "dest-over",
    },
  ])
  .png()
  .toFile(join(OUT, "task41-on-dark.png"));

console.log("composited: task41-on-white.png, task41-on-checkerboard.png, task41-on-dark.png");
