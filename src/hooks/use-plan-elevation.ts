/**
 * usePlanElevation — the "plan a route" section's elevation binding
 * (the opt-in terrain lookup over the drawn route).
 *
 * A mirror of the create section's `useCreateElevation`, reading the
 * plan store instead (the section-isolation rule): the shared logic
 * lives in the pure elevation feature modules every hook consumes —
 * samples, the store, the provider. The drawn route's RENDERED JOIN
 * (road legs / spline / straight — the same join the map draws) gets
 * its elevations from the same DEM provider, with the same
 * disclosure-first contract and the same honest staleness labeling.
 *
 * Differences from the create mirror, all consequences of the planner's
 * shape:
 *   - the fetch subject is the JOIN itself (the rendered points with
 *     their cumulative distances) — the planner generates no track and
 *     exports nothing, so there is no resample spacing and no distance
 *     basis to stale against;
 *   - there is no attachment to read back — nothing consumes the
 *     samples but the summary the estimates card displays;
 *   - the freshness signature is plan-specific (legs + path style +
 *     session token — see features/plan/estimate.ts).
 *
 * "Plan a route" section. Client-side hook.
 */

"use client";

import { useCallback, useMemo } from "react";
import type {
  ElevationFailureReason,
  ElevationProvider,
} from "@/features/elevation/provider";
import {
  gapElevationSummary,
  pickFetchPoints,
  type ElevationSample,
} from "@/features/elevation/samples";
import {
  planElevationSignature,
  planJoin,
  PLAN_ELEVATION_STORE_KEY,
} from "@/features/plan/estimate";
import { DEFAULT_HYSTERESIS_THRESHOLD_M } from "@/features/elevation/smoothing";
import { usePlanStore } from "@/state/plan-store";
import { useElevationStore } from "@/state/elevation-store";
import { translateNow } from "@/i18n/runtime";
import { useI18n } from "@/hooks/use-i18n";
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
      return translateNow("hook.elevation.errorNetwork");
    case "throttled":
      return translateNow("hook.elevation.errorThrottled");
    case "server":
      return translateNow("hook.elevation.errorServer");
    case "bad-response":
      return translateNow("hook.elevation.errorBadResponse");
    default:
      return translateNow("hook.elevation.errorNoData");
  }
}

/**
 * The planner's elevation controls. Self-contained: the join is derived
 * from the store (the same fresh-snapshot rule every elevation hook
 * follows), so no track needs to be plumbed in.
 */
export function usePlanElevation(): {
  controls: ElevationControlsBinding;
} {
  const { t } = useI18n();
  const byGap = useElevationStore((s) => s.byGap);
  const geometryRevision = usePlanStore(
    (s) => s.reconstruction.geometryRevision,
  );
  const vertices = usePlanStore((s) => s.reconstruction.vertices);
  const roadLegs = usePlanStore((s) => s.roadLegs);
  // The LINE's remembered style — the join's whole-line fallback. The
  // ACTIVE chip style deliberately does NOT join this signature: a
  // mode switch never redraws the placed route (the per-segment
  // contract), so it must not stale the elevation record either.
  const lineStyle = usePlanStore(
    (s) => s.reconstruction.pathStyle ?? "off",
  );
  const sessionSeq = usePlanStore((s) => s.sessionSeq);

  const provider = getElevationProvider();
  const record = byGap[PLAN_ELEVATION_STORE_KEY] ?? null;

  // The current join — the fetch subject and the disclosure's basis.
  const join = useMemo(
    () => planJoin(vertices, roadLegs, lineStyle),
    [vertices, roadLegs, lineStyle],
  );

  // -- freshness -----------------------------------------------------------------
  //
  // No lifecycle clearing: a full reset bumps `sessionSeq`, which
  // changes the signature below — the record goes HONESTLY STALE
  // (re-estimate offered) instead of being silently dropped.

  const currentSignature = useMemo(
    () => planElevationSignature(roadLegs, lineStyle, sessionSeq),
    [roadLegs, lineStyle, sessionSeq],
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

  // The disclosure numbers for the CURRENT join (null when nothing is
  // drawn yet).
  const disclosure = useMemo(() => {
    if (join.points.length === 0) return null;
    const sent = pickFetchPoints(join.points);
    return {
      sentPoints: sent.length,
      totalPoints: join.points.length,
      requestCount: requestCountFor(sent.length),
    };
  }, [join]);

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
    // Rebuild the join from the store at click time (the same
    // fresh-snapshot rule the other elevation hooks follow) — a road
    // leg resolving between the render and the click can never
    // desynchronize the recorded signature from the fetched geometry.
    const store = usePlanStore.getState();
    if (store.phase !== "studio") return;
    const freshJoin = planJoin(
      store.reconstruction.vertices,
      store.roadLegs,
      store.reconstruction.pathStyle ?? "off",
    );
    if (freshJoin.points.length === 0) return;

    const sent = pickFetchPoints(freshJoin.points);
    const fetchSeq = useElevationStore.getState().beginFetch(
      PLAN_ELEVATION_STORE_KEY,
      {
        providerId: provider.id,
        fetchedAtRevision: store.reconstruction.geometryRevision,
        fetchedAtRoadSignature: planElevationSignature(
          store.roadLegs,
          store.reconstruction.pathStyle ?? "off",
          store.sessionSeq,
        ),
        totalPoints: freshJoin.points.length,
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
              .setProgress(PLAN_ELEVATION_STORE_KEY, fetchSeq, answered, resolved),
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
        useElevationStore.getState().finish(PLAN_ELEVATION_STORE_KEY, fetchSeq, {
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
        useElevationStore.getState().finish(PLAN_ELEVATION_STORE_KEY, fetchSeq, {
          status: "failed",
          samples: [],
          resolvedPoints: 0,
          error: elevationFailureMessage("network"),
        });
      });
  }, [provider]);

  const canFetch = join.points.length >= 2;

  const controls: ElevationControlsBinding = {
    canFetch,
    blockedReason: canFetch
      ? null
      : t("hook.elevation.blockedTwoPoints"),
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
    privacyNoteKey: provider.privacyNoteKey,
    summary,
    error: record?.error ?? null,
    confirmFetch,
  };

  return { controls };
}
