/**
 * useMergeShare — the share-card binding of the Merge section (the
 * arrangement view's companion).
 *
 * The merge counterpart of the repair studio's `useShareCard` and the
 * create section's `useCreateShare`: the same painter contract (one
 * `ShareCardSpec` feeds the live preview canvas and the PNG export —
 * WYSIWYG, applied to pixels), the same fonts, the same download
 * utility. What differs is the source of the numbers — there is no
 * single recorded file, but the derivation is the SAME one the studio
 * shows:
 *
 *   - the route is the merged route view (the same `buildRouteView`
 *     join the merge map renders — damage-split lines plus any
 *     re-imported reconstruction runs, never a fabricated connector);
 *   - the trio comes from `buildShareCardContent` over the MERGED
 *     model's own statistics (§L-2 honesty: "—" with reasons, never
 *     invented values), so the card and the statistics panel can
 *     never disagree;
 *   - the notes say what the activity is: a combination of N
 *     recordings, every point carried over verbatim.
 *
 * Task 44 — Merge section share flow. Client-side hook.
 */

"use client";

import { useCallback, useMemo } from "react";
import { buildShareCardContent } from "@/features/share/cardContent";
import { buildRouteView } from "@/hooks/use-map-controller";
import { loadShareCardFonts } from "@/lib/share/fonts";
import {
  paintShareCardCanvas,
  type ShareCardSpec,
} from "@/lib/share/render";
import {
  downloadBlobFile,
  shareCardFileName,
} from "@/lib/utils/download";
import type { PaceUnit } from "@/lib/utils/format";
import type { LatLon } from "@/types/domain";
import { useUiStore } from "@/state/ui-store";
import { useI18n } from "@/hooks/use-i18n";
import type { MergedView } from "@/hooks/use-merge-session";
import { mergedFileName } from "@/hooks/use-merge-session";

// App-layer facade re-export (components may not import feature internals
// — the ESLint boundary, §F).
export type { ShareCardContent } from "@/features/share/cardContent";
export type { ShareCardSpec } from "@/lib/share/render";

/** PNG export scales: 1 = the spec's 1080×1920, 2 = sharper 2160×3840. */
export type MergeSharePngScale = 1 | 2;

/** Everything the merge share view (and its download button) needs. */
export interface MergeShareBinding {
  /** The derived trio + honesty notes (the merged model's own numbers). */
  content: ReturnType<typeof buildShareCardContent>;
  /** The painter's input — the same spec the PNG export paints. */
  spec: ShareCardSpec;
  /** §J-2 pace unit toggle (shared app-wide). */
  paceUnit: PaceUnit;
  setPaceUnit: (unit: PaceUnit) => void;
  /** Paint offscreen at `scale` and hand the PNG to the browser. */
  downloadPng: (scale: MergeSharePngScale) => void;
}

export function useMergeShare(
  merged: MergedView | null,
  combinedName: string,
  fileCount: number,
): MergeShareBinding | null {
  const paceUnit = useUiStore((s) => s.paceUnit);
  const { t } = useI18n();

  const setPaceUnit = useCallback((unit: PaceUnit) => {
    useUiStore.getState().setPaceUnit(unit);
  }, []);

  // The route: the same view the merge map renders — converted from
  // GeoJSON [lon, lat] pairs to the domain's LatLon. Recomputed for a
  // new arrangement (reorder/rename/remove all flow through `merged`).
  const polylines = useMemo(() => {
    if (!merged) return [] as (readonly LatLon[])[];
    const view = buildRouteView(merged.model, []);
    return [...view.lines, ...view.reconstructions].map((part) =>
      part.coordinates.map(([lon, lat]) => ({ lat, lon }) as LatLon),
    );
  }, [merged]);

  const content = useMemo(() => {
    if (!merged) return null;
    const derived = buildShareCardContent({
      distance: merged.distanceStats,
      time: merged.timeStats,
      reimport: merged.reimport,
      unit: paceUnit,
    });
    return {
      ...derived,
      notes: [
        t("hook.share.mergeNoteCombined", { count: fileCount }),
        ...derived.notes,
      ],
    };
  }, [merged, paceUnit, fileCount, t]);

  const spec = useMemo<ShareCardSpec | null>(
    () =>
      merged && content
        ? {
            routePolyline: polylines,
            distance: content.distance,
            pace: content.pace,
            time: content.time,
          }
        : null,
    [merged, content, polylines],
  );

  const downloadPng = useCallback(
    (scale: MergeSharePngScale) => {
      if (!merged || !spec) return;
      const gpxName = mergedFileName(combinedName);
      void (async () => {
        // The export must not race the font fetch on a cold session.
        await loadShareCardFonts();
        const canvas = document.createElement("canvas");
        paintShareCardCanvas(canvas, spec, { scale });
        canvas.toBlob((blob) => {
          if (blob) {
            downloadBlobFile(shareCardFileName(gpxName), blob);
          }
        }, "image/png");
      })();
    },
    [merged, spec, combinedName],
  );

  if (!merged || !content || !spec) return null;
  return {
    content,
    spec,
    paceUnit,
    setPaceUnit,
    downloadPng,
  };
}
