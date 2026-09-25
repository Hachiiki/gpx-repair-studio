import sharp from "sharp";
import { join } from "node:path";

/**
 * Visual sanity check: downsample the exported card to a coarse
 * character grid — O = orange route, # = black casing, W = white
 * artwork (logo/stats/shoe), . = transparent. A human-readable
 * composition proof to complement the pixel-band assertions.
 */
const SRC = join(process.cwd(), "download", "share-card-spec-rev-1x.png");

const COLS = 45;
const ROWS = 40;

const { data, info } = await sharp(SRC)
  .resize(COLS, ROWS, { fit: "fill" })
  .raw()
  .toBuffer({ resolveWithObject: true });

const grid = [];
for (let y = 0; y < ROWS; y += 1) {
  let row = "";
  for (let x = 0; x < COLS; x += 1) {
    const i = (y * COLS + x) * 4;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a < 60) row += ".";
    else if (r > 200 && g > 30 && g < 140 && b < 70) row += "O";
    else if (r < 60 && g < 60 && b < 60) row += "#";
    else if (r > 200 && g > 200 && b > 200) row += "W";
    else row += "?";
  }
  grid.push(row);
}

console.log(`Composition of ${SRC.split("/").pop()} (${info.width}x${info.height} → ${COLS}x${ROWS}):`);
grid.forEach((row, i) => {
  const pct = ((i / ROWS) * 100).toFixed(0).padStart(2);
  console.log(`${pct}% ${row}`);
});
