/**
 * useMergeMap — the map binding of the Merge section (Task 43).
 *
 * Owns its OWN MapController (created when the studio's map container
 * mounts, destroyed on unmount), exactly like the recovery and create
 * sections' bindings — the four sections' maps can never interact. The
 * basemap provider is shared (uiStore): the chosen basemap is one
 * preference across the app.
 *
 * The route is the DERIVED merge (useMergeSession's `merged`), rendered
 * through the same `buildRouteView` the repair workspace uses — with no
 * gaps or manual spans of its own, it splits lines only at unusable
 * points and renders re-imported `gpxr` repairs as reconstruction
 * lines, so the map shows the merged file exactly as a re-upload of it
 * would. Reframing happens whenever a NEW merge renders (reorder a file
 * and the camera follows the new arrangement).
 *
 * One merge-specific aid: `focusFile` — fly the camera to one source
 * file's extent, so the user can see which route is which while
 * arranging the order.
 *
 * Task 43 — Merge tool. Client-side hook.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildRouteView, type MapBinding } from "@/hooks/use-map-controller";
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
import { bboxOf, type BBox } from "@/lib/geo/bbox";
import { isUsableStatsPoint } from "@/features/statistics/distance";
import type { MergeSession } from "@/hooks/use-merge-session";
import { useMergeStore } from "@/state/merge-store";
import { useUiStore } from "@/state/ui-store";
import type { GapId } from "@/types/domain";

export type { MapControllerStatus };
export type { TileProviderId, TileProviderOption };
export type { RouteViewData };

export interface MergeMapBinding extends MapBinding {
  /** Frame one source file's extent (the file list's "Show" intent). */
  focusFile: (fileId: string) => void;
}

export function useMergeMap(session: MergeSession): MergeMapBinding {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<MapController | null>(null);
  const [status, setStatus] = useState<MapControllerStatus>("initializing");
  const [offline, setOffline] = useState(false);

  const provider = useUiStore((s) => s.tileProvider);
  const phase = useMergeStore((s) => s.phase);

  const setContainer = useCallback((element: HTMLDivElement | null) => {
    containerRef.current = element;
  }, []);

  // The map exists only while the studio is mounted (the intake page has
  // no map — files are being collected, not arranged).
  const showMap = phase === "studio";

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
        onGapSelected: () => {
          // No gaps exist in this section — nothing to select.
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

  // The merged route: the derived merge, rendered like a re-upload of
  // the merged file would render (damage-split lines; re-imported
  // repairs as reconstruction lines).
  const route = useMemo<RouteViewData | null>(() => {
    if (!session.merged) return null;
    return buildRouteView(session.merged.model, []);
  }, [session.merged]);

  useEffect(() => {
    controllerRef.current?.setRoute(route);
  }, [route]);

  // Frame the whole merge whenever a NEW merge renders (the first one,
  // and again after any arrangement change rebuilds it) — the user
  // should see the full combined route after every edit.
  const extent = session.merged?.extent ?? null;
  const routeKey = route === null ? 0 : 1;
  useEffect(() => {
    if (routeKey === 1 && extent) {
      controllerRef.current?.fitBounds(extent, {
        maxZoom: 16,
        padding: 64,
        action: "fit-merge-route",
      });
    }
  }, [routeKey, extent]);

  // Basemap provider changes.
  useEffect(() => {
    controllerRef.current?.setTileProvider(provider);
  }, [provider]);

  const fitToActivity = useCallback(() => {
    if (extent) {
      controllerRef.current?.fitBounds(extent, {
        maxZoom: 16,
        action: "fit-merge-activity",
      });
    }
  }, [extent]);

  // Fly to one source file's recorded extent — the arrange aid.
  const focusFile = useCallback(
    (fileId: string) => {
      const file = session.files.find((entry) => entry.id === fileId);
      if (!file || file.model === null) return;
      const usable: { lat: number; lon: number }[] = [];
      for (const segment of file.model.segments) {
        for (const point of segment.points) {
          if (isUsableStatsPoint(point)) usable.push(point);
        }
      }
      const box: BBox | null = bboxOf(usable);
      if (box) {
        controllerRef.current?.fitBounds(box, {
          maxZoom: 16,
          padding: 64,
          action: "fit-merge-file",
        });
      }
    },
    [session.files],
  );

  const setProvider = useCallback((next: TileProviderId) => {
    useUiStore.getState().setTileProvider(next);
  }, []);

  const retryBasemap = useCallback(() => {
    controllerRef.current?.retryBasemap();
  }, []);

  const getController = useCallback(() => controllerRef.current, []);

  // A no-op selection intent: MapCanvas's shared chrome never enables
  // gap selection here (no spans/markers exist), but the binding stays
  // total.
  const selectGap = useCallback((_gapId: GapId | null) => {}, []);

  return {
    setContainer,
    status,
    offline,
    provider,
    providers: USER_TILE_PROVIDER_OPTIONS,
    route,
    selectedGapId: null,
    selectedGap: null,
    segmentCount: session.merged?.model.segments.length ?? 0,
    gapCount: 0,
    extent,
    selectGap,
    setProvider,
    retryBasemap,
    fitToActivity,
    getController,
    focusFile,
  };
}
