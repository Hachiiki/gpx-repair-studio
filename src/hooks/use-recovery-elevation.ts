/**
 * useRecoveryElevation — the Gap Recovery section's elevation binding
 * (Task 28).
 *
 * A mirror of the repair studio's `useElevation`, reading the recovery
 * store instead of the editor store (the Task 26 isolation rule: the
 * existing hook stays untouched; the shared logic lives in the pure
 * elevation feature modules both hooks consume — samples, smoothing,
 * the store). The drawn "unmeasured section" gets its elevations from
 * the same DEM provider the repair studio uses (shared instance + LRU
 * cache), with the same disclosure-first contract and the same honest
 * staleness/partial labeling.
 *
 * Section isolation: the two sections can hold the SAME file, so their
 * gap ids can collide. This mirror therefore keys every elevation-store
 * record with a `recovery::` prefix — the repair studio's records and
 * the recovery section's can never see (or prune) each other. The
 * export attachment maps the namespaced keys back onto real gap ids for
 * the merge sites.
 *
 * Task 28 — Gap Recovery section. Client-side hook.
 */

"use client";

import { useCallback, useEffect, useMemo } from "react";
import type {
  ElevationFailureReason,
  ElevationProvider,
} from "@/features/elevation/provider";
import {
  gapElevationSummary,
  pickFetchPoints,
  roadLegsSignature,
  type ElevationSample,
} from "@/features/elevation/samples";
import { resamplePath } from "@/features/reconstruction/resample";
import { DEFAULT_HYSTERESIS_THRESHOLD_M } from "@/features/elevation/smoothing";
import { useRecoveryStore } from "@/state/recovery-store";
import { useElevationStore } from "@/state/elevation-store";
import { getElevationProvider } from "@/hooks/use-elevation";
import type {
  ElevationAttachment,
  ElevationControlsBinding,
} from "@/hooks/use-elevation";
import type { GapId, LatLon } from "@/types/domain";
import type { RecoverySession } from "@/hooks/use-recovery-session";
import type { DrawEditorBinding } from "@/hooks/use-draw-editor";

/** Namespaced store key — recovery records can never collide with the
 * repair studio's, even when both sections hold the same file. */
function recoveryKey(gapId: GapId): GapId {
  return `recovery::${gapId}` as GapId;
}

/** Rounds a raw request count the way the disclosure presents it. */
function requestCountFor(sentPoints: number): number {
  return Math.max(1, Math.ceil(sentPoints / 100));
}

/**
 * Honest failure copy by reason (§K-2) — the same mapping the repair
 * studio's hook renders.
 */
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

