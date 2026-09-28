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
 * Elevation joins at DOWNLOAD time: the opt-in terrain estimate (see
 * `useCreateElevation`) is read fresh from the store at click time —
 * `<ele>` values + `eleMethod` markers and the attribution note ride
 * along only while the estimate matches the current basis; a stale or
 * absent estimate exports a file with no elevation at all, never a
 * fabricated one.
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
import {
  createPointElevation,
  readFreshCreateElevation,
} from "@/hooks/use-create-elevation";
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
  const pathStyle = useCreateStore((s) => s.pathStyle);
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
            pathStyle,
          })
        : null,
    [stats, vertices, roadLegs, spacingM, matchDistance, pathStyle],
  );

  const download = useCallback((): string | null => {
    if (!stats || !track) return null;
    // The click-time elevation join: rebuilt fresh from the store and
    // judged against the CURRENT basis — or nothing (the honest rule: a
    // stale estimate never exports).
    const elevation = readFreshCreateElevation();
    const points = track.path.map((point, index) => {
      const ele = createPointElevation(elevation, point.cumDistanceM);
      return {
        lat: point.lat,
        lon: point.lon,
        timeMs: track.times[index]?.value ?? stats.startMs,
        timeMethod: track.times[index]?.method ?? "distance-proportional",
        ...(ele !== undefined ? { ele } : {}),
      };
    });
    const description =
      "Route reconstructed by hand in GPX Repair Studio from activity " +
      "statistics recorded by the watch (distance, pace, time). " +
      "Timestamps are estimated from the recorded total time; no GPS " +
      "was recorded. " +
      (elevation
        ? `Elevation of generated points estimated from ${elevation.providerName}.`
        : "No elevation is included.");
    const xml = exportGpxGenerated(
      {
        trackName: "Reconstructed activity",
        description,
        points,
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
