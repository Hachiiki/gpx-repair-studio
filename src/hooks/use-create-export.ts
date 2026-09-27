/**
 * useCreateExport — the export orchestration hook of the "create from
 * activity stats" section.
 *
 * Builds the final track population (the review card's every number and
 * the map's review line derive from the SAME pure `buildCreateTrack` —
 * one basis, they can never disagree) and serializes + downloads it as a
 * standalone GPX 1.1 through the shared exporter (`exportGpxGenerated`):
 * the drawn route's geometry as drawn (the default distance basis), or
 * the same shape scaled to the recorded distance when the user chose
 * their watch's number, and the recorded duration distributed across
 * the points by movement along the route.
 *
 * "Create from activity stats" section. Client-side hook.
 */

"use client";

import { useCallback, useMemo } from "react";
import {
  buildCreateTrack,
  createTrackFileName,
  type CreateTrack,
} from "@/features/create/track";
import { exportGpxGenerated } from "@/features/gpx/exportGpx";
import { createDomXmlIo } from "@/lib/utils/xml";
import { downloadTextFile } from "@/lib/utils/download";
import { useCreateStore } from "@/state/create-store";
import { useUiStore } from "@/state/ui-store";

/** The review-phase view (null until a finishable route + stats exist). */
export interface CreateReview {
  /** The final track — one basis for the card, the map, and the export. */
  track: CreateTrack;
  /** The statistics the route reconciles against (the store's snapshot). */
  stats: { distanceM: number; durationMs: number; startMs: number };
  /** Serialize + download; returns the file name handed to the browser. */
  download: () => string | null;
  /**
   * The distance-basis choice: false (default) keeps the drawn geometry,
   * true scales the shape to the recorded distance.
   */
  setMatchDistance: (on: boolean) => void;
}

export function useCreateExport(): CreateReview | null {
  const phase = useCreateStore((s) => s.phase);
  const stats = useCreateStore((s) => s.stats);
  const vertices = useCreateStore((s) => s.reconstruction.vertices);
  const roadLegs = useCreateStore((s) => s.roadLegs);
  const spacingM = useCreateStore((s) => s.spacingM);
  const matchDistance = useCreateStore((s) => s.matchDistance);
  const setMatchDistance = useCreateStore((s) => s.setMatchDistance);
  const prettyPrint = useUiStore((s) => s.exportPrettyPrint);

  const track = useMemo(
    () =>
      stats
        ? buildCreateTrack(stats, {
            vertices,
            roadLegs,
            spacingM,
            matchDistance,
          })
        : null,
    [stats, vertices, roadLegs, spacingM, matchDistance],
  );

  const download = useCallback((): string | null => {
    if (!stats || !track) return null;
    const xml = exportGpxGenerated(
      {
        trackName: "Reconstructed activity",
        description:
          "Route reconstructed by hand in GPX Repair Studio from activity " +
          "statistics recorded by the watch (distance, pace, time). " +
          "Timestamps are estimated from the recorded total time; no GPS " +
          "was recorded and no elevation is included.",
        points: track.path.map((point, index) => ({
          lat: point.lat,
          lon: point.lon,
          timeMs: track.times[index]?.value ?? stats.startMs,
          timeMethod: track.times[index]?.method ?? "distance-proportional",
        })),
        ...(prettyPrint ? { prettyPrint } : {}),
      },
      createDomXmlIo(),
    );
    const fileName = createTrackFileName(stats.startMs);
    downloadTextFile(fileName, xml);
    return fileName;
  }, [stats, track, prettyPrint]);

  // The review exposes the reconciliation toggle alongside the track —
  // the card drives it, the rebuild follows it (pure derivation).
  const setMatch = useCallback(
    (on: boolean) => setMatchDistance(on),
    [setMatchDistance],
  );

  if (phase !== "review" || !stats || !track) return null;
  return {
    track,
    stats,
    download,
    setMatchDistance: setMatch,
  };
}
