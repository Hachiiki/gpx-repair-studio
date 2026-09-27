/**
 * useCreateElevation — the "create from activity stats" section's elevation
 * binding (the review phase's opt-in terrain lookup).
 *
 * A mirror of the repair studio's `useElevation` / the recovery section's
 * `useRecoveryElevation`, reading the create store instead of the editor or
 * recovery store (the Task 26 isolation rule): the shared logic lives in the
 * pure elevation feature modules every hook consumes — samples, the store,
 * the provider. The drawn route's FINAL track (whichever distance basis is
 * active) gets its elevations from the same DEM provider, with the same
 * disclosure-first contract and the same honest staleness labeling.
 *
 * Differences from the per-gap mirrors, all consequences of the create
 * workflow's shape:
 *   - there is exactly ONE fetch subject — the whole route (store key
 *     `create::route`, the recovery `recovery::` namespacing pattern);
 *   - the fetch candidates are the final track's points (resampled and,
 *     when the user chose it, scaled), so a distance-basis change stales
 *     the record (see features/create/elevation.ts);
 *   - the fetch runs from the review phase only — estimating mid-draw
 *     would go stale on the next vertex edit, so the controls live in the
 *     review card next to the export they feed.
 *
 * Also exports `readFreshCreateElevation` — the imperative read the export
 * hook's download intent uses at click time (one freshness rule, two
 * consumers: the reactive attachment for the UI, the click-time read for
 * the file).
 *
 * "Create from activity stats" section. Client-side hook.
 */

"use client";

import { useCallback, useMemo } from "react";
import type {
  ElevationFailureReason,
  ElevationProvider,
} from "@/features/elevation/provider";
import {
  gapElevationSummary,
  interpolateSample,
  pickFetchPoints,
  type ElevationSample,
} from "@/features/elevation/samples";
import {
  CREATE_ELEVATION_STORE_KEY,
  createElevationSignature,
} from "@/features/create/elevation";
import {
  buildCreateTrack,
  type CreateTrack,
} from "@/features/create/track";
import { DEFAULT_HYSTERESIS_THRESHOLD_M } from "@/features/elevation/smoothing";
import { useCreateStore } from "@/state/create-store";
import { useElevationStore } from "@/state/elevation-store";
import { getElevationProvider } from "@/hooks/use-elevation";
import type { ElevationControlsBinding } from "@/hooks/use-elevation";
import type { LatLon } from "@/types/domain";

/** Rounds a raw request count the way the disclosure presents it. */
function requestCountFor(sentPoints: number): number {
  return Math.max(1, Math.ceil(sentPoints / 100));
}

/** Honest failure copy by reason (§K-2) — the shared mapping. */
function elevationFailureMessage(reason: ElevationFailureReason | null): string {
  switch (reason) {
    case "network":
      return "The elevation service could not be reached — check your connection and try again.";
    case "throttled":
      return "The elevation service is rate-limiting requests — wait a few seconds and try again.";
    case "server":
      return "The elevation service is having trouble right now — try again in a moment.";
    case "bad-response":
      return "The elevation service returned an unexpected response — try again in a moment.";
    default:
      return "The elevation service returned no usable data — try again in a moment.";
  }
}

/** Fresh estimated elevation for the create route (the export's join). */
export interface CreateElevationAttachment {
  /** Ordered samples (ascending cumulative distance). */
  samples: readonly ElevationSample[];
  /** Provider display name (attribution copy). */
  providerName: string;
}

/**
 * Read the create route's elevation record and judge it fresh against the
 * CURRENT store state (revision + road legs + distance basis — the track
 * is REBUILT from the store, the same fresh-snapshot rule the fetch
 * follows, so a caller's stale closure can never smuggle old samples
 * into a file). Returns `null` when absent, failed, or stale — the
 * export then carries no `<ele>`, exactly like a stale repair's.
 * Usable outside React (the download intent reads it at click time).
 */
export function readFreshCreateElevation(): CreateElevationAttachment | null {
  const record =
    useElevationStore.getState().byGap[CREATE_ELEVATION_STORE_KEY] ?? null;
  if (!record || (record.status !== "complete" && record.status !== "partial")) {
    return null;
  }
  const create = useCreateStore.getState();
  if (!create.stats || create.reconstruction.vertices.length === 0) {
    return null;
  }
  const track = buildCreateTrack(create.stats, {
    vertices: create.reconstruction.vertices,
    roadLegs: create.roadLegs,
    spacingM: create.spacingM,
    matchDistance: create.matchDistance,
  });
  if (!track) return null;
  if (record.fetchedAtRevision !== create.reconstruction.geometryRevision) {
    return null;
  }
  if (
    record.fetchedAtRoadSignature !==
    createElevationSignature(track, create.roadLegs, create.sessionSeq)
  ) {
    return null;
  }
  const provider: ElevationProvider = getElevationProvider();
  return {
    samples: record.samples,
    providerName:
      record.providerId === provider.id ? provider.name : record.providerId,
  };
}

/**
 * The create route's elevation controls + the fresh attachment. The track
 * is the review's final population (from `useCreateExport`) — the fetch,
 * the staleness rule, and the export all judge against the SAME basis.
 */
