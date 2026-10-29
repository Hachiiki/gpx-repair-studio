/**
 * useCreatePace — the review phase's paced-timeline binding (Task 73).
 *
 * One basis for three consumers: the pace preview card's chart, the
 * review's honesty notes, and (through the pure `pacedTimesForFile`)
 * the exported file's timestamps. The timeline derives from the review
 * track + the store's pace plan + the elevation attachment (the same
 * fresh estimate the export joins) — so what the preview draws and
 * what the file carries can never disagree.
 *
 * The splits (the bar graph's series) are computed here too, against
 * the UI's pace unit — the §D-6 rule: components receive data through
 * hooks, never from feature internals directly.
 *
 * "Create from activity stats" section. Client-side hook.
 */

"use client";

import { useMemo } from "react";
import {
  buildPacedTimeline,
  elevationAtFromSamples,
  paceSplits,
  type PaceSplit,
  type PacedTimeline,
} from "@/features/create/pace";
import type { CreateTrack } from "@/features/create/track";
import {
  createElevationForOutput,
  type CreateElevationAttachment,
} from "@/hooks/use-create-elevation";
import { PACE_METERS_PER_UNIT } from "@/lib/utils/format";
import { useCreateStore } from "@/state/create-store";
import { useUiStore } from "@/state/ui-store";

/** The preview's types (re-exported for the components' §D-6 imports). */
export type { PacedTimeline, PaceSplit } from "@/features/create/pace";
export type { CreateTrack } from "@/features/create/track";

export interface CreatePaceBinding {
  /** The paced timeline (null when nothing shapes the curve). */
  timeline: PacedTimeline | null;
  /** The splits' pace over that timeline, per the UI's pace unit. */
  splits: readonly PaceSplit[];
}

/**
 * The review track's paced timeline. `stats.durationMs` is the watch's
 * truth — the timeline always totals exactly it; `elevation` is the
 * fresh attachment (null when absent/stale/failed — the flat model).
 */
export function useCreatePace(
  track: CreateTrack | null,
  stats: { durationMs: number; startMs: number } | null,
  elevation: CreateElevationAttachment | null,
): CreatePaceBinding {
  const paceSegments = useCreateStore((s) => s.paceSegments);
  const paceUnit = useUiStore((s) => s.paceUnit);
  // Task 74 — the wobble plan + its seed ride the timeline's basis: the
  // preview's elevation (and the Minetti breathing it feeds) is the
  // watch-treated series the file will carry, never a cleaner one.
  const wobbleSegments = useCreateStore((s) => s.wobbleSegments);
  const noiseSeed = useCreateStore((s) => s.noiseSeed);

  const outputElevation = useMemo(
    () =>
      wobbleSegments.length === 0
        ? elevation
        : createElevationForOutput(elevation),
    [elevation, wobbleSegments, noiseSeed],
  );

  const timeline = useMemo(() => {
    if (!track || !stats) return null;
    return buildPacedTimeline(
      track,
      stats.durationMs,
      stats.startMs,
      paceSegments,
      elevationAtFromSamples(outputElevation?.samples ?? null),
    );
  }, [track, stats, paceSegments, outputElevation]);

  const splits = useMemo(() => {
    if (!track || !timeline) return [];
    return paceSplits(timeline, track, PACE_METERS_PER_UNIT[paceUnit]);
  }, [timeline, track, paceUnit]);

  return { timeline, splits };
}
