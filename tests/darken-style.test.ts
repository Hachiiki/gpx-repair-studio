/**
 * Phase 12 — the basemap darkening engine (src/lib/map/darken-style.ts).
 *
 * The color math is pinned with hand-computed expectations, and the
 * layer walk is pinned against a fake positron-shaped style: plain
 * string colors flip per layer type, raster layers get brightness
 * dims, expressions are left alone, and our own gpxr-* layers are
 * never touched.
 */

import { describe, expect, it } from "vitest";
import {
  collectDarkPaintUpdates,
  flipColorForDark,
} from "@/lib/map/darken-style";
import { mapOverlayPalette } from "@/lib/map/palette";

describe("flipColorForDark", () => {
  it("flips a near-white hex fill to a near-black hex (fill curve)", () => {
    // Positron's land: #f8f4f0-ish. L ≈ 0.957 → 0.03 + 0.957×0.15 ≈ 0.174.
    const flipped = flipColorForDark("#f8f4f0", "fill", "fill-color");
    expect(flipped).toMatch(/^#[0-9a-f]{6}$/);
    // Dark: every channel well below 0x60.
    const r = parseInt(flipped.slice(1, 3), 16);
    const g = parseInt(flipped.slice(3, 5), 16);
    const b = parseInt(flipped.slice(5, 7), 16);
    expect(r).toBeLessThan(0x60);
    expect(g).toBeLessThan(0x60);
    expect(b).toBeLessThan(0x60);
  });

  it("keeps lines lighter than fills (roads read as raised)", () => {
    const white = "#ffffff";
    const asFill = flipColorForDark(white, "fill", "fill-color");
    const asLine = flipColorForDark(white, "line", "line-color");
    const lum = (hex: string) => {
      const r = parseInt(hex.slice(1, 3), 16) / 255;
      const g = parseInt(hex.slice(3, 5), 16) / 255;
      const b = parseInt(hex.slice(5, 7), 16) / 255;
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    expect(lum(asLine)).toBeGreaterThan(lum(asFill));
  });

  it("flips dark label text to light (symbol curve)", () => {
    // Positron labels: near-black. L ≈ 0.13 → 0.72 + 0.87×0.22 ≈ 0.91.
    const flipped = flipColorForDark("#1a1a1a", "symbol", "text-color");
    const r = parseInt(flipped.slice(1, 3), 16);
    expect(r).toBeGreaterThan(0xb0);
  });

  it("flips symbol HALOS onto the fill curve (dark halos)", () => {
    const flipped = flipColorForDark("#ffffff", "symbol", "text-halo-color");
    const r = parseInt(flipped.slice(1, 3), 16);
    expect(r).toBeLessThan(0x60);
  });

  it("preserves alpha for rgba() inputs", () => {
    const flipped = flipColorForDark("rgba(248,244,240,0.6)", "fill", "fill-color");
    expect(flipped).toMatch(/^rgba\(/);
    expect(flipped).toContain("0.6");
  });

  it("passes unparsable values through untouched", () => {
    expect(flipColorForDark("currentColor", "fill", "fill-color")).toBe(
      "currentColor",
    );
    expect(flipColorForDark("color-mix(in srgb, red, blue)", "fill", "fill-color")).toBe(
      "color-mix(in srgb, red, blue)",
    );
  });

  it("handles hsl() inputs and short hex", () => {
    const hsl = flipColorForDark("hsl(210, 40%, 90%)", "fill", "fill-color");
    expect(hsl).toMatch(/^rgba\(/);
    const short = flipColorForDark("#fff", "line", "line-color");
    expect(short).toMatch(/^#/);
  });
});

describe("collectDarkPaintUpdates", () => {
  /** A positron-shaped fake style: fills, lines, symbols, one raster. */
  const fakeStyle = {
    layers: [
      { id: "background", type: "background", paint: { "background-color": "#fafaf8" } },
      { id: "landcover", type: "fill", paint: { "fill-color": "#e8efd8" } },
      { id: "water", type: "fill", paint: { "fill-color": "#d4dadc" } },
      { id: "road-minor", type: "line", paint: { "line-color": "#ffffff" } },
      {
        id: "place-label",
        type: "symbol",
        paint: { "text-color": "#1a1a1a", "text-halo-color": "#ffffff" },
      },
      {
        id: "bridge",
        type: "line",
        paint: { "line-color": ["match", ["get", "class"], "motorway", "#ff0000", "#ffffff"] },
      },
      { id: "osm-raster", type: "raster", paint: {} },
      { id: "gpxr-route", type: "line", paint: { "line-color": "#222222" } },
    ],
  };

  const updates = collectDarkPaintUpdates(
    (layerId, property) =>
      (fakeStyle.layers as never as Record<string, never>[]).find(
        (layer) => (layer as unknown as { id: string }).id === layerId,
      )?.paint?.[property as never],
    fakeStyle.layers,
  );

  it("flips plain string colors across layer types", () => {
    const byKey = new Map(updates.map((u) => [`${u.layerId}:${u.property}`, u.value]));
    expect(byKey.get("background:background-color")).toMatch(/^#/);
    expect(byKey.get("water:fill-color")).toMatch(/^#/);
    expect(byKey.get("road-minor:line-color")).toMatch(/^#/);
    expect(byKey.get("place-label:text-color")).toMatch(/^#/);
    expect(byKey.get("place-label:text-halo-color")).toMatch(/^#/);
  });

  it("dims raster layers through brightness/saturation paints", () => {
    const raster = updates.filter((u) => u.layerId === "osm-raster");
    expect(raster.map((u) => u.property)).toContain("raster-brightness-min");
    expect(raster.map((u) => u.property)).toContain("raster-brightness-max");
    expect(raster.every((u) => typeof u.value === "number")).toBe(true);
  });

  it("leaves expression-valued colors and gpxr-* layers alone", () => {
    expect(updates.find((u) => u.layerId === "bridge")).toBeUndefined();
    expect(updates.find((u) => u.layerId === "gpxr-route")).toBeUndefined();
  });
});

describe("map overlay palette (src/lib/map/palette.ts)", () => {
  it("light: ink route, signal recon, dark severity ramp", () => {
    const light = mapOverlayPalette(false);
    expect(light.route).toBe("#222222");
    expect(light.recon).toBe("#FC4C02");
    expect(light.severity.severe).toBe("#000000");
    expect(light.markerPaper).toBe("#ffffff");
  });

  it("dark: light route + light severity ramp, signal holds", () => {
    const dark = mapOverlayPalette(true);
    expect(dark.route).not.toBe(dark.recon);
    expect(dark.route).toBe("#EDEBE8");
    expect(dark.recon).toBe("#FC4C02");
    expect(dark.severity.severe).toBe("#FFFFFF");
    // The severity ramp keeps its ORDER: severe darker (heavier) than
    // suspect in light; severe LIGHTER (heavier) than suspect in dark.
    const luminance = (hex: string) => parseInt(hex.slice(1, 3), 16);
    const light = mapOverlayPalette(false);
    expect(luminance(light.severity.severe)).toBeLessThan(
      luminance(light.severity.suspect),
    );
    expect(luminance(dark.severity.severe)).toBeGreaterThan(
      luminance(dark.severity.suspect),
    );
  });
});
