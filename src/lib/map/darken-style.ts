/**
 * Basemap darkening (Phase 12 — dark mode).
 *
 * OpenFreeMap ships no dark style (liberty / bright / positron are
 * all light), so the dark basemap is derived at runtime from whatever
 * style loaded: each basemap layer's plain color paint values are
 * re-mapped through a per-layer-type luminance transform, and raster
 * layers get MapLibre's brightness/saturation paint properties. This
 * is the "token-aware dimmed canvas" the plan called for — no extra
 * network request, no second tile provider, and it works for the
 * offline blank fallback too.
 *
 * The transform is per layer TYPE, because a single monotonic flip
 * cannot produce a map: on light positron the land is near-white and
 * the labels near-black — in the dark map the land must go dark while
 * the labels go light (an order inversion), but the roads (white on
 * light land) must STAY lighter than the land (order preserved). So:
 *
 *   - background / fill / circle / fill-extrusion → compressed dark:
 *       L' = 0.03 + L × 0.15   (near-white land ≈ #050505–#2B2B2B),
 *       saturation muted to 60% so water/park hues survive quietly
 *   - line (roads) → slightly lighter than fills:
 *       L' = 0.13 + L × 0.17, saturation 70%
 *   - symbol (labels + halos) → light text on a dark halo:
 *       L' = 0.72 + (1 − L) × 0.22, halos ride the fill curve
 *
 * Only STRING color values are transformed — data-driven expressions
 * (arrays) and anything unparsable are left untouched, so exotic
 * styles degrade to "partially darkened" instead of broken. Our own
 * overlay layers (the gpxr-* ids) are skipped; they are themed by
 * lib/map/palette.ts instead.
 *
 * Purity: no maplibre import, no DOM — everything here is testable
 * from node. The controller applies the returned updates through
 * setPaintProperty after each style load.
 */

/** A paint-property update the controller should apply. */
export interface DarkPaintUpdate {
  layerId: string;
  property: string;
  value: string | number;
}

/** The minimal layer shape needed for planning the updates. */
export interface StyleLayerRef {
  id: string;
  type: string;
}

/** Which paint properties carry colors, per layer type (raster is
 * handled separately — brightness dims, not color flips). */
const COLOR_PROPERTIES: Record<string, readonly string[]> = {
  background: ["background-color"],
  fill: ["fill-color", "fill-outline-color"],
  line: ["line-color"],
  circle: ["circle-color", "circle-stroke-color"],
  "fill-extrusion": ["fill-extrusion-color"],
  symbol: ["text-color", "text-halo-color", "icon-color", "icon-halo-color"],
};

/** Raster dimming (MapLibre raster paint properties). */
const RASTER_DIM: readonly DarkPaintUpdate["value"][] = [
  0.06, // raster-brightness-min
  0.45, // raster-brightness-max
];

/** True for layers this app owns (themed by palette, never darkened). */
function isOwnedLayer(id: string): boolean {
  return id.startsWith("gpxr-");
}

