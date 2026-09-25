// @vitest-environment jsdom
/**
 * React Testing Library — the map panel's presentation layer:
 *
 *   - MapCanvas status overlays (initializing / unsupported / offline /
 *     empty route / ready chrome) rendered from a fake binding;
 *   - MapToolbar provider picker (options, usage-policy note, intents);
 *   - GapHighlightOverlay content and clear intent;
 *   - GapList selection sync (toggle, aria-pressed, data-selected).
 *
 * The MapLibre controller itself is browser-only (WebGL) and is covered by
 * the E2E suite via the controller's test bridge — here it is faked.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DrawDistanceBadge } from "@/components/map/draw-distance-badge";
import { GapHighlightOverlay } from "@/components/map/gap-highlight-overlay";
import { MapCanvas } from "@/components/map/map-canvas";
import { MapLegend } from "@/components/map/map-legend";
import { MapToolbar } from "@/components/map/map-toolbar";
import { GapList } from "@/components/reconstruction/gap-list";
import type { DrawEditorBinding } from "@/hooks/use-draw-editor";
import type { MapBinding } from "@/hooks/use-map-controller";
import type { GapRow, GapThresholds } from "@/hooks/use-gpx-session";
import { USER_TILE_PROVIDER_OPTIONS } from "@/lib/map/styles";
import type { BBox } from "@/lib/geo/bbox";
import type { GapId, VertexId } from "@/types/domain";

afterEach(() => cleanup());

const EXTENT: BBox = {
  minLat: 52.52,
  minLon: 13.4,
  maxLat: 52.53,
  maxLon: 13.41,
};

function makeBinding(
  overrides: Partial<MapBinding> = {},
): MapBinding {
  return {
    setContainer: () => {},
    status: "ready",
    offline: false,
    provider: "openfreemap",
    providers: USER_TILE_PROVIDER_OPTIONS,
    route: {
      lines: [
        {
          segmentId: "t0s0" as never,
          trackIndex: 0,
          coordinates: [
            [13.4, 52.52],
            [13.405, 52.521],
          ],
        },
      ],
      spans: [],
      markers: [],
      reconstructions: [],
      usablePointCount: 2,
    },
    selectedGapId: null,
    selectedGap: null,
    segmentCount: 1,
    gapCount: 0,
    extent: EXTENT,
    selectGap: () => {},
    setProvider: () => {},
    retryBasemap: () => {},
    fitToActivity: () => {},
    getController: () => null,
    ...overrides,
  };
}

/** A fake draw-editor binding for the MapCanvas chrome tests. */
function makeDrawBinding(
  overrides: Partial<DrawEditorBinding> = {},
): DrawEditorBinding {
  return {
    active: true,
    activeGap: GAP_ROW,
    drawMode: true,
    snapEnabled: true,
    roadFollow: "car",
    routingPending: false,
    routingFailed: false,
    vertices: [],
    vertexCount: 0,
    maxVertices: 128,
    atVertexCap: false,
    distanceM: 623.4,
    straightLine: false,
    resampleSpacing: "off",
    canUndo: false,
    canRedo: false,
    undoCount: 0,
    redoCount: 0,
    statusById: {},
    reconstructedCount: 0,
    skippedCount: 0,
    manualRows: [],
    pickMode: null,
    openEditor: () => {},
    closeEditor: () => {},
    beginPickAnchor: () => {},
    beginPickPair: () => {},
    cancelPickSpan: () => {},
    removeManualSpan: () => {},
    setDrawMode: () => {},
    setSnapEnabled: () => {},
    setRoadFollow: () => {},
    undo: () => {},
    redo: () => {},
    clearVertices: () => {},
    setResampleSpacing: () => {},
    toggleSkip: () => {},
    deleteVertex: (_vertexId: VertexId) => {},
    ...overrides,
  };
}

const GAP_ROW: GapRow = {
  id: "gap/t0s0:1/t0s0:2" as GapId,
  kind: "time-gap",
  severity: "severe",
  status: "new",
  elapsedMs: 300_000,
  impliedDistanceM: 142.5,
  impliedSpeed: 0.000475,
  before: {
    pointId: "t0s0:1" as never,
    segmentId: "t0s0" as never,
    lat: 52.5201,
    lon: 13.405,
  },
  after: {
    pointId: "t0s0:2" as never,
    segmentId: "t0s0" as never,
    lat: 52.5212,
    lon: 13.4061,
  },
};

