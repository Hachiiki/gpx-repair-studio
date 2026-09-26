/**
 * Measure the true ink (path-data) bounds of the share-card artwork.
 *
 * The SVGs in src/lib/share/artwork.ts carry viewBoxes with unknown
 * internal padding; layout decisions (e.g. "the wordmark is 330×55 on
 * the reference card") must be made against the INK bounds, not the
 * viewBox. This parses the path `d` strings with a minimal command
 * walker (M/L/C/S/Q/T/H/V/Z, both cases, implicit repeats) and maps
 * the source-space bounds through the artwork's baked transform:
 *
 *   viewBox_x = scale * src_x
 *   viewBox_y = translateY - scale * src_y
 *
 * Control points are included in the box (a superset of the true curve
 * bounds — at these sizes the difference is sub-unit).
 */
import { SHOE_ICON_ARTWORK, STRAVA_LOGO_ARTWORK } from "../src/lib/share/artwork.ts";

function parseNumbers(token) {
  const out = [];
  const re = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi;
  let m;
  while ((m = re.exec(token))) out.push(parseFloat(m[0]));
  return out;
}

function pathBBox(d) {
  // Tokenize: command letter followed by its coordinate blob.
  const tokens = d.match(/[MmLlCcSsQqTtHhVvZz][^MmLlCcSsQqTtHhVvZz]*/g) ?? [];
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const visit = (x, y) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };
  for (const token of tokens) {
    const cmd = token[0];
    const nums = parseNumbers(token.slice(1));
    const rel = cmd === cmd.toLowerCase();
    switch (cmd.toLowerCase()) {
      case "m": {
        for (let i = 0; i < nums.length; i += 2) {
          const x = rel ? cx + nums[i] : nums[i];
          const y = rel ? cy + nums[i + 1] : nums[i + 1];
          visit(x, y);
          cx = sx = x;
          cy = sy = y;
        }
        break;
      }
      case "l": {
        for (let i = 0; i < nums.length; i += 2) {
          const x = rel ? cx + nums[i] : nums[i];
          const y = rel ? cy + nums[i + 1] : nums[i + 1];
          visit(x, y);
          cx = x;
          cy = y;
        }
        break;
      }
      case "h": {
        for (const n of nums) {
          cx = rel ? cx + n : n;
          visit(cx, cy);
        }
        break;
      }
      case "v": {
        for (const n of nums) {
          cy = rel ? cy + n : n;
          visit(cx, cy);
        }
        break;
      }
      case "c": {
        for (let i = 0; i < nums.length; i += 6) {
          const x1 = rel ? cx + nums[i] : nums[i];
          const y1 = rel ? cy + nums[i + 1] : nums[i + 1];
          const x2 = rel ? cx + nums[i + 2] : nums[i + 2];
          const y2 = rel ? cy + nums[i + 3] : nums[i + 3];
          const x = rel ? cx + nums[i + 4] : nums[i + 4];
          const y = rel ? cy + nums[i + 5] : nums[i + 5];
          visit(x1, y1);
          visit(x2, y2);
          visit(x, y);
          cx = x;
          cy = y;
        }
        break;
      }
      case "s":
      case "q": {
        for (let i = 0; i < nums.length; i += 4) {
          const x1 = rel ? cx + nums[i] : nums[i];
          const y1 = rel ? cy + nums[i + 1] : nums[i + 1];
          const x = rel ? cx + nums[i + 2] : nums[i + 2];
          const y = rel ? cy + nums[i + 3] : nums[i + 3];
          visit(x1, y1);
          visit(x, y);
          cx = x;
          cy = y;
        }
        break;
      }
      case "t": {
        for (let i = 0; i < nums.length; i += 2) {
          const x = rel ? cx + nums[i] : nums[i];
          const y = rel ? cy + nums[i + 1] : nums[i + 1];
          visit(x, y);
          cx = x;
          cy = y;
        }
        break;
      }
      case "z": {
        cx = sx;
        cy = sy;
        break;
      }
      default:
        break;
    }
  }
  return { minX, minY, maxX, maxY };
}

function report(name, artwork) {
  const { scale, translateY } = artwork.sourceTransform;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const d of artwork.paths) {
    const b = pathBBox(d);
    minX = Math.min(minX, b.minX);
    minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX);
    maxY = Math.max(maxY, b.maxY);
  }
  // Source → viewBox: (scale*x, translateY - scale*y)
  const vb = {
    x: scale * minX,
    y: translateY - scale * maxY,
    width: scale * (maxX - minX),
    height: scale * (maxY - minY),
  };
  console.log(`\n${name}`);
  console.log(`  viewBox:  0 0 ${artwork.viewBoxWidth} ${artwork.viewBoxHeight}`);
  console.log(
    `  ink:      x ${vb.x.toFixed(2)}..${(vb.x + vb.width).toFixed(2)}  y ${vb.y.toFixed(2)}..${(vb.y + vb.height).toFixed(2)}`,
  );
  console.log(
    `  ink size: ${vb.width.toFixed(2)} × ${vb.height.toFixed(2)}  (aspect ${vb.width / vb.height} : 1)`,
  );
  console.log(
    `  padding:  left ${vb.x.toFixed(2)}  right ${(artwork.viewBoxWidth - vb.x - vb.width).toFixed(2)}  top ${vb.y.toFixed(2)}  bottom ${(artwork.viewBoxHeight - vb.y - vb.height).toFixed(2)}`,
  );
  console.log(
    `  ink at 330px wide → ${330} × ${((330 * vb.height) / artwork.viewBoxWidth).toFixed(2)}`,
  );
  console.log(
    `  ink at viewBox-width 600 → 600 × ${vb.height.toFixed(2)}`,
  );
}

report("STRAVA_LOGO_ARTWORK", STRAVA_LOGO_ARTWORK);
report("SHOE_ICON_ARTWORK", SHOE_ICON_ARTWORK);