/** Parse a CSS color string into [r, g, b, a] (0–1); null if unsupported. */
function parseColor(color: string): [number, number, number, number] | null {
  const value = color.trim().toLowerCase();
  if (value === "transparent") return [0, 0, 0, 0];

  // Hex: #rgb #rgba #rrggbb #rrggbbaa
  if (/^#[0-9a-f]+$/.test(value)) {
    const digits = value.slice(1);
    if (digits.length === 3 || digits.length === 4) {
      const expanded = [...digits].map((d) => parseInt(d + d, 16) / 255);
      if (digits.length === 3) return [expanded[0], expanded[1], expanded[2], 1];
      return [expanded[0], expanded[1], expanded[2], expanded[3]];
    }
    if (digits.length === 6 || digits.length === 8) {
      const bytes = [
        parseInt(digits.slice(0, 2), 16) / 255,
        parseInt(digits.slice(2, 4), 16) / 255,
        parseInt(digits.slice(4, 6), 16) / 255,
      ];
      const alpha =
        digits.length === 8 ? parseInt(digits.slice(6, 8), 16) / 255 : 1;
      return [bytes[0], bytes[1], bytes[2], alpha];
    }
    return null;
  }

  // rgb() / rgba() — comma or space separated, percent or 0-255.
  const rgbMatch = /^rgba?\(([^)]+)\)$/.exec(value);
  if (rgbMatch) {
    const parts = rgbMatch[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const channel = (part: string): number | null => {
      if (part.endsWith("%")) {
        const pct = Number(part.slice(0, -1));
        return Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) / 100 : null;
      }
      const n = Number(part);
      return Number.isFinite(n) ? Math.min(255, Math.max(0, n)) / 255 : null;
    };
    const r = channel(parts[0]);
    const g = channel(parts[1]);
    const b = channel(parts[2]);
    const a = parts[3] !== undefined ? Number(parts[3]) : 1;
    if (r === null || g === null || b === null || !Number.isFinite(a)) return null;
    return [r, g, b, Math.min(1, Math.max(0, a))];
  }

  // hsl() / hsla() — hue deg, s%, l%.
  const hslMatch = /^hsla?\(([^)]+)\)$/.exec(value);
  if (hslMatch) {
    const parts = hslMatch[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const h = Number(parts[0].replace(/deg$/, ""));
    const s = Number(parts[1].replace("%", ""));
    const l = Number(parts[2].replace("%", ""));
    const a = parts[3] !== undefined ? Number(parts[3]) : 1;
    if (![h, s, l].every(Number.isFinite) || !Number.isFinite(a)) return null;
    const [r, g, b] = hslToRgb(
      ((h % 360) + 360) % 360,
      Math.min(100, Math.max(0, s)) / 100,
      Math.min(100, Math.max(0, l)) / 100,
    );
    return [r, g, b, Math.min(1, Math.max(0, a))];
  }

  return null; // named colors / color-mix / etc. — leave untouched
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let rgb: [number, number, number] = [0, 0, 0];
  if (hp < 1) rgb = [c, x, 0];
  else if (hp < 2) rgb = [x, c, 0];
  else if (hp < 3) rgb = [0, c, x];
  else if (hp < 4) rgb = [0, x, c];
  else if (hp < 5) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  const m = l - c / 2;
  return [rgb[0] + m, rgb[1] + m, rgb[2] + m];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return [h, s, l];
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

function toHexByte(v: number): string {
  return Math.round(clamp01(v) * 255)
    .toString(16)
    .padStart(2, "0");
}

/** Serialize back to the input's format family (hex in → hex out). */
function serialize(
  rgb: [number, number, number, number],
  preferHex: boolean,
): string {
  const [r, g, b, a] = rgb;
  if (preferHex) {
    if (a >= 1) return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`;
    return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}${toHexByte(a)}`;
  }
  const c = (v: number) => Math.round(clamp01(v) * 255);
  return `rgba(${c(r)},${c(g)},${c(b)},${Number(a.toFixed(3))})`;
}

/** The per-type luminance curves (see the module doc). */
function curveForLayer(
  layerType: string,
  property: string,
): ((l: number) => number) | null {
  if (layerType === "symbol") {
    return property.includes("halo")
      ? (l) => 0.03 + l * 0.1
      : (l) => 0.72 + (1 - l) * 0.22;
  }
  if (layerType === "line") return (l) => 0.13 + l * 0.17;
  return (l) => 0.03 + l * 0.15;
}

/** Saturation multiplier per layer type. */
function saturationForLayer(layerType: string): number {
  if (layerType === "symbol") return 1;
  if (layerType === "line") return 0.7;
  return 0.6;
}

/**
 * Flip one color string for the dark theme; returns the input
 * unchanged when it cannot be parsed (the conservative path).
 */
export function flipColorForDark(
  color: string,
  layerType = "fill",
  property = "",
): string {
  const parsed = parseColor(color);
  if (!parsed) return color;
  const curve = curveForLayer(layerType, property);
  if (!curve) return color;
  const [r, g, b, a] = parsed;
  const [h, s, l] = rgbToHsl(r, g, b);
  const nextL = clamp01(curve(l));
  const nextS = clamp01(s * saturationForLayer(layerType));
  const [nr, ng, nb] = hslToRgb(h, nextS, nextL);
  return serialize([nr, ng, nb, a], color.trim().startsWith("#"));
}

/**
 * Plan every paint update needed to darken a loaded style. The
 * accessor reads the CURRENT paint value (map.getPaintProperty
 * post-load — it resolves defaults the style spec omits); string
 * colors are flipped, raster layers are dimmed, anything else is
 * left alone. `layers` is `map.getStyle().layers`.
 */
export function collectDarkPaintUpdates(
  getPaintProperty: (layerId: string, property: string) => unknown,
  layers: readonly StyleLayerRef[],
): DarkPaintUpdate[] {
  const updates: DarkPaintUpdate[] = [];
  for (const layer of layers) {
    if (isOwnedLayer(layer.id)) continue;
    if (layer.type === "raster") {
      // Raster tiles cannot be recolored — dim them through MapLibre's
      // brightness/saturation paints instead.
      updates.push({ layerId: layer.id, property: "raster-brightness-min", value: RASTER_DIM[0] });
      updates.push({ layerId: layer.id, property: "raster-brightness-max", value: RASTER_DIM[1] });
      updates.push({ layerId: layer.id, property: "raster-saturation", value: -0.25 });
      updates.push({ layerId: layer.id, property: "raster-contrast", value: 0.08 });
      continue;
    }
    const properties = COLOR_PROPERTIES[layer.type];
    if (!properties) continue;
    for (const property of properties) {
      const current = getPaintProperty(layer.id, property);
      if (typeof current !== "string") continue;
      const next = flipColorForDark(current, layer.type, property);
      if (next !== current) {
        updates.push({ layerId: layer.id, property, value: next });
      }
    }
  }
  return updates;
}
