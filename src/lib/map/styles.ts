/**
 * Tile-provider & basemap style configuration (docs/MASTER_PLAN.md §E-1,
 * Phase 3 scope: "tile provider config (OpenFreeMap default, OSM raster
 * option, blank test style)").
 *
 * Three providers:
 *   - `openfreemap` — vector tiles, no API key, no tracking, no rate limit
 *     (the product default; avoids usage-policy pressure on
 *     tile.openstreetmap.org from app traffic).
 *   - `osm-raster`  — opt-in fallback with an in-app usage-policy note.
 *   - `blank`       — offline/test style: plain background, zero network.
 *     Never user-selectable; used by the map controller as the graceful
 *     degradation when a remote style cannot be fetched, so the recorded
 *     route and gap overlays stay visible even fully offline.
 *
 * Purity: this module contains only plain data + `import type` from
 * `maplibre-gl` (erased at compile time — no runtime dependency, safe to
 * import from node-side unit tests and from the persisted settings store).
 *
 * Phase 3 — Map Display.
 */

import type { StyleSpecification } from "maplibre-gl";

export type TileProviderId = "openfreemap" | "osm-raster" | "blank";

/** Definition of one basemap provider. */
export interface TileProviderDefinition {
  id: TileProviderId;
  /** User-facing label (toolbar / legend). */
  label: string;
  /** Style URL (vector) or inline `StyleSpecification` (raster / blank). */
  style: string | StyleSpecification;
  /** Data attribution string for the provider's tiles. */
  attribution: string;
  /** Short user-facing note (usage policy / privacy), shown in the picker. */
  note: string;
  /** `false` for the blank style (tests + offline fallback only). */
  userSelectable: boolean;
}

/**
 * Local, network-free basemap. Used when a remote style fails to load
 * (offline / blocked) and by E2E when network access is unavailable — the
 * GeoJSON route/gap layers render on top of it either way.
 */
export const BLANK_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    {
      id: "background",
      type: "background",
      paint: { "background-color": "#dfe5ec" },
    },
  ],
};

export const MAP_TILE_PROVIDERS: Record<
  TileProviderId,
  TileProviderDefinition
> = {
  openfreemap: {
    id: "openfreemap",
    label: "OpenFreeMap (Liberty)",
    style: "https://tiles.openfreemap.org/styles/liberty",
    attribution: "© OpenStreetMap contributors",
    note: "Free vector tiles — no API key, no tracking, no rate limit.",
    userSelectable: true,
  },
  "osm-raster": {
    id: "osm-raster",
    label: "OSM Standard (raster)",
    style: {
      version: 8,
      sources: {
        "osm-raster-tiles": {
          type: "raster",
          tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
          tileSize: 256,
          attribution: "© OpenStreetMap contributors",
        },
      },
      layers: [
        { id: "osm-raster", type: "raster", source: "osm-raster-tiles" },
      ],
    },
    attribution: "© OpenStreetMap contributors",
    note:
      "Standard OSM raster tiles — strict usage policies apply. " +
      "Prefer OpenFreeMap for regular use.",
    userSelectable: true,
  },
  blank: {
    id: "blank",
    label: "No basemap (offline)",
    style: BLANK_STYLE,
    attribution: "GPX Repair Studio — local rendering",
    note: "Plain background; the route and gaps still render.",
    userSelectable: false,
  },
};

export const DEFAULT_TILE_PROVIDER: TileProviderId = "openfreemap";

/** A provider entry as shown in the UI picker (blank excluded). */
export interface TileProviderOption {
  id: TileProviderId;
  label: string;
  note: string;
}

/** User-selectable providers for the basemap picker. */
export const USER_TILE_PROVIDER_OPTIONS: readonly TileProviderOption[] = (
  Object.values(MAP_TILE_PROVIDERS) as TileProviderDefinition[]
)
  .filter((provider) => provider.userSelectable)
  .map(({ id, label, note }) => ({ id, label, note }));
