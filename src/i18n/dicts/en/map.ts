/**
 * English dictionary — map legend, map controls, road-snap consent (Phase 21).
 *
 * Extracted from the map domain's components. Keys are namespaced
 * `map.*`. English values are the app's existing copy, moved
 * VERBATIM — the dictionary is the contract every locale checks
 * against.
 */

export const map = {
  /** map-canvas.tsx — the MapLibre container, status overlays, chrome. */
  "map.canvas.applicationAria":
    "Interactive map of the recorded route and its gaps",
  "map.canvas.loading": "Loading map…",
  "map.canvas.unavailableTitle": "Map unavailable",
  "map.canvas.unavailableBody":
    "This browser or device cannot render the interactive map (WebGL is unavailable or disabled). All inspection and repair features remain fully usable through the panels.",
  "map.canvas.recordedExtent": "Recorded extent: {extent}",
  "map.canvas.extentUnknown": "unknown",
  "map.canvas.extentRange":
    "lat {minLat} to {maxLat}, lon {minLon} to {maxLon}",
  "map.canvas.offlineNotice":
    "Basemap tiles unavailable — you may be offline. The recorded route and gaps are still shown.",
  "map.canvas.retry": "Retry",
  "map.canvas.emptyRoute":
    "No renderable route points — all recorded coordinates are damaged.",
  "map.canvas.pointerModeAria": "Pointer mode: {state}",
  "map.canvas.modeStateDraw": "drawing — click to switch to move",
  "map.canvas.modeStateMove": "moving points — click to switch to pan",
  "map.canvas.modeStatePan": "panning — click to switch to draw",
  "map.canvas.titleDrawCurve":
    "Draw mode, Curve pen — drag to draw a curve (D, C switches pens)",
  "map.canvas.titleDraw": "Draw mode — click to add points (D)",
  "map.canvas.titleMove": "Move mode — drag any point (M)",
  "map.canvas.titlePan": "Pan mode — drag to navigate (P)",
  "map.canvas.chipCurve": "Curve pen",
  "map.canvas.chipDraw": "Drawing",
  "map.canvas.chipMove": "Moving",
  "map.canvas.chipPan": "Panning",
  "map.canvas.pickAnchor":
    "Click where the missing route goes — it anchors to the route's nearest end · Esc cancels",
  "map.canvas.pickPair": "Pick two points on the recorded route — Esc cancels",

  /** map-canvas.tsx — Phase 25: the segment draft chip. */
  "map.canvas.segmentPick":
    "Pick the segment's start and end on the track — Esc cancels",
  "map.canvas.segmentDraw": "{count} points placed",
  "map.canvas.segmentConfirm": "Use these points",
  "map.canvas.segmentCancel": "Cancel",
  "map.canvas.srSummary":
    "Map panel: {segments}, {points}, {gaps}. Recorded extent: {extent}. Select gaps from the detected-gaps list to highlight and focus them on the map.",
  "map.canvas.srSegmentsOne": "{count} segment",
  "map.canvas.srSegmentsMany": "{count} segments",
  "map.canvas.srPointsOne": "{count} renderable recorded point",
  "map.canvas.srPointsMany": "{count} renderable recorded points",
  "map.canvas.srGapsOne": "{count} detected gap",
  "map.canvas.srGapsMany": "{count} detected gaps",
  "map.canvas.srReconstructionOne":
    " Reconstruction in progress: {count} drawn point.",
  "map.canvas.srReconstructionMany":
    " Reconstruction in progress: {count} drawn points.",

  /** map-legend.tsx — the visual-encoding legend (color-blind safety). */
  "map.legend.ghost": "Original track (ghost — before edits)",
  "map.legend.changed": "Changed stretch of the original",
  "map.legend.recorded": "Recorded route (solid ink)",
  "map.legend.gapSpan": "Gap span (dashed, severity shades)",
  "map.legend.gapBoundaries": "Gap boundaries (ring = before, dot = after)",
  "map.legend.repaired": "Repaired route (solid orange)",
  "map.legend.footpath": "Footpath repair (dashed — drawn with Footpaths)",
  "map.legend.openConnection": "Open connection (closes on finish)",
  "map.legend.drawnPoint": "Drawn point (drag in Move mode)",
  "map.legend.toggleAria": "Map legend",
  "map.legend.toggleTitle": "What the map lines mean",
  "map.legend.toggle": "Legend",
  "map.legend.heatmap": "Your saved tracks (heat density)",

  /** map-toolbar.tsx — the right-edge tool rail. */
  "map.toolbar.railAria": "Map tools",
  "map.toolbar.pointerGroupAria": "Pointer mode",
  "map.toolbar.drawTitle": "Draw mode",
  "map.toolbar.drawDescription":
    "Click anywhere on the map to add points; double-click a point to delete it. With the Curve pen (C), press and drag to draw a curve freehand. The map stops panning while you draw.",
  "map.toolbar.moveTitle": "Move mode",
  "map.toolbar.moveDescription":
    "Rearrange what you drew — every point grows into a big grab target you can drag anywhere. Clicks add nothing here, and empty-space drags still pan the map.",
  "map.toolbar.panTitle": "Pan mode",
  "map.toolbar.panDescription":
    "Normal map navigation — drag to pan, double-click to zoom. Switch to Move (M) to drag a drawn point; drawing new ones needs Draw (D).",
  "map.toolbar.basemapTitle": "Basemap",
  "map.toolbar.basemapDescription":
    "Switch the background map — vector OpenFreeMap or classic OSM raster. Only tiles are fetched; never your GPX.",
  "map.toolbar.basemapAria": "Basemap provider",
  "map.toolbar.basemapTiles": "Basemap tiles",
  "map.toolbar.basemapFootnote":
    "Only map tiles are fetched from the network — never your GPX data.",
  "map.toolbar.fitTitle": "Fit activity",
  "map.toolbar.fitDescription":
    "Zoom back out to the whole recorded route — handy after zooming into a gap.",
  "map.toolbar.fitAria": "Fit activity in view",

  /** map-toolbar.tsx — Phase 25: the library heatmap toggle. */
  "map.toolbar.heatmapTitle": "Heatmap",
  "map.toolbar.heatmapDescription":
    "Every saved session's track as a density wash under the route — where you have been, computed on this device.",
  "map.toolbar.heatmapPending":
    "Indexing your saved sessions — the wash appears as each one lands.",
  "map.toolbar.heatmapAria": "Toggle the saved-sessions heatmap",

  /** draw-distance-badge.tsx — the live editor readout chip. */
  "map.drawBadge.vertexCount": "{vertices}/{max} pts",
  "map.drawBadge.roadLengthNote": "road length, not straight line",

  /** gap-highlight-overlay.tsx — the selected-gap chip. */
  "map.gapChip.elapsed": "Elapsed",
  "map.gapChip.straightLine": "Straight-line",
  "map.gapChip.impliedSpeed": "Implied speed",
  "map.gapChip.note":
    "The path between the markers was not recorded — it will be drawn in a later step.",
  "map.gapChip.clearAria": "Clear gap selection",

  "map.announce.pointDeleted": "Point deleted.",
} as const;
