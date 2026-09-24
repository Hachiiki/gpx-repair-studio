/**
 * useMapController — the React binding for the map (docs/MASTER_PLAN.md
 * §E-1, §F-4 "map isolation"; Phase 3 scope).
 *
 * Responsibilities (and nothing else):
 *   - own the MapController lifecycle (create when the map container is
 *     mounted — i.e. a file is parsed — destroy on reset/unmount;
 *     StrictMode double-mount safe);
 *   - translate the session view models (from `useGpxSession`, the single
 *     source — nothing is recomputed here) into route view data via the
 *     pure `buildRouteView` join;
 *   - drive the controller imperatively from state changes: route data,
 *     basemap provider, gap selection (highlight + focus), activity fit;
 *   - expose a serializable `MapBinding` that `MapCanvas` renders and
 *     `GapList` syncs with (selection is shared through `uiStore`).
 *
 * Components never import `@/lib/map` (ESLint boundary): everything they
 * need — types included — is re-exported from this module.
 *
 * Phase 3 — Map Display. Client-side hook.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isUsableStatsPoint } from "@/features/statistics/distance";
import { resamplePath } from "@/features/reconstruction/resample";
import type { BBox } from "@/lib/geo/bbox";
import {
  MapController,
  type MapControllerStatus,
} from "@/lib/map/mapController";
import type {
  GapBoundaryMarker,
  GapSpanPart,
  ReconstructionPart,
  RouteLinePart,
  RouteViewData,
} from "@/lib/map/geojson";
import {
  USER_TILE_PROVIDER_OPTIONS,
  type TileProviderId,
  type TileProviderOption,
} from "@/lib/map/styles";
import { useEditorStore } from "@/state/editor-store";
import { useUiStore } from "@/state/ui-store";
import type {
  DrawVertex,
  GapId,
  GapKind,
  GapSeverity,
  OriginalTrackData,
  OriginalTrackPoint,
  PointId,
} from "@/types/domain";
import type { GapRow, GpxSession } from "@/hooks/use-gpx-session";

// App-layer facade re-exports (components may not import lib/map directly).
export type { MapControllerStatus };
export type { TileProviderId, TileProviderOption };
export type { RouteViewData };

// ---------------------------------------------------------------------------
// Route view building (pure; exported for node-side unit tests)
// ---------------------------------------------------------------------------

/**
 * The slice of gap information `buildRouteView` needs — satisfied
 * structurally by `GapRow` (the session hook's joined view model), so the
 * map layer stays decoupled from the full row vocabulary.
 */
export interface RouteGapRef {
  id: GapId;
  kind: GapKind;
  severity: GapSeverity;
  before: { pointId: PointId; lat: number; lon: number };
  after: { pointId: PointId; lat: number; lon: number };
}

/** A committed reconstruction to render (hook join of the editor store). */
export interface ReconstructionRenderRef {
  gapId: GapId;
  vertices: readonly DrawVertex[];
  spacingM: number | "off";
  /** True for the gap being edited: suppress its span, render no line. */
  active?: boolean;
}

/**
 * Build the renderable route view for one parsed file:
 *
 *   - `lines`: the recorded geometry as **solid line pieces**, split where
 *     the recorder has no usable line to draw — at unusable points
 *     (invalid / out-of-range / Null-Island damage) and at gap boundaries
 *     (the span between a gap's `before` and `after` points is *unknown*,
 *     highlighted as a dashed span, never drawn as recorded line);
 *   - `spans`: straight dashed connectors between each gap's boundary
 *     points (kind/severity carried for styling);
 *   - `markers`: clickable boundary markers (before = hollow ring,
 *     after = filled dot in the map styling);
 *   - `reconstructions` (Phase 4): the densified path of every committed
 *     reconstruction — a gap with a rendered reconstruction loses its
 *     unknown span (the authored route replaces it; the boundary markers
 *     stay — they mark the recorded/authored seams).
 *
 * A gap whose boundary points are unusable (e.g. a Null-Island artifact)
 * gets no span and no markers — the hole in the line is the honest signal.
 *
 * Uses `isUsableStatsPoint` (features/statistics) as the single shared
 * definition of a "usable" recorded point — the same predicate behind the
 * recorded extent and distance stats.
 */
