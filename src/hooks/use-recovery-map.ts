/**
 * useRecoveryMap — the map binding of the Gap Recovery section (Task 26).
 *
 * A compact mirror of the repair studio's `useMapController`, pointed at
 * the recovery store. It owns its OWN MapController instance (created
 * when the recovery workspace mounts its map container, destroyed on
 * unmount) and its OWN gap selection state, so the two sections' maps
 * can never interact: selecting a missing section here does not touch
 * the repair studio's shared selection, and its hygiene effect cannot
 * clear this one.
 *
 * The basemap tile provider is deliberately shared (uiStore) — the chosen
 * basemap is one user preference across the app. Everything else is
 * derived from the recovery session via the SAME pure `buildRouteView`
 * join the repair map uses, so the rendering language is identical:
 * recorded geometry as solid lines, missing sections as dashed spans,
 * committed reconstructions as the distinct emerald treatment, and the
 * editor's draft through the controller's draw session.
 *
 * Task 26 — Gap Recovery section. Client-side hook.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isUsableStatsPoint } from "@/features/statistics/distance";
import {
  MapController,
  type MapControllerStatus,
} from "@/lib/map/mapController";
import type { RouteViewData } from "@/lib/map/geojson";
import {
  USER_TILE_PROVIDER_OPTIONS,
  type TileProviderId,
  type TileProviderOption,
} from "@/lib/map/styles";
import { useRecoveryStore } from "@/state/recovery-store";
import { useUiStore } from "@/state/ui-store";
import type { GapId, OriginalTrackPoint, PointId } from "@/types/domain";
import type { GapRow, RecoverySession } from "@/hooks/use-recovery-session";
import {
  buildRouteView,
  type ExtendSpanRef,
  type ReconstructionRenderRef,
  type RouteGapRef,
} from "@/hooks/use-map-controller";

export type { MapControllerStatus };
export type { TileProviderId, TileProviderOption };
export type { RouteViewData };

export function useRecoveryMap(session: RecoverySession) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<MapController | null>(null);
  const [status, setStatus] = useState<MapControllerStatus>("initializing");
  const [offline, setOffline] = useState(false);
  // Section-local selection (recovery store) — intentionally not the
  // repair studio's shared uiStore.selectedGapId: the two sections'
  // selections must not fight each other's hygiene effects.
  const selectedGapId = useRecoveryStore((s) => s.selectedGapId);
  const provider = useUiStore((s) => s.tileProvider);

  const editorReconstructions = useRecoveryStore((s) => s.reconstructions);
  const editorActiveGapId = useRecoveryStore((s) => s.activeGapId);
  const editorSkipped = useRecoveryStore((s) => s.skippedGapIds);
  const editorRoadLegs = useRecoveryStore((s) => s.roadLegs);
  const editorManualSpans = useRecoveryStore((s) => s.manualSpans);

  const setContainer = useCallback((element: HTMLDivElement | null) => {
    containerRef.current = element;
  }, []);

  // The map exists only while the recovery workspace is mounted with a
  // parsed file (RecoveryStudio renders MapCanvas exactly then).
  const showMap = session.status === "parsed";
  const gapRows = session.gapRows;

  // Controller lifecycle — the container div is rendered by MapCanvas in
  // the parsed state, so its ref is attached by the time this effect
  // runs. A new file intentionally recreates the map.
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
          if (!disposed) useRecoveryStore.getState().selectGap(gapId as GapId);
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

  // User-drawn unmeasured sections (Task 28) as render refs — resolved
  // against the frozen model, deduplicated against currently-detected
  // sections (the detected rendering wins for a shared boundary). Pair
  // spans (replace/insert) carry both boundaries; extend spans join
  // separately below. Mirrors the repair map's manualGapRefs.
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

  // Committed reconstructions as render refs — the gap being edited
  // renders through the controller's draw session (draft styling), so
  // its committed line is suppressed while its editor is open. Detected
  // sections and user-drawn spans alike.
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
        ...(row.id === editorActiveGapId ? { active: true } : {}),
        ...(legs.length > 0 ? { roadLegs: legs } : {}),
      });
    }
    return refs;
  }, [gapRows, manualGapRefs, extendGapRefs, editorReconstructions, editorActiveGapId, editorSkipped, editorRoadLegs]);

  // The renderable route view — the same pure join as the repair map
  // (detected gaps + user-drawn spans + committed reconstructions).
  const route = useMemo<RouteViewData | null>(
    () =>
      showMap && session.data
        ? buildRecoveryRouteView(
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

  // Frame the whole activity whenever a new file's data lands (deferred
  // by the controller until the map is ready).
  useEffect(() => {
    if (showMap && session.data && session.extent) {
      controllerRef.current?.fitBounds(session.extent, {
        maxZoom: 16,
        action: "fit-activity",
      });
    }
  }, [showMap, session.data, session.extent]);

  // Basemap provider changes.
  useEffect(() => {
    controllerRef.current?.setTileProvider(provider);
  }, [provider]);

  // Selection hygiene: clear a selection that no longer exists (new
  // file, reset, or re-detection removed the section). User-drawn spans
  // count too — a drawn section is selectable exactly like a detected
  // one.
  useEffect(() => {
    if (selectedGapId === null) return;
    if (
      session.status !== "parsed" ||
      (!gapRows.some((row) => row.id === selectedGapId) &&
        !manualGapRefs.some((ref) => ref.id === selectedGapId) &&
        !extendGapRefs.some((ref) => ref.id === selectedGapId))
    ) {
      useRecoveryStore.getState().selectGap(null);
    }
  }, [selectedGapId, gapRows, manualGapRefs, extendGapRefs, session.status]);

  // Selection → map: highlight (casing + halo) and focus the section.
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
    useRecoveryStore.getState().selectGap(gapId);
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

/**
 * Route-view join for the recovery section: the shared pure
 * `buildRouteView` over (data, detected gaps, committed
 * reconstructions, user-drawn spans). Factored out (and typed against
 * the shared `RouteGapRef`) so the join is unit-testable without a map —
 * it is the exact same renderer contract as the repair studio's.
 */
export function buildRecoveryRouteView(
  data: RecoverySession["data"],
  gaps: readonly GapRow[],
  reconstructions: readonly ReconstructionRenderRef[],
  manualSpans: readonly RouteGapRef[] = [],
  extendSpans: readonly ExtendSpanRef[] = [],
): RouteViewData {
  if (!data) {
    return { lines: [], spans: [], markers: [], reconstructions: [], usablePointCount: 0 };
  }
  const pointById = new Map<PointId, OriginalTrackPoint>();
  for (const segment of data.segments) {
    for (const point of segment.points) pointById.set(point.id, point);
  }
  const gapRefs: RouteGapRef[] = [];
  for (const row of gaps) {
    const before = pointById.get(row.before.pointId);
    const after = pointById.get(row.after.pointId);
    if (!before || !after) continue;
    if (!isUsableStatsPoint(before) || !isUsableStatsPoint(after)) continue;
    gapRefs.push({
      id: row.id,
      kind: row.kind,
      severity: row.severity,
      before: { pointId: before.id, lat: before.lat, lon: before.lon },
      after: { pointId: after.id, lat: after.lat, lon: after.lon },
    });
  }
  return buildRouteView(data, gapRefs, reconstructions, manualSpans, extendSpans);
}
