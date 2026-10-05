/**
 * useOfflineCaches (Phase 22.3 — §EE 22.3) — the privacy pane's
 * window into the two on-device caches Phase 22 added:
 *
 *   - the persistent elevation terrain (IndexedDB, capped, hydrated
 *     into the shared provider's LRU) with its live point count and
 *     a Clear button;
 *   - the service worker's offline caches (precache + runtime +
 *     tiles) with a Clear button that also unregisters the worker,
 *     so the next online visit re-installs from scratch.
 *
 * Every call is guarded: no `caches` (jsdom), no `indexedDB`, a
 * blocked database — the hook reports `unavailable` and the buttons
 * stay honest about it. Clearing never throws, never touches any
 * other storage, and never unloads the page.
 *
 * Phase 22 — Offline PWA & persistent caches. Client-side hook.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getElevationPersistentCache,
  getElevationProvider,
} from "@/hooks/use-elevation";

/** The worker's cache prefix (public/sw.js owns the names). */
const SW_CACHE_PREFIX = "gpx-repair-studio.";

export interface OfflineCachesBinding {
  /** Points persisted on this device, or null when persistence is off. */
  elevationCount: number | null;
  /** Points removed by the last Clear (drives the confirmation line). */
  elevationClearedCount: number | null;
  /** The offline caches were cleared (drives the confirmation line). */
  offlineCleared: boolean;
  /** A Clear is in flight (disables the buttons). */
  clearing: boolean;
  /** Clear the terrain cache (IndexedDB + the live memory LRU). */
  clearElevation: () => void;
  /** Clear the SW caches and unregister the worker. */
  clearOffline: () => void;
}

export function useOfflineCaches(): OfflineCachesBinding {
  const [elevationCount, setElevationCount] = useState<number | null>(null);
  const [elevationClearedCount, setElevationClearedCount] = useState<number | null>(null);
  const [offlineCleared, setOfflineCleared] = useState(false);
  const [clearing, setClearing] = useState(false);

  // The live count, read once on mount (and after each clear).
  const readCount = useCallback(async () => {
    // Ensures the shared cache exists (provider constructed on demand).
    getElevationProvider();
    const cache = getElevationPersistentCache();
    if (cache === null) {
      setElevationCount(null);
      return;
    }
    setElevationCount(await cache.persistedCount());
  }, []);

  useEffect(() => {
    void readCount();
  }, [readCount]);

  const clearElevation = useCallback(() => {
    setClearing(true);
    const cache = getElevationPersistentCache();
    const removed = elevationCount;
    if (cache !== null) {
      cache.clear();
    }
    void readCount().finally(() => {
      setElevationClearedCount(removed ?? 0);
      setClearing(false);
    });
  }, [elevationCount, readCount]);

  const clearOffline = useCallback(() => {
    setClearing(true);
    void (async () => {
      try {
        if (typeof caches !== "undefined") {
          const names = await caches.keys();
          await Promise.all(
            names
              .filter((name) => name.startsWith(SW_CACHE_PREFIX))
              .map((name) => caches.delete(name)),
          );
        }
        if (
          typeof navigator !== "undefined" &&
          "serviceWorker" in navigator
        ) {
          const registration = await navigator.serviceWorker
            .getRegistration()
            .catch(() => null);
          await registration?.unregister();
        }
        setOfflineCleared(true);
      } finally {
        setClearing(false);
      }
    })();
  }, []);

  return {
    elevationCount,
    elevationClearedCount,
    offlineCleared,
    clearing,
    clearElevation,
    clearOffline,
  };
}