export function buildRouteView(
  data: OriginalTrackData,
  gaps: readonly RouteGapRef[],
  reconstructions: readonly ReconstructionRenderRef[] = [],
): RouteViewData {
  const beforeIds = new Set(gaps.map((gap) => gap.before.pointId));
  const afterIds = new Set(gaps.map((gap) => gap.after.pointId));
  const pointById = new Map<PointId, OriginalTrackPoint>();
  const reconByGap = new Map(reconstructions.map((r) => [r.gapId, r]));

  const lines: RouteLinePart[] = [];
  const reconParts: ReconstructionPart[] = [];
  let usablePointCount = 0;

  for (const segment of data.segments) {
    let current: [number, number][] = [];
    const flush = () => {
      if (current.length >= 2) {
        lines.push({
          segmentId: segment.id,
          trackIndex: segment.trackIndex,
          coordinates: current,
        });
      }
      current = [];
    };

    for (const point of segment.points) {
      pointById.set(point.id, point);
      if (!isUsableStatsPoint(point)) {
        // Damaged coordinate: skip the point and break the line — there is
        // no honest recorded geometry across the damage.
        flush();
        continue;
      }
      usablePointCount += 1;
      const coords: [number, number] = [point.lon, point.lat];
      if (beforeIds.has(point.id)) {
        // Last usable point before a gap: draw it, then stop the line.
        current.push(coords);
        flush();
        continue;
      }
      if (afterIds.has(point.id)) {
        // First usable point after a gap: start a fresh line here.
        flush();
        current = [coords];
        continue;
      }
      current.push(coords);
    }
    flush();
  }

  const spans: GapSpanPart[] = [];
  const markers: GapBoundaryMarker[] = [];
  for (const gap of gaps) {
    const beforePoint = pointById.get(gap.before.pointId);
    const afterPoint = pointById.get(gap.after.pointId);
    if (!beforePoint || !afterPoint) continue;
    if (
      !isUsableStatsPoint(beforePoint) ||
      !isUsableStatsPoint(afterPoint)
    ) {
      continue;
    }

    const recon = reconByGap.get(gap.id);
    if (recon && recon.vertices.length > 0) {
      // The authored route replaces the unknown span. While its editor is
      // open (`active`), the controller's draft session renders instead —
      // no committed line — but the span stays suppressed either way.
      if (!recon.active) {
        const path = resamplePath(
          beforePoint,
          recon.vertices,
          afterPoint,
          recon.spacingM,
        );
        reconParts.push({
          gapId: gap.id,
          coordinates: path.map((p) => [p.lon, p.lat] as [number, number]),
        });
      }
      // Boundary markers stay — they mark the recorded↔authored seams.
      markers.push(
        {
          gapId: gap.id,
          pointId: beforePoint.id,
          role: "before",
          severity: gap.severity,
          lat: beforePoint.lat,
          lon: beforePoint.lon,
        },
        {
          gapId: gap.id,
          pointId: afterPoint.id,
          role: "after",
          severity: gap.severity,
          lat: afterPoint.lat,
          lon: afterPoint.lon,
        },
      );
      continue;
    }

    spans.push({
      gapId: gap.id,
      kind: gap.kind,
      severity: gap.severity,
      coordinates: [
        [beforePoint.lon, beforePoint.lat],
        [afterPoint.lon, afterPoint.lat],
      ],
    });
    markers.push(
      {
        gapId: gap.id,
        pointId: beforePoint.id,
        role: "before",
        severity: gap.severity,
        lat: beforePoint.lat,
        lon: beforePoint.lon,
      },
      {
        gapId: gap.id,
        pointId: afterPoint.id,
        role: "after",
        severity: gap.severity,
        lat: afterPoint.lat,
        lon: afterPoint.lon,
      },
    );
  }

  return { lines, spans, markers, reconstructions: reconParts, usablePointCount };
}

// ---------------------------------------------------------------------------
// The binding
// ---------------------------------------------------------------------------

/** Everything `MapCanvas` (and the gap-list sync) needs from the map. */
export interface MapBinding {
  /**
   * Callback ref for the map container element (the sanctioned channel for
   * prop-carried element access — keeps `react-hooks/refs` clean: no ref
   * object is ever read during render).
   */
  setContainer: (element: HTMLDivElement | null) => void;
  status: MapControllerStatus;
  /** Basemap tiles unavailable (offline/blocked) — overlays still render. */
  offline: boolean;
  provider: TileProviderId;
  /** User-selectable basemap options (OpenFreeMap, OSM raster). */
  providers: readonly TileProviderOption[];
  /** Current route view data (null while no file is parsed). */
  route: RouteViewData | null;
  /** The gap currently highlighted on the map / gap list (shared
   * selection with the gap list — id, not row, for cheap comparisons). */
  selectedGapId: GapId | null;
  /** The selected gap row, for the highlight chip. */
  selectedGap: GapRow | null;
  /** Counts + extent for textual alternatives (§C-5). */
  segmentCount: number;
  gapCount: number;
  extent: BBox | null;
  selectGap: (gapId: GapId | null) => void;
  setProvider: (provider: TileProviderId) => void;
  retryBasemap: () => void;
  fitToActivity: () => void;
  /**
   * Stable accessor for the live controller (Phase 4: the draw-editor
   * hook drives the controller's draw session through it — components
   * never call this).
   */
  getController: () => MapController | null;
}

