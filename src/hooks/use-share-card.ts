/**
 * useShareCard — the share-card workflow's app-layer join
 * (docs/MASTER_PLAN.md §O — Task 20; Task 35: the edited route).
 *
 * Turns the parsed session AND the committed repairs into the share
 * card's inputs — clicking into the share view "exports the edited
 * route" automatically, no manual export/re-upload round-trip:
 *
 *   - the route as polylines: the SAME route view the map renders
 *     (recorded pieces split at gaps and damage, re-imported
 *     reconstruction runs, and — Task 35 — every committed live
 *     repair through the shared `buildEditorRouteRefs` join), never a
 *     fabricated connector across an unknown stretch. Uncommitted
 *     drafts (an open editor) and skipped gaps are NOT included —
 *     exactly the export population;
 *   - the Distance/Pace/Time trio via `buildShareCardContent`
 *     (§L-2 honesty: "—" with reasons, never invented values; with
 *     repairs, the outcome totals the statistics panel shows);
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
import {
  buildEditorRouteRefs,
  buildRouteView,
} from "@/hooks/use-map-controller";
import { loadShareCardFonts } from "@/lib/share/fonts";
import {
  paintShareCardCanvas,
  type ShareCardSpec,
} from "@/lib/share/render";
import { downloadBlobFile, shareCardFileName } from "@/lib/utils/download";
import type { PaceUnit } from "@/lib/utils/format";
import type { LatLon } from "@/types/domain";
import { useEditorStore } from "@/state/editor-store";
import { useUiStore } from "@/state/ui-store";
import type { RepairTimeStats } from "@/hooks/use-draw-editor";
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

export function useShareCard(
  session: GpxSession,
  /**
   * Task 35: the committed-repair time join (the draw binding's
   * `repairTimeStats`). Omitted/null → the file as recorded, the exact
   * pre-Task-35 behavior.
   */
  repair: RepairTimeStats | null = null,
  /** File-level manual total for no-timing files (§J-1 Case 3). */
  manualTotalDurationMs: number | null = null,
): ShareCardBinding {
  const paceUnit = useUiStore((s) => s.paceUnit);

  // The editor's committed work — the same slices the map hook joins,
  // so the card's route and the map's route are one derivation.
  const editorReconstructions = useEditorStore((s) => s.reconstructions);
  const editorRoadLegs = useEditorStore((s) => s.roadLegs);
  const editorSkipped = useEditorStore((s) => s.skippedGapIds);
  const editorActiveGapId = useEditorStore((s) => s.activeGapId);
  const editorManualSpans = useEditorStore((s) => s.manualSpans);

  const setPaceUnit = useCallback((unit: PaceUnit) => {
    useUiStore.getState().setPaceUnit(unit);
  }, []);

  // The route: the same view the map renders — recorded pieces split at
  // gaps/damage, re-imported reconstruction runs, every committed live
  // repair, and (Phase 13) the working copy's deep-validation fixes —
  // converted from GeoJSON [lon, lat] pairs to the domain's LatLon.
  // Recomputed for a new file, re-detection, a change in the committed
  // repairs, or a working-copy fix.
  const polylines = useMemo(() => {
    if (!session.workingData) return [] as (readonly LatLon[])[];
    const refs = buildEditorRouteRefs({
      data: session.workingData,
      gapRows: session.gapRows,
      manualSpans: editorManualSpans,
      skippedGapIds: editorSkipped,
      activeGapId: editorActiveGapId,
      reconstructions: editorReconstructions,
      roadLegs: editorRoadLegs,
    });
    const view = buildRouteView(
      session.workingData,
      session.gapRows,
      refs.reconstructionRefs,
      refs.manualGapRefs,
      refs.extendGapRefs,
    );
    return [...view.lines, ...view.reconstructions].map((part) =>
      part.coordinates.map(([lon, lat]) => ({ lat, lon }) as LatLon),
    );
  }, [
    session.workingData,
    session.gapRows,
    editorManualSpans,
    editorSkipped,
    editorActiveGapId,
    editorReconstructions,
    editorRoadLegs,
  ]);

  const content = useMemo(
    () =>
      session.distanceStats && session.timeStats
        ? buildShareCardContent({
            distance: session.distanceStats,
            time: session.timeStats,
            reimport: session.reimport,
            unit: paceUnit,
            repair: repair
              ? {
                  repairCount: repair.gapCount,
                  reconstructedDistanceM: repair.reconstructedDistanceM,
                  repairTimeMs: repair.reconstructedTimeMs,
                  gapsWithoutDuration: repair.gapsWithoutDuration,
                  manualTotalDurationMs,
                }
              : null,
          })
        : null,
    [
      session.distanceStats,
      session.timeStats,
      session.reimport,
      paceUnit,
      repair,
      manualTotalDurationMs,
    ],
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
