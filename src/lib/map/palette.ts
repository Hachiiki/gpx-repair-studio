/**
 * Map overlay palette (Phase 12 — dark mode).
 *
 * Ink & Signal rule the canvas (Task 29): the recorded route is INK
 * (the watch's truth, immutable), everything the app creates is
 * SIGNAL, gap spans are a SHADE ramp — heavier ink = heavier problem
 * (severity also carried by dash pattern + markers + legend, never
 * color alone).
 *
 * Phase 12: "ink" and "the shade ramp" flip with the theme (a light
 * line on the darkened basemap, a light severity ramp), signal holds
 * in both. The values are plain color strings (MapLibre paint values
 * cannot read CSS variables), so the palette is selected by the
 * controller at layer-add time and by the legend from the resolved
 * theme — one definition, two readers, no drift.
 *
 * Purity: plain data only — safe to import from node-side unit tests.
 */

export interface MapSeverityRamp {
  severe: string;
  suspect: string;
  info: string;
}

/** The heatmap's color ramp (Phase 25 — theme-dependent stops). */
export interface MapHeatmapRamp {
  /**
   * Six interpolate stops keyed to heatmap-density 0…1: transparent →
   * cool → hot. The values are plain color strings (MapLibre paint
   * values cannot read CSS variables); the legend builds its gradient
   * swatch from the same stops — one definition, two readers, no drift.
   */
  readonly stops: readonly string[];
}

export interface MapOverlayPalette {
  /** The recorded route (solid line) — ink in both themes' roles. */
  readonly route: string;
  /** Committed reconstructions — the signal orange, both themes. */
  readonly recon: string;
  /** The draft chain — the same signal at reduced alpha. */
  readonly reconDraft: string;
  /**
   * Phase 19 — the ORIGINAL track's ghost (compare overlay): a muted
   * theme-dependent gray that reads as "was here" under the working
   * copy's ink without competing with the severity ramp.
   */
  readonly ghost: string;
  /** Gap-span + boundary-marker severity ramp. */
  readonly severity: MapSeverityRamp;
  /**
   * Marker/handle paper — the halo fills and strokes that make
   * markers read over both the route and the basemap. White in both
   * themes: on the darkened basemap a white halo is still the
   * loudest possible paper, which is exactly its job.
   */
  readonly markerPaper: string;
  /** Phase 25 — the heatmap layer's density ramp (light/dark). */
  readonly heatmap: MapHeatmapRamp;
}

export const MAP_OVERLAY_PALETTE_LIGHT: MapOverlayPalette = {
  route: "#222222",
  recon: "#FC4C02",
  reconDraft: "rgba(252,76,2,0.85)",
  ghost: "#75706B",
  severity: {
    severe: "#000000",
    suspect: "#5A5A5A",
    info: "rgba(90,90,90,0.55)",
  },
  markerPaper: "#ffffff",
  heatmap: {
    // Indigo → sky → teal → amber → red on the cream basemap: the
    // classic cool-to-hot reading without saturating the light map.
    stops: [
      "rgba(34,34,34,0)",
      "rgba(99,102,241,0.28)",
      "rgba(14,165,233,0.45)",
      "rgba(13,148,136,0.62)",
      "rgba(245,158,11,0.8)",
      "rgba(203,32,32,0.88)",
    ],
  },
};

export const MAP_OVERLAY_PALETTE_DARK: MapOverlayPalette = {
  route: "#EDEBE8",
  recon: "#FC4C02",
  reconDraft: "rgba(252,76,2,0.9)",
  ghost: "#C7C2BB",
  severity: {
    severe: "#FFFFFF",
    suspect: "#A8A8A8",
    info: "rgba(216,216,216,0.55)",
  },
  markerPaper: "#ffffff",
  heatmap: {
    // Deep indigo → violet → fuchsia → SIGNAL orange → yellow core:
    // the hottest cells end in the app's own signal color, so a
    // well-ridden road reads the way the app marks its own work.
    stops: [
      "rgba(237,235,232,0)",
      "rgba(49,46,129,0.55)",
      "rgba(109,40,217,0.65)",
      "rgba(217,70,239,0.72)",
      "rgba(252,76,2,0.82)",
      "rgba(250,204,21,0.95)",
    ],
  },
};

/** The overlay palette for the current theme. */
export function mapOverlayPalette(dark: boolean): MapOverlayPalette {
  return dark ? MAP_OVERLAY_PALETTE_DARK : MAP_OVERLAY_PALETTE_LIGHT;
}