export function useRecoveryElevation(
  session: RecoverySession,
  draw: DrawEditorBinding,
): {
  controls: ElevationControlsBinding;
  attachment: ElevationAttachment;
  fetchedCount: number;
} {
  const byGap = useElevationStore((s) => s.byGap);
  const reconstructions = useRecoveryStore((s) => s.reconstructions);
  const roadLegs = useRecoveryStore((s) => s.roadLegs);
  const activeGapId = useRecoveryStore((s) => s.activeGapId);
  const manualSpans = useRecoveryStore((s) => s.manualSpans);

  const provider: ElevationProvider = getElevationProvider();
  const activeGap = draw.activeGap;

  // -- lifecycle hygiene (same contract as the draw hook) --------------------

  // NOTE: the elevation store's `prune` keeps ONLY the given ids, so this
  // mirror must never call it with its namespaced subset — that would
  // wipe the repair studio's records. Removal is per-key `clear` over
  // this section's namespaced keys only.
  useEffect(() => {
    if (session.status !== "parsed") {
      const keys = Object.keys(useElevationStore.getState().byGap)
        .filter((id) => id.startsWith("recovery::"));
      for (const key of keys) {
        useElevationStore.getState().clear(key as GapId);
      }
    }
  }, [session.status]);

  useEffect(() => {
    const known = new Set<string>(
      [
        ...session.gapRows.map((row) => row.id),
        ...manualSpans.map((span) => span.id),
      ].map((id) => recoveryKey(id)),
    );
    const stale = Object.keys(useElevationStore.getState().byGap).filter(
      (id) => id.startsWith("recovery::") && !known.has(id),
    );
    for (const key of stale) {
      useElevationStore.getState().clear(key as GapId);
    }
  }, [session.gapRows, manualSpans]);

  // -- active-gap view ---------------------------------------------------------

  const activeRecon = activeGapId === null ? null : reconstructions[activeGapId] ?? null;
  const activeRecord =
    activeGapId === null ? null : byGap[recoveryKey(activeGapId)] ?? null;
  const activeLegs = useMemo(
    () => (activeGapId === null ? [] : (roadLegs[activeGapId] ?? [])),
    [activeGapId, roadLegs],
  );

  /** Freshness of one record against a reconstruction + its road legs. */
  const isStale = useCallback(
    (record: { fetchedAtRevision: number; fetchedAtRoadSignature: string }, gapId: GapId) => {
      const recon = reconstructions[gapId];
      if (!recon) return true;
      const currentSignature = roadLegsSignature(roadLegs[gapId] ?? []);
      return (
        record.fetchedAtRevision !== recon.geometryRevision ||
        record.fetchedAtRoadSignature !== currentSignature
      );
    },
    [reconstructions, roadLegs],
  );

  const nearAnchor = activeGap ? (activeGap.before ?? activeGap.after) : null;
  const farAnchor = activeGap?.before && activeGap?.after ? activeGap.after : null;

  /** The active chain's interior path points (the fetch candidates). */
  const activeInterior = useMemo(() => {
    if (!activeGap || !nearAnchor || !activeRecon || activeRecon.vertices.length === 0) {
      return null;
    }
    const path = resamplePath(
      { lat: nearAnchor.lat, lon: nearAnchor.lon },
      activeRecon.vertices,
      farAnchor ? { lat: farAnchor.lat, lon: farAnchor.lon } : null,
      activeRecon.resampleSpacingM,
      activeLegs,
    );
    return path.filter(
      (point) => point.role !== "before-anchor" && point.role !== "after-anchor",
    );
  }, [activeGap, nearAnchor, farAnchor, activeRecon, activeLegs]);

  const disclosure = useMemo(() => {
    if (!activeInterior) return null;
    const sent = pickFetchPoints(activeInterior);
    return {
      sentPoints: sent.length,
      totalPoints: activeInterior.length,
      requestCount: requestCountFor(sent.length),
    };
  }, [activeInterior]);

  const stale =
    activeRecord !== null &&
    activeRecord.status !== "fetching" &&
    activeGapId !== null &&
    isStale(activeRecord, activeGapId);

  const status: ElevationControlsBinding["status"] = !activeRecord
    ? "not-fetched"
    : activeRecord.status === "fetching"
      ? "fetching"
      : stale
        ? "stale"
        : activeRecord.status;

  const summary = useMemo(() => {
    if (
      !activeRecord ||
      (activeRecord.status !== "complete" && activeRecord.status !== "partial") ||
      stale
    ) {
      return null;
    }
    return gapElevationSummary(activeRecord.samples, DEFAULT_HYSTERESIS_THRESHOLD_M);
  }, [activeRecord, stale]);

  // -- the fetch ----------------------------------------------------------------

  const confirmFetch = useCallback(() => {
    const gapId = useRecoveryStore.getState().activeGapId;
    if (gapId === null) return;
    const recovery = useRecoveryStore.getState();
    const recon = recovery.reconstructions[gapId];
    if (!recon || recon.vertices.length === 0) return;
    const row = draw.activeGap;
    const near = row ? (row.before ?? row.after) : null;
    if (!near) return;
    const far = row?.before && row?.after ? row.after : null;
    const legs = recovery.roadLegs[gapId] ?? [];

    const path = resamplePath(
      { lat: near.lat, lon: near.lon },
      recon.vertices,
      far ? { lat: far.lat, lon: far.lon } : null,
      recon.resampleSpacingM,
      legs,
    );
    const interior = path.filter(
      (point) => point.role !== "before-anchor" && point.role !== "after-anchor",
    );
    if (interior.length === 0) return;
    const sent = pickFetchPoints(interior);

    const key = recoveryKey(gapId);
    const fetchSeq = useElevationStore.getState().beginFetch(key, {
      providerId: provider.id,
      fetchedAtRevision: recon.geometryRevision,
      fetchedAtRoadSignature: roadLegsSignature(legs),
      totalPoints: interior.length,
      sentPoints: sent.length,
    });

    let failureReason: ElevationFailureReason | null = null;
    void provider
      .getElevations(
        sent.map((point): LatLon => ({ lat: point.lat, lon: point.lon })),
        {
          onProgress: (answered, resolved) =>
            useElevationStore
              .getState()
              .setProgress(key, fetchSeq, answered, resolved),
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
        useElevationStore.getState().finish(key, fetchSeq, {
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
        useElevationStore.getState().finish(key, fetchSeq, {
          status: "failed",
          samples: [],
          resolvedPoints: 0,
          error: elevationFailureMessage("network"),
        });
      });
  }, [provider, draw.activeGap]);

  const controls: ElevationControlsBinding = {
    canFetch: draw.active && (activeRecon?.vertices.length ?? 0) > 0,
    blockedReason: !draw.active
      ? null
      : (activeRecon?.vertices.length ?? 0) === 0
        ? "Draw the missing route first — elevation is estimated for the points you draw."
        : null,
    status,
    stale,
    fetching: activeRecord?.status === "fetching",
    answered: activeRecord?.answeredPoints ?? 0,
    sent: activeRecord?.sentPoints ?? 0,
    total: activeRecord?.totalPoints ?? 0,
    resolved: activeRecord?.resolvedPoints ?? 0,
    disclosure,
    providerName: provider.name,
    attribution: provider.attribution,
    privacyNote: provider.privacyNote,
    summary,
    error: activeRecord?.error ?? null,
    confirmFetch,
  };

  // -- export attachment ----------------------------------------------------------

  const allRows = useMemo(
    () => [...session.gapRows, ...draw.manualRows],
    [session.gapRows, draw.manualRows],
  );

  const attachment = useMemo<ElevationAttachment>(() => {
    const samplesByGap: Record<
      string,
      { providerName: string; samples: readonly ElevationSample[] }
    > = {};
    let staleCount = 0;
    for (const row of allRows) {
      // Namespaced read — only this section's records exist under the key.
      const record = byGap[recoveryKey(row.id)];
      if (!record || (record.status !== "complete" && record.status !== "partial")) {
        continue;
      }
      const recon = reconstructions[row.id];
      if (!recon || recon.vertices.length === 0) continue;
      if (isStale(record, row.id)) {
        if (
          draw.statusById[row.id] === "reconstructed" &&
          row.id !== useRecoveryStore.getState().activeGapId
        ) {
          staleCount += 1;
        }
        continue;
      }
      samplesByGap[row.id] = {
        providerName: record.providerId === provider.id ? provider.name : record.providerId,
        samples: record.samples,
      };
    }
    return { samplesByGap, staleCount };
  }, [allRows, byGap, reconstructions, isStale, draw.statusById, provider]);

  const fetchedCount = useMemo(
    () => Object.keys(attachment.samplesByGap).length,
    [attachment],
  );

  return { controls, attachment, fetchedCount };
}
