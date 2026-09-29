/**
 * usePlanMap — the map binding of the "plan a route" section.
 *
 * Owns its OWN MapController (created when the studio's map container
 * mounts, destroyed on unmount), exactly like the create and recovery
 * sections' bindings — the sections' maps can never interact. The
 * basemap provider is shared (uiStore): the chosen basemap is one
 * preference across the app.
 *
 * With no file and no output there is never a committed route to
 * render: the draw session's draft IS the route for the section's
 * whole lifetime, so the route view stays null (the create section's
 * drawing-phase contract, permanent here).
 *
 * One planner-specific aid: `locate()` — a one-shot geolocation fly-to,
 * so a user starting from a blank world map can find their city (the
 * same aid the create section has; it never stores or transmits
 * anything, and a denial degrades to a quiet notice).
 *
 * "Plan a route" section. Client-side hook.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { bboxOf } from "@/lib/geo/bbox";
import type { BBox } from "@/lib/geo/bbox";
import { usePlanStore } from "@/state/plan-store";
import { useUiStore } from "@/state/ui-store";
import type { GapId } from "@/types/domain";
import type { MapBinding } from "@/hooks/use-map-controller";

export type { MapControllerStatus };
export type { TileProviderId, TileProviderOption };
export type { RouteViewData };

/** One-shot geolocation state (the guide card's "Find my position" aid). */
export type LocateStatus = "idle" | "locating" | "denied" | "unavailable";

export interface PlanMapBinding extends MapBinding {
  /** Fly the camera to the device's position (one-shot geolocation). */
  locate: () => void;
  /** The geolocation aid's state (drives the button + notice). */
  locateStatus: LocateStatus;
  /** Frame the drawn chain (the map toolbar's "fit activity" intent). */
  fitToRoute: () => void;
}

export function usePlanMap(): PlanMapBinding {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<MapController | null>(null);
  const [status, setStatus] = useState<MapControllerStatus>("initializing");
  const [offline, setOffline] = useState(false);
  const [locateStatus, setLocateStatus] = useState<LocateStatus>("idle");

  const provider = useUiStore((s) => s.tileProvider);
  const phase = usePlanStore((s) => s.phase);
  const vertices = usePlanStore((s) => s.reconstruction.vertices);

  const setContainer = useCallback((element: HTMLDivElement | null) => {
    containerRef.current = element;
  }, []);

  // The map exists only while the studio is mounted (PlanStudio renders
  // MapCanvas for the section's whole lifetime).
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

  // The drawn chain's extent (the fit intent + the §C-5 alternative).
  const extent = useMemo<BBox | null>(() => {
    if (vertices.length === 0) return null;
    return bboxOf(vertices.map((v) => ({ lat: v.lat, lon: v.lon })));
  }, [vertices]);

  // Basemap provider changes.
  useEffect(() => {
    controllerRef.current?.setTileProvider(provider);
  }, [provider]);

  const fitToRoute = useCallback(() => {
    if (extent) {
      controllerRef.current?.fitBounds(extent, {
        maxZoom: 16,
        action: "fit-plan-route",
      });
    }
  }, [extent]);

  // One-shot geolocation: fly the camera to the device's position. No
  // watch, no storage — the permission prompt is the only side effect.
  const locate = useCallback(() => {
    if (locateStatus === "locating") return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocateStatus("unavailable");
      return;
    }
    setLocateStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocateStatus("idle");
        const { latitude, longitude } = position.coords;
        controllerRef.current?.fitBounds(
          {
            minLat: latitude - 0.004,
            maxLat: latitude + 0.004,
            minLon: longitude - 0.004,
            maxLon: longitude + 0.004,
          },
          { maxZoom: 15.5, action: "locate" },
        );
      },
      () => setLocateStatus("denied"),
      { timeout: 10_000, maximumAge: 60_000 },
    );
  }, [locateStatus]);

  const setProvider = useCallback((next: TileProviderId) => {
    useUiStore.getState().setTileProvider(next);
  }, []);

  const retryBasemap = useCallback(() => {
    controllerRef.current?.retryBasemap();
  }, []);

  const getController = useCallback(() => controllerRef.current, []);

  // A no-op selection intent: MapCanvas's shared chrome never enables gap
  // selection here (no spans/markers exist), but the binding stays total.
  const selectGap = useCallback((_gapId: GapId | null) => {}, []);

  return {
    setContainer,
    status,
    offline,
    provider,
    providers: USER_TILE_PROVIDER_OPTIONS,
    route: null,
    selectedGapId: null,
    selectedGap: null,
    segmentCount: 0,
    gapCount: 0,
    extent,
    selectGap,
    setProvider,
    retryBasemap,
    fitToActivity: fitToRoute,
    getController,
    locate,
    locateStatus,
    fitToRoute,
  };
}