export function useCreateElevation(track: CreateTrack | null): {
  controls: ElevationControlsBinding;
  /** Fresh samples for the current basis (null when absent/stale/failed). */
  attachment: CreateElevationAttachment | null;
} {
  const byGap = useElevationStore((s) => s.byGap);
  const geometryRevision = useCreateStore(
    (s) => s.reconstruction.geometryRevision,
  );
  const roadLegs = useCreateStore((s) => s.roadLegs);
  const sessionSeq = useCreateStore((s) => s.sessionSeq);

  const provider = getElevationProvider();
  const record = byGap[CREATE_ELEVATION_STORE_KEY] ?? null;

  // -- freshness -----------------------------------------------------------------
  //
  // No lifecycle clearing: a full reset bumps `sessionSeq`, which changes
  // the signature below — the record goes HONESTLY STALE (excluded from
  // export, re-estimate offered) instead of being silently dropped, and
  // "Back to statistics" keeps a still-valid estimate for the same route.

  const currentSignature = useMemo(
    () =>
      track ? createElevationSignature(track, roadLegs, sessionSeq) : null,
    [track, roadLegs, sessionSeq],
  );

  const stale =
    record !== null &&
    record.status !== "fetching" &&
    (record.fetchedAtRevision !== geometryRevision ||
      record.fetchedAtRoadSignature !== currentSignature);

  const status: ElevationControlsBinding["status"] = !record
    ? "not-fetched"
    : record.status === "fetching"
      ? "fetching"
      : stale
        ? "stale"
        : record.status;

  // The disclosure numbers for the CURRENT track (null outside review).
  const disclosure = useMemo(() => {
    if (!track || track.path.length === 0) return null;
    const sent = pickFetchPoints(track.path);
    return {
      sentPoints: sent.length,
      totalPoints: track.path.length,
      requestCount: requestCountFor(sent.length),
    };
  }, [track]);

  const summary = useMemo(() => {
    if (
      !record ||
      (record.status !== "complete" && record.status !== "partial") ||
      stale
    ) {
      return null;
    }
    return gapElevationSummary(record.samples, DEFAULT_HYSTERESIS_THRESHOLD_M);
  }, [record, stale]);

  // -- the fetch -----------------------------------------------------------------

  const confirmFetch = useCallback(() => {
    // Rebuild the track from the store at click time (the same
    // fresh-snapshot rule the repair hooks follow) — a road leg resolving
    // between the render and the click can never desynchronize the
    // recorded signature from the fetched geometry.
    const store = useCreateStore.getState();
    const stats = store.stats;
    if (!stats) return;
    const freshTrack = buildCreateTrack(stats, {
      vertices: store.reconstruction.vertices,
      roadLegs: store.roadLegs,
      spacingM: store.spacingM,
      matchDistance: store.matchDistance,
    });
    if (!freshTrack || freshTrack.path.length === 0) return;

    const sent = pickFetchPoints(freshTrack.path);
    const fetchSeq = useElevationStore.getState().beginFetch(
      CREATE_ELEVATION_STORE_KEY,
      {
        providerId: provider.id,
        fetchedAtRevision: store.reconstruction.geometryRevision,
        fetchedAtRoadSignature: createElevationSignature(
          freshTrack,
          store.roadLegs,
          store.sessionSeq,
        ),
        totalPoints: freshTrack.path.length,
        sentPoints: sent.length,
      },
    );

    let failureReason: ElevationFailureReason | null = null;
    void provider
      .getElevations(
        sent.map((point): LatLon => ({ lat: point.lat, lon: point.lon })),
        {
          onProgress: (answered, resolved) =>
            useElevationStore
              .getState()
              .setProgress(CREATE_ELEVATION_STORE_KEY, fetchSeq, answered, resolved),
          onBatchFailure: (reason) => {
            failureReason = reason;
          },
        },
      )
      .then((values) => {
        const samples: ElevationSample[] = [];
        for (let i = 0; i < sent.length; i += 1) {
          const value = values[i];
          if (value !== undefined) {
            samples.push({ cumDistanceM: sent[i].cumDistanceM, ele: value });
          }
        }
        samples.sort((a, b) => a.cumDistanceM - b.cumDistanceM);
        const resolved = samples.length;
        useElevationStore.getState().finish(CREATE_ELEVATION_STORE_KEY, fetchSeq, {
          status:
            resolved === 0
              ? "failed"
              : resolved === sent.length
                ? "complete"
                : "partial",
          samples,
          resolvedPoints: resolved,
          ...(resolved === 0
            ? { error: elevationFailureMessage(failureReason) }
            : {}),
        });
      })
      .catch(() => {
        useElevationStore.getState().finish(CREATE_ELEVATION_STORE_KEY, fetchSeq, {
          status: "failed",
          samples: [],
          resolvedPoints: 0,
          error: elevationFailureMessage("network"),
        });
      });
  }, [provider]);

  const controls: ElevationControlsBinding = {
    canFetch: track !== null && track.path.length > 0,
    blockedReason: null,
    status,
    stale,
    fetching: record?.status === "fetching",
    answered: record?.answeredPoints ?? 0,
    sent: record?.sentPoints ?? 0,
    total: record?.totalPoints ?? 0,
    resolved: record?.resolvedPoints ?? 0,
    disclosure,
    providerName: provider.name,
    attribution: provider.attribution,
    privacyNote: provider.privacyNote,
    summary,
    error: record?.error ?? null,
    confirmFetch,
  };

  const attachment = useMemo(
    () => (stale ? null : readFreshCreateElevation()),
    // The read rebuilds from the store; the deps list every input it
    // consumes (track covers stats/vertices/spacing/matchDistance).
    [stale, record, track, geometryRevision, roadLegs, sessionSeq],
  );

  return { controls, attachment };
}

/**
 * Interpolate the attachment's samples onto a track path point — the
 * export's per-point join (`elevation-api` at sample hits, `interpolated`
 * between them, `undefined` outside the sampled span).
 */
export function createPointElevation(
  attachment: CreateElevationAttachment | null,
  cumDistanceM: number,
): { value: number; method: "elevation-api" | "interpolated" } | undefined {
  if (!attachment) return undefined;
  return interpolateSample(attachment.samples, cumDistanceM);
}
