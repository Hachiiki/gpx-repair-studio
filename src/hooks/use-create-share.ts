/**
 * useCreateShare — the share-card binding of the "create from activity
 * stats" section (the review phase's companion view).
 *
 * The create counterpart of the repair studio's `useShareCard`: the same
 * painter contract (one `ShareCardSpec` feeds the live preview canvas and
 * the PNG export — WYSIWYG, applied to pixels), the same fonts, the same
 * download utility. What differs is the source of the numbers: there is no
 * parsed file — the route is the drawn (or watch-scaled) track and the
 * trio is the file's own arithmetic:
 *
 *   - Distance — the FINAL distance the GPX carries (drawn by default,
 *     the watch's when the user chose it — never a third number);
 *   - Pace — the recorded duration ÷ that distance (the implied pace the
 *     review card shows, never the entered pace re-stated);
 *   - Time — the recorded total, verbatim.
 *
 * The honesty notes say what the activity is: reconstructed by hand from
 * the watch's statistics, with the basis named and the elevation (when
 * estimated) attributed — the card itself shows the trio only.
 *
 * "Create from activity stats" section. Client-side hook.
 */

"use client";

import { useCallback, useMemo } from "react";
import { impliedPaceMsPerUnit } from "@/features/create/stats";
import { createTrackFileName } from "@/features/create/track";
import { loadShareCardFonts } from "@/lib/share/fonts";
import {
  paintShareCardCanvas,
  type ShareCardSpec,
} from "@/lib/share/render";
import {
  downloadBlobFile,
  shareCardFileName,
} from "@/lib/utils/download";
import {
  formatDistanceForUnit,
  formatDurationMs,
  formatPaceMs,
  type PaceUnit,
} from "@/lib/utils/format";
import type { LatLon } from "@/types/domain";
import { useUiStore } from "@/state/ui-store";
import type { CreateReview } from "@/hooks/use-create-export";
import type { CreateElevationAttachment } from "@/hooks/use-create-elevation";

// App-layer facade re-export (components may not import feature internals
// — the ESLint boundary, §F).
export type { ShareCardSpec } from "@/lib/share/render";

/** PNG export scales: 1 = the spec's 1080×1920, 2 = sharper 2160×3840. */
export type CreateSharePngScale = 1 | 2;

/** The card's trio plus the honesty notes around it (create voice). */
export interface CreateShareContent {
  distance: string;
  pace: string;
  time: string;
  /** Why each number is what it is (the "What the numbers mean" card). */
  notes: readonly string[];
  /** True when the exported file carries estimated elevation. */
  includesEstimatedElevation: boolean;
}

/** Everything the create share view (and its download button) needs. */
export interface CreateShareBinding {
  content: CreateShareContent;
  /** The painter's input — the same spec the PNG export paints. */
  spec: ShareCardSpec;
  /** §J-2 pace unit toggle (shared app-wide). */
  paceUnit: PaceUnit;
  setPaceUnit: (unit: PaceUnit) => void;
  /** Paint offscreen at `scale` and hand the PNG to the browser. */
  downloadPng: (scale: CreateSharePngScale) => void;
}

export function useCreateShare(
  review: CreateReview | null,
  elevation: CreateElevationAttachment | null,
): CreateShareBinding | null {
  const paceUnit = useUiStore((s) => s.paceUnit);

  const setPaceUnit = useCallback((unit: PaceUnit) => {
    useUiStore.getState().setPaceUnit(unit);
  }, []);

  const content = useMemo<CreateShareContent | null>(() => {
    if (!review) return null;
    const { track, stats } = review;
    const distance = formatDistanceForUnit(track.finalDistanceM, paceUnit);
    const paceMs = impliedPaceMsPerUnit(
      stats.durationMs,
      track.finalDistanceM,
      paceUnit,
    );
    const pace = paceMs === null ? "—" : `${formatPaceMs(paceMs)} /${paceUnit}`;
    const time = formatDurationMs(stats.durationMs);
    const notes: string[] = [
      "Route reconstructed by hand from the statistics your watch recorded.",
      track.scaleApplied
        ? "Distance is your watch's number — the drawn shape was scaled uniformly to it."
        : "Distance is the route you drew.",
      "Time is the total you entered; pace is time divided by that distance.",
    ];
    if (elevation) {
      notes.push(
        `The exported file carries estimated elevation from ${elevation.providerName} — the card shows distance, pace, and time only.`,
      );
    }
    return {
      distance,
      pace,
      time,
      notes,
      includesEstimatedElevation: elevation !== null,
    };
  }, [review, paceUnit, elevation]);

  const spec = useMemo<ShareCardSpec | null>(
    () =>
      review && content
        ? {
            // One polyline — the whole route as the file carries it (the
            // final basis, gaps-free by construction).
            routePolyline: [
              review.track.path.map(
                (point) => ({ lat: point.lat, lon: point.lon }) as LatLon,
              ),
            ],
            distance: content.distance,
            pace: content.pace,
            time: content.time,
          }
        : null,
    [review, content],
  );

  const downloadPng = useCallback(
    (scale: CreateSharePngScale) => {
      if (!review || !spec) return;
      const startMs = review.stats.startMs;
      void (async () => {
        // The export must not race the font fetch on a cold session.
        await loadShareCardFonts();
        const canvas = document.createElement("canvas");
        paintShareCardCanvas(canvas, spec, { scale });
        canvas.toBlob((blob) => {
          if (blob) {
            downloadBlobFile(
              shareCardFileName(createTrackFileName(startMs)),
              blob,
            );
          }
        }, "image/png");
      })();
    },
    [review, spec],
  );

  if (!review || !content || !spec) return null;
  return {
    content,
    spec,
    paceUnit,
    setPaceUnit,
    downloadPng,
  };
}
