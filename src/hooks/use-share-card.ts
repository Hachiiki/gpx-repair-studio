/**
 * useShareCard — the share-card workflow's app-layer join
 * (docs/MASTER_PLAN.md §O — Task 20).
 *
 * Turns the parsed session into the share card's inputs:
 *   - the route as polylines, reused verbatim from `buildRouteView`
 *     (the same honest split the map renders — recorded pieces, split
 *     at gaps and damage, plus re-imported reconstruction runs; never
 *     a fabricated connector across an unknown stretch);
 *   - the Distance/Pace/Time trio via `buildShareCardContent`
 *     (§L-2 honesty: "—" with reasons, never invented values);
 *   - the download intent: one offscreen paint at the chosen scale →
 *     PNG blob → the shared anchor-download utility.
 *
 * One implementation serves both the live preview (the canvas
 * component paints the same spec at scale 1) and the export — the
 * WYSIWYG contract of the GPX export, applied to pixels.
 *
 * Client-side hook. Types are re-exported for the component layer
 * (ESLint boundary: components never import features/ directly).
 */

"use client";

import { useCallback, useMemo } from "react";
import {
  buildShareCardContent,
  type ShareCardContent,
} from "@/features/share/cardContent";
import { buildRouteView } from "@/hooks/use-map-controller";
import { loadShareCardFonts } from "@/lib/share/fonts";
import {
  paintShareCardCanvas,
  type ShareCardSpec,
} from "@/lib/share/render";
import { downloadBlobFile, shareCardFileName } from "@/lib/utils/download";
import type { PaceUnit } from "@/lib/utils/format";
import type { LatLon } from "@/types/domain";
import { useUiStore } from "@/state/ui-store";
import type { GpxSession } from "@/hooks/use-gpx-session";

// App-layer facade re-exports (components may not import feature
// internals — ESLint boundary, §F).
export type { ShareCardContent } from "@/features/share/cardContent";
export type { ShareCardSpec } from "@/lib/share/render";

/** PNG export scales: 1 = the spec's 1080×1920, 2 = sharper 2160×3840. */
export type SharePngScale = 1 | 2;

/** Everything the share view (and its download button) needs. */
export interface ShareCardBinding {
  /** The card's render spec; `null` until stats are available. */
  spec: ShareCardSpec | null;
  /** The derived trio + honesty notes. */
  content: ShareCardContent | null;
  /** True when the file has no drawable route (stats-only card). */
  routeEmpty: boolean;
  /** §J-2 pace unit toggle (shared with the statistics panel). */
  paceUnit: PaceUnit;
  setPaceUnit: (unit: PaceUnit) => void;
  /** Paint offscreen at `scale` and hand the PNG to the browser. */
  downloadPng: (scale: SharePngScale) => void;
}

export function useShareCard(session: GpxSession): ShareCardBinding {
  const paceUnit = useUiStore((s) => s.paceUnit);

  const setPaceUnit = useCallback((unit: PaceUnit) => {
    useUiStore.getState().setPaceUnit(unit);
  }, []);

  // The route: the same view the map renders (recorded pieces split at
  // gaps/damage + re-imported reconstruction runs), converted from
  // GeoJSON [lon, lat] pairs to the domain's LatLon. Recomputed only
  // for a new file or re-detection.
  const polylines = useMemo(() => {
    if (!session.data) return [] as (readonly LatLon[])[];
    const view = buildRouteView(session.data, session.gapRows);
    return [...view.lines, ...view.reconstructions].map((part) =>
      part.coordinates.map(([lon, lat]) => ({ lat, lon }) as LatLon),
    );
  }, [session.data, session.gapRows]);

  const content = useMemo(
    () =>
      session.distanceStats && session.timeStats
        ? buildShareCardContent({
            distance: session.distanceStats,
            time: session.timeStats,
            reimport: session.reimport,
            unit: paceUnit,
          })
        : null,
    [session.distanceStats, session.timeStats, session.reimport, paceUnit],
  );

  const spec = useMemo(
    () =>
      content
        ? {
            routePolyline: polylines,
            distance: content.distance,
            pace: content.pace,
            time: content.time,
          }
        : null,
    [polylines, content],
  );

  const routeEmpty = useMemo(
    () => !polylines.some((line) => line.length > 0),
    [polylines],
  );

  const downloadPng = useCallback(
    (scale: SharePngScale) => {
      if (!spec || !session.fileName) return;
      const fileName = session.fileName;
      void (async () => {
        // The export must not race the font fetch on a cold session.
        await loadShareCardFonts();
        const canvas = document.createElement("canvas");
        paintShareCardCanvas(canvas, spec, { scale });
        canvas.toBlob((blob) => {
          if (blob) downloadBlobFile(shareCardFileName(fileName), blob);
        }, "image/png");
      })();
    },
    [spec, session.fileName],
  );

  return {
    spec,
    content,
    routeEmpty,
    paceUnit,
    setPaceUnit,
    downloadPng,
  };
}
