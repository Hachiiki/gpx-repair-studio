/**
 * Unit tests — basemap tile-provider registry (lib/map/styles.ts) and the
 * vendored MapLibre worker assets it depends on.
 *
 * Includes the sync guard for `public/vendor/`: the worker copies must
 * match `node_modules/maplibre-gl` byte-for-byte (a dependency upgrade
 * without re-running `bun run sync:maplibre-worker` fails here, not in
 * the browser at runtime).
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BLANK_STYLE,
  DEFAULT_TILE_PROVIDER,
  MAP_TILE_PROVIDERS,
  USER_TILE_PROVIDER_OPTIONS,
  type TileProviderDefinition,
} from "@/lib/map/styles";

const PROVIDERS = Object.values(MAP_TILE_PROVIDERS) as TileProviderDefinition[];

describe("tile provider registry", () => {
  it("defines exactly the three planned providers with stable ids", () => {
    expect(PROVIDERS.map((p) => p.id).sort()).toEqual([
      "blank",
      "openfreemap",
      "osm-raster",
    ]);
  });

  it("every provider carries label, attribution, note, and a style", () => {
    for (const provider of PROVIDERS) {
      expect(provider.label.length).toBeGreaterThan(0);
      expect(provider.attribution.length).toBeGreaterThan(0);
      expect(provider.note.length).toBeGreaterThan(0);
      expect(provider.style).toBeDefined();
    }
  });

  it("OpenFreeMap (default) uses the key-free vector style URL", () => {
    const ofm = MAP_TILE_PROVIDERS.openfreemap;
    expect(DEFAULT_TILE_PROVIDER).toBe("openfreemap");
    expect(ofm.userSelectable).toBe(true);
    expect(typeof ofm.style).toBe("string");
    expect(ofm.style).toMatch(/^https:\/\/tiles\.openfreemap\.org\/styles\//);
  });

  it("OSM raster is an inline style with attribution on the source", () => {
    const osm = MAP_TILE_PROVIDERS["osm-raster"];
    expect(osm.userSelectable).toBe(true);
    expect(typeof osm.style).toBe("object");
    const style = osm.style as {
      sources: Record<string, { type: string; tiles: string[]; attribution?: string }>;
    };
    const source = Object.values(style.sources)[0];
    expect(source.type).toBe("raster");
    expect(source.tiles[0]).toMatch(/^https:\/\/tile\.openstreetmap\.org\//);
    expect(source.attribution).toContain("OpenStreetMap");
  });

  it("blank style is fully local: no sources, one background layer", () => {
    expect(BLANK_STYLE.sources).toEqual({});
    expect(BLANK_STYLE.layers).toHaveLength(1);
    expect(BLANK_STYLE.layers[0].type).toBe("background");
    expect(JSON.stringify(BLANK_STYLE)).not.toMatch(/https?:\/\//);
    expect(MAP_TILE_PROVIDERS.blank.userSelectable).toBe(false);
  });

  it("user-facing options exclude the blank fallback", () => {
    expect(USER_TILE_PROVIDER_OPTIONS.map((o) => o.id)).toEqual([
      "openfreemap",
      "osm-raster",
    ]);
    for (const option of USER_TILE_PROVIDER_OPTIONS) {
      expect(option.label.length).toBeGreaterThan(0);
      expect(option.note.length).toBeGreaterThan(0);
    }
  });
});

describe("vendored MapLibre worker assets (public/vendor)", () => {
  const projectRoot = process.cwd();
  const dist = join(projectRoot, "node_modules", "maplibre-gl", "dist");
  const vendor = join(projectRoot, "public", "vendor");

  const FILES = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

  it("public copies match node_modules byte-for-byte (sync guard)", () => {
    for (const name of FILES) {
      const fromDist = readFileSync(join(dist, name));
      const fromVendor = readFileSync(join(vendor, name));
      expect(fromVendor.equals(fromDist), `${name} out of sync — run \`bun run sync:maplibre-worker\``).toBe(
        true,
      );
    }
  });

  it("manifest records the installed version and correct hashes", () => {
    const manifest = JSON.parse(
      readFileSync(join(vendor, "maplibre-gl-worker.manifest.json"), "utf8"),
    ) as {
      version: string;
      files: Record<string, string>;
    };
    const pkg = JSON.parse(
      readFileSync(join(projectRoot, "node_modules", "maplibre-gl", "package.json"), "utf8"),
    ) as { version: string };
    expect(manifest.version).toBe(pkg.version);
    for (const name of FILES) {
      const hash = createHash("sha256")
        .update(readFileSync(join(vendor, name)))
        .digest("hex");
      expect(manifest.files[name]).toBe(hash);
    }
  });
});
