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
};

/** The overlay palette for the current theme. */
export function mapOverlayPalette(dark: boolean): MapOverlayPalette {
  return dark ? MAP_OVERLAY_PALETTE_DARK : MAP_OVERLAY_PALETTE_LIGHT;
}