describe("MapCanvas", () => {
  it("renders the map container with an accessible label", () => {
    render(<MapCanvas map={makeBinding()} attachContainer={() => {}} />);
    expect(screen.getByTestId("map-canvas")).toBeVisible();
    expect(
      screen.getByRole("application", {
        name: "Interactive map of the recorded route and its gaps",
      }),
    ).toBeVisible();
  });

  it("shows the initializing overlay before the map is ready", () => {
    render(
      <MapCanvas map={makeBinding({ status: "initializing" })} attachContainer={() => {}} />,
    );
    expect(screen.getByTestId("map-initializing")).toBeVisible();
    expect(screen.queryByTestId("map-toolbar")).toBeNull();
  });

  it("shows the WebGL fallback with the textual extent when unsupported", () => {
    render(
      <MapCanvas map={makeBinding({ status: "unsupported", route: null })} attachContainer={() => {}} />,
    );
    const fallback = screen.getByTestId("map-fallback");
    expect(fallback).toBeVisible();
    expect(fallback).toHaveTextContent("Map unavailable");
    expect(fallback).toHaveTextContent("WebGL");
    expect(fallback).toHaveTextContent("52.52000"); // extent text
  });

  it("shows the offline notice with a retry action when tiles fail", () => {
    const retry = vi.fn();
    render(
      <MapCanvas map={makeBinding({ offline: true, retryBasemap: retry })} attachContainer={() => {}} />,
    );
    const notice = screen.getByTestId("map-offline-notice");
    expect(notice).toBeVisible();
    expect(notice).toHaveTextContent("Basemap tiles unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("shows the empty-route note when nothing is renderable", () => {
    render(
      <MapCanvas
        map={makeBinding({
          route: {
            lines: [],
            spans: [],
            markers: [],
            reconstructions: [],
            usablePointCount: 0,
          },
        })}
        attachContainer={() => {}}
      />,
    );
    expect(screen.getByTestId("map-empty-route")).toBeVisible();
  });

  it("renders legend and toolbar when ready, plus the selected-gap chip", () => {
    render(
      <MapCanvas
        map={makeBinding({
          selectedGapId: GAP_ROW.id,
          selectedGap: GAP_ROW,
          gapCount: 1,
        })}
        attachContainer={() => {}}
      />,
    );
    expect(screen.getByTestId("map-legend")).toBeVisible();
    expect(screen.getByTestId("map-toolbar")).toBeVisible();
    const chip = screen.getByTestId("gap-highlight-overlay");
    expect(chip).toHaveTextContent("Time gap");
    expect(chip).toHaveTextContent("5:00"); // elapsed
    expect(chip).toHaveTextContent("143 m"); // straight-line (rounded)
  });

  it("exposes a screen-reader summary of the rendered route", () => {
    render(<MapCanvas map={makeBinding()} attachContainer={() => {}} />);
    const summary = screen.getByTestId("map-sr-summary");
    expect(summary).toHaveTextContent("1 segment");
    expect(summary).toHaveTextContent("2 renderable recorded points");
    expect(summary).toHaveTextContent("0 detected gaps");
  });
});

describe("MapToolbar", () => {
  it("lists both selectable providers with their notes and fires change", () => {
    const onProviderChange = vi.fn();
    const onFitActivity = vi.fn();
    render(
      <MapToolbar
        provider="openfreemap"
        providers={USER_TILE_PROVIDER_OPTIONS}
        onProviderChange={onProviderChange}
        onFitActivity={onFitActivity}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Basemap provider" }));
    const menu = screen.getByTestId("map-provider-menu");
    expect(menu).toHaveTextContent("OpenFreeMap (Liberty)");
    expect(menu).toHaveTextContent("OSM Standard (raster)");
    expect(menu).toHaveTextContent("strict usage policies");

    fireEvent.click(
      screen.getByRole("button", { name: /OSM Standard \(raster\)/ }),
    );
    expect(onProviderChange).toHaveBeenCalledWith("osm-raster");

    fireEvent.click(screen.getByRole("button", { name: "Fit activity in view" }));
    expect(onFitActivity).toHaveBeenCalledTimes(1);
  });

  it("hides the Draw/Pan toggle without an editor session", () => {
    render(
      <MapToolbar
        provider="openfreemap"
        providers={USER_TILE_PROVIDER_OPTIONS}
        onProviderChange={() => {}}
        onFitActivity={() => {}}
      />,
    );
    expect(screen.queryByTestId("draw-mode-toggle")).toBeNull();
  });

  it("renders the Draw/Pan toggle and fires mode intents", () => {
    const onToggle = vi.fn();
    render(
      <MapToolbar
        provider="openfreemap"
        providers={USER_TILE_PROVIDER_OPTIONS}
        onProviderChange={() => {}}
        onFitActivity={() => {}}
        drawMode={true}
        onToggleDrawMode={onToggle}
      />,
    );
    const toggle = screen.getByTestId("draw-mode-toggle");
    expect(toggle).toBeVisible();
    expect(screen.getByTestId("draw-mode-draw")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("draw-mode-pan")).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    fireEvent.click(screen.getByTestId("draw-mode-pan"));
    expect(onToggle).toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByTestId("draw-mode-draw"));
    expect(onToggle).toHaveBeenCalledWith(true);
  });
});

describe("DrawDistanceBadge", () => {
  it("shows the live distance, estimated badge, and road-length note", () => {
    render(
      <DrawDistanceBadge
        distanceM={1234.5}
        vertexCount={3}
        maxVertices={128}
      />,
    );
    const badge = screen.getByTestId("draw-distance-badge");
    expect(screen.getByTestId("badge-distance")).toHaveTextContent("1.23 km");
    expect(screen.getByTestId("badge-vertex-count")).toHaveTextContent(
      "3/128 pts",
    );
    expect(badge).toHaveTextContent("Estimated");
    expect(badge).toHaveTextContent("road length");
  });

  it("renders an em dash while inactive", () => {
    render(
      <DrawDistanceBadge distanceM={null} vertexCount={0} maxVertices={128} />,
    );
    expect(screen.getByTestId("badge-distance")).toHaveTextContent("—");
  });
});

describe("MapCanvas draw chrome (Phase 4)", () => {
  it("shows the distance badge and Draw/Pan toggle during an editor session", () => {
    render(
      <MapCanvas
        map={makeBinding()}
        attachContainer={() => {}}
        draw={makeDrawBinding({ vertexCount: 2, distanceM: 432.1 })}
      />,
    );
    expect(screen.getByTestId("draw-distance-badge")).toBeVisible();
    expect(screen.getByTestId("badge-distance")).toHaveTextContent("432 m");
    expect(screen.getByTestId("draw-mode-toggle")).toBeVisible();
  });

  it("hides the selected-gap chip while editing (the draft owns the map)", () => {
    render(
      <MapCanvas
        map={makeBinding({
          selectedGapId: GAP_ROW.id,
          selectedGap: GAP_ROW,
          gapCount: 1,
        })}
        attachContainer={() => {}}
        draw={makeDrawBinding()}
      />,
    );
    expect(screen.queryByTestId("gap-highlight-overlay")).toBeNull();
  });

  it("announces the reconstruction in the screen-reader summary", () => {
    render(
      <MapCanvas
        map={makeBinding()}
        attachContainer={() => {}}
        draw={makeDrawBinding({ vertexCount: 4 })}
      />,
    );
    expect(screen.getByTestId("map-sr-summary")).toHaveTextContent(
      "Reconstruction in progress: 4 drawn points",
    );
  });
});

describe("MapLegend", () => {
  it("explains all visual encodings", () => {
    render(<MapLegend />);
    const legend = screen.getByTestId("map-legend");
    expect(legend).toHaveTextContent("Recorded route (solid)");
    expect(legend).toHaveTextContent("Gap span (dashed)");
    expect(legend).toHaveTextContent("Gap boundaries");
  });
});

describe("GapHighlightOverlay", () => {
  it("renders gap details and dispatches clear", () => {
    const onClear = vi.fn();
    render(<GapHighlightOverlay gap={GAP_ROW} onClear={onClear} />);
    expect(screen.getByTestId("gap-highlight-overlay")).toHaveTextContent(
      "severe",
    );
    fireEvent.click(screen.getByRole("button", { name: "Clear gap selection" }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});

describe("GapList selection sync", () => {
  const THRESHOLDS: GapThresholds = {
    timeGapMs: 120_000,
    speedAnomalyKmh: 25,
    speedDtGuardMs: 10_000,
  };

  function setup(selectedGapId: GapId | null) {
    const onSelectGap = vi.fn();
    render(
      <GapList
        rows={[GAP_ROW]}
        thresholds={THRESHOLDS}
        onThresholdsChange={() => {}}
        onThresholdsReset={() => {}}
        selectedGapId={selectedGapId}
        onSelectGap={onSelectGap}
      />,
    );
    return { onSelectGap };
  }

  it("selects a row and reports aria-pressed", () => {
    const { onSelectGap } = setup(null);
    const row = screen.getByTestId("gap-row");
    expect(row).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(row);
    expect(onSelectGap).toHaveBeenCalledWith(GAP_ROW.id);
  });

  it("deselects an already-selected row (toggle)", () => {
    const { onSelectGap } = setup(GAP_ROW.id);
    const row = screen.getByTestId("gap-row");
    expect(row).toHaveAttribute("aria-pressed", "true");
    expect(row).toHaveAttribute("data-selected", "true");
    fireEvent.click(row);
    expect(onSelectGap).toHaveBeenCalledWith(null);
  });
});

describe("MapCanvas mode chip (QoL pass)", () => {
  it("shows the current pointer mode and toggles on click", () => {
    const setDrawMode = vi.fn();
    render(
      <MapCanvas
        map={makeBinding()}
        attachContainer={() => {}}
        draw={makeDrawBinding({ drawMode: true, setDrawMode })}
      />,
    );
    const chip = screen.getByTestId("map-mode-chip");
    expect(chip).toHaveTextContent("Drawing");
    expect(chip).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(chip);
    expect(setDrawMode).toHaveBeenCalledWith(false);
  });

  it("reads Panning when the pointer mode is pan", () => {
    render(
      <MapCanvas
        map={makeBinding()}
        attachContainer={() => {}}
        draw={makeDrawBinding({ drawMode: false })}
      />,
    );
    const chip = screen.getByTestId("map-mode-chip");
    expect(chip).toHaveTextContent("Panning");
    expect(chip).toHaveAttribute("aria-pressed", "false");
  });

  it("is absent without an editor session", () => {
    render(<MapCanvas map={makeBinding()} attachContainer={() => {}} />);
    expect(screen.queryByTestId("map-mode-chip")).toBeNull();
  });
});