export function useMapController(session: GpxSession): MapBinding {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<MapController | null>(null);
  const [status, setStatus] = useState<MapControllerStatus>("initializing");
  const [offline, setOffline] = useState(false);
  const selectedGapId = useUiStore((s) => s.selectedGapId);
  const provider = useUiStore((s) => s.tileProvider);
  const editorReconstructions = useEditorStore((s) => s.reconstructions);
  const editorActiveGapId = useEditorStore((s) => s.activeGapId);
  const editorSkipped = useEditorStore((s) => s.skippedGapIds);

  const setContainer = useCallback((element: HTMLDivElement | null) => {
    containerRef.current = element;
  }, []);

  const showMap = session.status === "parsed";
  const gapRows = session.gapRows;

  // Controller lifecycle — the container div is rendered by MapCanvas only
  // in the parsed state, so its ref is attached by the time this effect
  // runs. A new file (loading → parsed) intentionally recreates the map.
  useEffect(() => {
    if (!showMap) return;
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    const controller = new MapController({
      container,
      provider: useUiStore.getState().tileProvider,
      callbacks: {
        onStatusChange: (next) => {
          if (!disposed) setStatus(next);
        },
        onOfflineChange: (next) => {
          if (!disposed) setOffline(next);
        },
        onGapSelected: (gapId) => {
          useUiStore.getState().selectGap(gapId as GapId);
        },
      },
    });
    controllerRef.current = controller;
    void controller.create();

    return () => {
      disposed = true;
      controllerRef.current = null;
      controller.destroy();
    };
  }, [showMap]);

  // Route data: derive once per (model, gaps, committed reconstructions)
  // change; drive the controller. The gap being edited renders through the
  // controller's draw session (draft styling), not as a committed line.
  const reconstructionRefs = useMemo(() => {
    const refs: ReconstructionRenderRef[] = [];
    for (const row of gapRows) {
      if (editorSkipped.includes(row.id)) continue;
      const recon = editorReconstructions[row.id];
      if (!recon || recon.vertices.length === 0) continue;
      refs.push({
        gapId: row.id,
        vertices: recon.vertices,
        spacingM: recon.resampleSpacingM,
        // The gap being edited renders through the controller's draw
        // session (draft styling) — the ref only suppresses its span.
        ...(row.id === editorActiveGapId ? { active: true } : {}),
      });
    }
    return refs;
  }, [gapRows, editorReconstructions, editorActiveGapId, editorSkipped]);

  const route = useMemo(
    () =>
      showMap && session.data
        ? buildRouteView(session.data, gapRows, reconstructionRefs)
        : null,
    [showMap, session.data, gapRows, reconstructionRefs],
  );
  useEffect(() => {
    controllerRef.current?.setRoute(route);
  }, [route]);

  // Frame the whole activity whenever a new file's data lands. Deferred by
  // the controller until the map is ready; never re-run on re-detection
  // (the data identity only changes for a new file).
  useEffect(() => {
    if (session.data && session.extent) {
      controllerRef.current?.fitBounds(session.extent, {
        maxZoom: 16,
        action: "fit-activity",
      });
    }
  }, [session.data, session.extent]);

  // Basemap provider changes.
  useEffect(() => {
    controllerRef.current?.setTileProvider(provider);
  }, [provider]);

  // Selection hygiene: clear a selection that no longer exists (new file,
  // reset, or re-detection removed the gap).
  useEffect(() => {
    if (selectedGapId === null) return;
    if (
      session.status !== "parsed" ||
      !gapRows.some((row) => row.id === selectedGapId)
    ) {
      useUiStore.getState().selectGap(null);
    }
  }, [selectedGapId, gapRows, session.status]);

  // Selection → map: highlight (casing + halo) and focus the gap region.
  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    controller.highlightGap(selectedGapId);
    if (selectedGapId !== null) {
      const row = gapRows.find((r) => r.id === selectedGapId);
      if (row) {
        controller.fitBounds(
          {
            minLat: Math.min(row.before.lat, row.after.lat),
            minLon: Math.min(row.before.lon, row.after.lon),
            maxLat: Math.max(row.before.lat, row.after.lat),
            maxLon: Math.max(row.before.lon, row.after.lon),
          },
          {
            maxZoom: 16.5,
            padding: 96,
            action: `fit-gap:${selectedGapId}`,
          },
        );
      }
    }
  }, [selectedGapId, gapRows]);

  const selectGap = useCallback((gapId: GapId | null) => {
    useUiStore.getState().selectGap(gapId);
  }, []);

  const getController = useCallback(() => controllerRef.current, []);

  const setProvider = useCallback((next: TileProviderId) => {
    useUiStore.getState().setTileProvider(next);
  }, []);

  const retryBasemap = useCallback(() => {
    controllerRef.current?.retryBasemap();
  }, []);

  const fitToActivity = useCallback(() => {
    if (session.extent) {
      controllerRef.current?.fitBounds(session.extent, {
        maxZoom: 16,
        action: "fit-activity",
      });
    }
  }, [session.extent]);

  const selectedGap = useMemo(
    () =>
      selectedGapId === null
        ? null
        : (gapRows.find((row) => row.id === selectedGapId) ?? null),
    [selectedGapId, gapRows],
  );

  return {
    setContainer,
    status,
    offline,
    provider,
    providers: USER_TILE_PROVIDER_OPTIONS,
    route,
    selectedGapId,
    selectedGap,
    segmentCount: session.data?.segments.length ?? 0,
    gapCount: gapRows.length,
    extent: session.extent,
    selectGap,
    setProvider,
    retryBasemap,
    fitToActivity,
    getController,
  };
}
