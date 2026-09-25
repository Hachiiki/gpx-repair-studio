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
  RoadLeg,
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
  /** Resolved road-follow legs (the committed line follows the road). */
  roadLegs?: readonly RoadLeg[];
}

/**
 * An open-ended extension span (one-anchor "add missing route" at a
 * route start/end): the anchor is both the seam marker and the chain's
 * start point; there is no far boundary and no closing segment.
 */
export interface ExtendSpanRef {
  id: GapId;
  anchor: { pointId: PointId; lat: number; lon: number };
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
 * Manual repair spans (draw-anywhere) join as a fourth kind of input:
 * they never split the recorded line and never draw an unknown span —
 * the stretch between their anchors IS recorded; the user merely wants
 * to redraw it. They contribute boundary markers (the recorded↔authored
 * seams) and, once committed, their reconstruction renders on top of the
 * recorded line (both stay visible — the original is immutable truth, the
 * repair is the user's claim). A manual span whose id matches a detected
 * gap is skipped here: the detected rendering wins (the caller already
 * dedupes; this is the defensive second gate).
 *
 * Re-imported repairs (§H-7, Phase 7): points carrying `gpxr` markers
 * render as RECONSTRUCTION lines (the same emerald treatment as
 * committed editor repairs), never as recorded line — the recorded line
 * breaks at the seams (the anchor points on either side), exactly like a
 * detected gap's boundary break. Uploading a file this app repaired
 * before therefore shows the same visual distinction the user saw when
 * they repaired it.
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
  manualSpans: readonly RouteGapRef[] = [],
  extendSpans: readonly ExtendSpanRef[] = [],
): RouteViewData {
  const beforeIds = new Set(gaps.map((gap) => gap.before.pointId));
  const afterIds = new Set(gaps.map((gap) => gap.after.pointId));
  const pointById = new Map<PointId, OriginalTrackPoint>();
  const reconByGap = new Map(reconstructions.map((r) => [r.gapId, r]));
  const detectedIds = new Set(gaps.map((gap) => gap.id));
  const markedIds = new Set(
    (data.repairMarkers ?? []).map((marker) => marker.pointId),
  );

  const lines: RouteLinePart[] = [];
  const reconParts: ReconstructionPart[] = [];
  let usablePointCount = 0;
  let reimportRunIndex = 0;

  for (const segment of data.segments) {
    let current: [number, number][] = [];
    /** The in-progress re-imported marked run (null = none open). */
    let reimportRun: [number, number][] | null = null;
    /** Coords of the last usable point pushed to `current` (seam anchor). */
    let lastCoords: [number, number] | null = null;
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
    const closeReimportRun = () => {
      if (reimportRun !== null && reimportRun.length >= 2) {
        reconParts.push({
          gapId: `reimport/${segment.id}:${reimportRunIndex++}` as GapId,
          coordinates: reimportRun,
        });
      }
      reimportRun = null;
    };

    for (const point of segment.points) {
      pointById.set(point.id, point);
      if (!isUsableStatsPoint(point)) {
        // Damaged coordinate: skip the point and break the line — there is
        // no honest recorded geometry across the damage.
        flush();
        closeReimportRun();
        lastCoords = null;
        continue;
      }
      const coords: [number, number] = [point.lon, point.lat];

      if (markedIds.has(point.id)) {
        // Re-imported reconstructed point: never part of the recorded
        // line. Opening the run closes the line at its seam anchor (the
        // last recorded point, already drawn); closing appends the next
        // recorded point as the far anchor and starts a fresh line there.
        if (reimportRun === null) {
          flush();
          reimportRun = lastCoords !== null ? [lastCoords] : [];
        }
        reimportRun.push(coords);
        continue;
      }
      if (reimportRun !== null) {
        reimportRun.push(coords);
        closeReimportRun();
        current = [coords];
        lastCoords = coords;
        continue;
      }

      usablePointCount += 1;
      if (beforeIds.has(point.id)) {
        // Last usable point before a gap: draw it, then stop the line.
        current.push(coords);
        lastCoords = coords;
        flush();
        continue;
      }
      if (afterIds.has(point.id)) {
        // First usable point after a gap: start a fresh line here.
        flush();
        current = [coords];
        lastCoords = coords;
        continue;
      }
      current.push(coords);
      lastCoords = coords;
    }
    flush();
    closeReimportRun();
  }

  const spans: GapSpanPart[] = [];
  const markers: GapBoundaryMarker[] = [];
  const renderMarkers = (
    gapId: GapId,
    beforePoint: OriginalTrackPoint,
    afterPoint: OriginalTrackPoint,
    severity: GapSeverity,
  ) => {
    markers.push(
      {
        gapId,
        pointId: beforePoint.id,
        role: "before",
        severity,
        lat: beforePoint.lat,
        lon: beforePoint.lon,
      },
      {
        gapId,
        pointId: afterPoint.id,
        role: "after",
        severity,
        lat: afterPoint.lat,
        lon: afterPoint.lon,
      },
    );
  };
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
          recon.roadLegs,
        );
        reconParts.push({
          gapId: gap.id,
          coordinates: path.map((p) => [p.lon, p.lat] as [number, number]),
        });
      }
      // Boundary markers stay — they mark the recorded↔authored seams.
      renderMarkers(gap.id, beforePoint, afterPoint, gap.severity);
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
    renderMarkers(gap.id, beforePoint, afterPoint, gap.severity);
  }

  // Manual repair spans: markers + committed reconstruction only — the
  // recorded line between the anchors stays (the stretch is recorded; the
  // user redraws it by choice, not because nothing exists there).
  for (const span of manualSpans) {
    if (detectedIds.has(span.id)) continue; // detected rendering wins
    const beforePoint = pointById.get(span.before.pointId);
    const afterPoint = pointById.get(span.after.pointId);
    if (!beforePoint || !afterPoint) continue;
    if (
      !isUsableStatsPoint(beforePoint) ||
      !isUsableStatsPoint(afterPoint)
    ) {
      continue;
    }
    const recon = reconByGap.get(span.id);
    if (recon && recon.vertices.length > 0 && !recon.active) {
      const path = resamplePath(
        beforePoint,
        recon.vertices,
        afterPoint,
        recon.spacingM,
        recon.roadLegs,
      );
      reconParts.push({
        gapId: span.id,
        coordinates: path.map((p) => [p.lon, p.lat] as [number, number]),
      });
    }
    renderMarkers(span.id, beforePoint, afterPoint, span.severity);
  }

  // Open-ended extensions: ONE seam marker (the anchor) and — once
  // committed — the drawn chain itself, with NO closing segment: the
  // repair extends past the recorded route's start/end into the open.
  for (const span of extendSpans) {
    if (detectedIds.has(span.id)) continue;
    const anchorPoint = pointById.get(span.anchor.pointId);
    if (!anchorPoint || !isUsableStatsPoint(anchorPoint)) continue;
    const recon = reconByGap.get(span.id);
    if (recon && recon.vertices.length > 0 && !recon.active) {
      const path = resamplePath(
        anchorPoint,
        recon.vertices,
        null,
        recon.spacingM,
        recon.roadLegs,
      );
      reconParts.push({
        gapId: span.id,
        coordinates: path.map((p) => [p.lon, p.lat] as [number, number]),
      });
    }
    markers.push({
      gapId: span.id,
      pointId: anchorPoint.id,
      role: "before",
      severity: "info",
      lat: anchorPoint.lat,
      lon: anchorPoint.lon,
    });
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
  const editorManualSpans = useEditorStore((s) => s.manualSpans);
  const editorRoadLegs = useEditorStore((s) => s.roadLegs);

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

  // Manual repair spans as render refs — resolved against the frozen
  // model, deduplicated against currently-detected gaps (the detected
  // rendering wins for a shared boundary). Pair spans (replace/insert)
  // carry both boundaries; extend spans join separately below.
  const manualGapRefs = useMemo(() => {
    if (!session.data) return [] as RouteGapRef[];
    const pointById = new Map<PointId, OriginalTrackPoint>();
    for (const segment of session.data.segments) {
      for (const point of segment.points) pointById.set(point.id, point);
    }
    const detectedIds = new Set(gapRows.map((row) => row.id));
    const refs: RouteGapRef[] = [];
    for (const span of editorManualSpans) {
      if (span.kind === "extend") continue; // joined as extendGapRefs
      if (detectedIds.has(span.id)) continue;
      const before = pointById.get(span.beforePointId);
      const after = pointById.get(span.afterPointId);
      if (!before || !after) continue;
      if (!isUsableStatsPoint(before) || !isUsableStatsPoint(after)) {
        continue;
      }
      refs.push({
        id: span.id,
        kind: span.kind === "insert" ? "manual-insert" : "manual",
        severity: "info",
        before: { pointId: before.id, lat: before.lat, lon: before.lon },
        after: { pointId: after.id, lat: after.lat, lon: after.lon },
      });
    }
    return refs;
  }, [session.data, editorManualSpans, gapRows]);

  // Open-ended extension spans: one anchor, no far boundary.
  const extendGapRefs = useMemo(() => {
    if (!session.data) return [] as ExtendSpanRef[];
    const pointById = new Map<PointId, OriginalTrackPoint>();
    for (const segment of session.data.segments) {
      for (const point of segment.points) pointById.set(point.id, point);
    }
    const detectedIds = new Set(gapRows.map((row) => row.id));
    const refs: ExtendSpanRef[] = [];
    for (const span of editorManualSpans) {
      if (span.kind !== "extend") continue;
      if (detectedIds.has(span.id)) continue;
      const anchor = pointById.get(span.anchorPointId);
      if (!anchor || !isUsableStatsPoint(anchor)) continue;
      refs.push({
        id: span.id,
        anchor: { pointId: anchor.id, lat: anchor.lat, lon: anchor.lon },
      });
    }
    return refs;
  }, [session.data, editorManualSpans, gapRows]);

  const reconstructionRefs = useMemo(() => {
    const refs: ReconstructionRenderRef[] = [];
    const seen = new Set<string>();
    for (const row of [...gapRows, ...manualGapRefs, ...extendGapRefs]) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      if (editorSkipped.includes(row.id)) continue;
      const recon = editorReconstructions[row.id];
      if (!recon || recon.vertices.length === 0) continue;
      const legs = editorRoadLegs[row.id] ?? [];
      refs.push({
        gapId: row.id,
        vertices: recon.vertices,
        spacingM: recon.resampleSpacingM,
        // The gap being edited renders through the controller's draw
        // session (draft styling) — the ref only suppresses its span.
        ...(row.id === editorActiveGapId ? { active: true } : {}),
        ...(legs.length > 0 ? { roadLegs: legs } : {}),
      });
    }
    return refs;
  }, [gapRows, manualGapRefs, extendGapRefs, editorReconstructions, editorActiveGapId, editorSkipped, editorRoadLegs]);

  const route = useMemo(
    () =>
      showMap && session.data
        ? buildRouteView(
            session.data,
            gapRows,
            reconstructionRefs,
            manualGapRefs,
            extendGapRefs,
          )
        : null,
    [showMap, session.data, gapRows, reconstructionRefs, manualGapRefs, extendGapRefs],
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
  // reset, or re-detection removed the gap). Manual spans count too — a
  // picked span is selectable exactly like a detected gap.
  useEffect(() => {
    if (selectedGapId === null) return;
    if (
      session.status !== "parsed" ||
      (!gapRows.some((row) => row.id === selectedGapId) &&
        !manualGapRefs.some((ref) => ref.id === selectedGapId) &&
        !extendGapRefs.some((ref) => ref.id === selectedGapId))
    ) {
      useUiStore.getState().selectGap(null);
    }
  }, [selectedGapId, gapRows, manualGapRefs, extendGapRefs, session.status]);

  // Selection → map: highlight (casing + halo) and focus the gap region.
  // Open extensions do NOT refit the camera: the user just clicked the
  // anchor (the camera is already where they want it), and a mid-draw
  // camera swing would steal their click targets. The halo still marks it.
  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    controller.highlightGap(selectedGapId);
    if (selectedGapId !== null) {
      const row =
        gapRows.find((r) => r.id === selectedGapId) ??
        manualGapRefs.find((r) => r.id === selectedGapId);
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
  }, [selectedGapId, gapRows, manualGapRefs]);

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

  // The highlight chip stays a detected-gap affordance: its copy ("the path
  // … was not recorded") would be a lie for manual spans, where the stretch
  // IS recorded and the user redraws it by choice. Manual spans get their
  // map highlight + camera focus through `selectedGapId` and the refs
  // above; their context lives in the manual-repairs card and the editor.
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
