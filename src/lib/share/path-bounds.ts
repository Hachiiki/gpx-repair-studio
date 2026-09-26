/**
 * SVG path-data ink bounds (docs/MASTER_PLAN.md §O — Task 23).
 *
 * The share card's layout is specified against the artwork's INK (the
 * wordmark is "330×55"), but the source SVGs carry viewBoxes with
 * unknown internal padding. This module measures the actual path
 * bounds: a minimal command walker (M/L/H/V/C/S/Q/T/Z, both cases,
 * implicit coordinate repeats) that tracks the current point and
 * visits every on-curve and control coordinate.
 *
 * Control points slightly over-estimate curve extremes (they can lie
 * outside the curve), but at the artwork's scale the difference is
 * sub-unit — and the layout maps ink→target-box through the SAME
 * numbers, so any over-estimate cancels in the placement math.
 *
 * Pure math on strings — no DOM — so node-side tests pin the artwork's
 * ink constants (artwork.ts carries them as data; the browser bundle
 * never ships this parser).
 */

import type { VectorArtwork } from "@/lib/share/artwork";

/** Axis-aligned bounds in a path's own coordinate space. */
export interface PathBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const COMMAND = /[MmLlHhVvCcSsQqTtZz][^MmLlHhVvCcSsQqTtHhVvZz]*/g;
const NUMBER = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi;

function numbers(token: string): number[] {
  const out: number[] = [];
  NUMBER.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = NUMBER.exec(token)) !== null) out.push(parseFloat(match[0]));
  return out;
}

/**
 * Bounds of one path's drawable geometry, or `null` when the path
 * carries no coordinates at all.
 */
export function pathDataBounds(d: string): PathBounds | null {
  const tokens = d.match(COMMAND);
  if (tokens === null) return null;

  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const visit = (x: number, y: number): void => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };

  for (const token of tokens) {
    const command = token[0];
    const relative = command === command.toLowerCase();
    const args = numbers(token.slice(1));
    switch (command.toLowerCase()) {
      case "m": {
        for (let i = 0; i + 1 < args.length; i += 2) {
          const x = relative ? cx + args[i] : args[i];
          const y = relative ? cy + args[i + 1] : args[i + 1];
          visit(x, y);
          cx = startX = x;
          cy = startY = y;
        }
        break;
      }
      case "l":
      case "t": {
        for (let i = 0; i + 1 < args.length; i += 2) {
          const x = relative ? cx + args[i] : args[i];
          const y = relative ? cy + args[i + 1] : args[i + 1];
          visit(x, y);
          cx = x;
          cy = y;
        }
        break;
      }
      case "h": {
        for (const arg of args) {
          cx = relative ? cx + arg : arg;
          visit(cx, cy);
        }
        break;
      }
      case "v": {
        for (const arg of args) {
          cy = relative ? cy + arg : arg;
          visit(cx, cy);
        }
        break;
      }
      case "c": {
        for (let i = 0; i + 5 < args.length; i += 6) {
          const x1 = relative ? cx + args[i] : args[i];
          const y1 = relative ? cy + args[i + 1] : args[i + 1];
          const x2 = relative ? cx + args[i + 2] : args[i + 2];
          const y2 = relative ? cy + args[i + 3] : args[i + 3];
          const x = relative ? cx + args[i + 4] : args[i + 4];
          const y = relative ? cy + args[i + 5] : args[i + 5];
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
        for (let i = 0; i + 3 < args.length; i += 4) {
          const x1 = relative ? cx + args[i] : args[i];
          const y1 = relative ? cy + args[i + 1] : args[i + 1];
          const x = relative ? cx + args[i + 2] : args[i + 2];
          const y = relative ? cy + args[i + 3] : args[i + 3];
          visit(x1, y1);
          visit(x, y);
          cx = x;
          cy = y;
        }
        break;
      }
      case "z": {
        cx = startX;
        cy = startY;
        break;
      }
      default:
        break;
    }
  }

  if (minX === Infinity) return null;
  return { minX, minY, maxX, maxY };
}

/** An artwork's ink bounds expressed in viewBox units. */
export interface ArtworkInk {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The ink bounds of a whole artwork: the union of its paths' bounds in
 * source coordinates, mapped through the SVG's baked group transform
 * (viewBox_x = scale · src_x, viewBox_y = translateY − scale · src_y).
 */
export function artworkInkBounds(artwork: VectorArtwork): ArtworkInk {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const d of artwork.paths) {
    const bounds = pathDataBounds(d);
    if (bounds === null) continue;
    minX = Math.min(minX, bounds.minX);
    minY = Math.min(minY, bounds.minY);
    maxX = Math.max(maxX, bounds.maxX);
    maxY = Math.max(maxY, bounds.maxY);
  }
  if (minX === Infinity) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const { scale, translateY } = artwork.sourceTransform;
  // Source Y grows the opposite way from viewBox Y (the flip).
  const x = scale * minX;
  const y = translateY - scale * maxY;
  return { x, y, width: scale * (maxX - minX), height: scale * (maxY - minY) };
}
