/**
 * useElevation — the React binding for elevation estimation
 * (docs/MASTER_PLAN.md §K, Phase 6).
 *
 * Responsibilities (and nothing else):
 *   - own the elevation-store lifecycle: reset on session change, prune
 *     records for gaps that vanished after re-detection (same hygiene
 *     `useDrawEditor` applies to repairs);
 *   - expose the ACTIVE gap's fetch controls (status, progress, per-gap
 *     gain/loss summary, staleness) plus the disclosure numbers for the
 *     CURRENT chain — the dialog shows exactly what would leave the
 *     browser before anything is sent (FR-6.5);
 *   - run the fetch: build the interior path, apply the per-gap cap,
 *     snapshot the revision + road-leg signature, stream progress into
 *     the store, and finalize with complete/partial/failed honesty;
 *   - expose the EXPORT attachment: per-gap samples that are FRESH
 *     (revision + road-leg signature both match) for the merge, and the
 *     count of committed-but-stale repairs the export will exclude.
 *
 * The provider instance (OpenTopoData behind the LRU cache decorator)
 * is shared per page — re-edits and retries of nearby geometry are
 * free (§K-2). The browser `fetch` is injected (features/** stays
 * fetch-free, ESLint §F-3).
 *
 * Phase 6 — Elevation. Client-side hook.
 */

"use client";

import { useCallback, useEffect, useMemo } from "react";
import { ElevationCache, withCache } from "@/features/elevation/cache";
import { OpenTopoDataProvider } from "@/features/elevation/opentopodata";
import type { ElevationProvider } from "@/features/elevation/provider";
import {
  gapElevationSummary,
  pickFetchPoints,
  roadLegsSignature,
  type ElevationSample,
} from "@/features/elevation/samples";
import { resamplePath } from "@/features/reconstruction/resample";
import type { MergeResult } from "@/features/reconstruction/merge";
import {
  buildElevationProfile,
  buildElevationStats,
  type ElevationProfile,
  type ElevationStatsRows,
} from "@/features/statistics/elevation";
import { DEFAULT_HYSTERESIS_THRESHOLD_M } from "@/features/elevation/smoothing";
import { useEditorStore } from "@/state/editor-store";
import { useElevationStore } from "@/state/elevation-store";
import type { GapId, LatLon } from "@/types/domain";
import type { DrawEditorBinding } from "@/hooks/use-draw-editor";
import type { GpxSession } from "@/hooks/use-gpx-session";

// App-layer facade: components may not import feature internals (ESLint
// boundary, §F), so the elevation vocabulary they need flows through here.
export type { ElevationSample } from "@/features/elevation/samples";
export type {
  ElevationProfile,
  ElevationStatsRows,
} from "@/features/statistics/elevation";

/**
 * The stats-table rows + chart series from the export pipeline's merge —
 * one merge basis, so statistics, profile, and export can never disagree
 * about which repairs carry elevation (Phase 6).
 */
export function useElevationStats(
  merge: MergeResult | null,
): { rows: ElevationStatsRows; profile: ElevationProfile | null } {
  const rows = useMemo(() => buildElevationStats(merge), [merge]);
  const profile = useMemo(() => buildElevationProfile(merge), [merge]);
  return { rows, profile };
}

/**
 * The shared provider (app layer owns the network): one instance per
 * page; its LRU cache makes re-fetches after edits and retries cheap.
 */
let sharedProvider: ElevationProvider | null = null;
function getElevationProvider(): ElevationProvider {
  if (!sharedProvider) {
    sharedProvider = withCache(
      new OpenTopoDataProvider({ fetch: (input, init) => fetch(input, init) }),
      new ElevationCache(),
    );
  }
  return sharedProvider;
}

/** Rounds a raw request count the way the disclosure presents it. */
function requestCountFor(sentPoints: number): number {
  return Math.max(1, Math.ceil(sentPoints / 100));
}

// ---------------------------------------------------------------------------
// Controls (the active gap's editor panel section)
// ---------------------------------------------------------------------------

export interface ElevationControlsBinding {
  /** A fetch can start (editor open, route drawn). */
  canFetch: boolean;
  /** Why not, when `canFetch` is false (hint line). */
  blockedReason: string | null;
  /** The active gap's user-facing elevation status. */
  status:
    | "not-fetched"
    | "fetching"
    | "complete"
    | "partial"
    | "failed"
    | "stale";
  /** Fetch-time result predates the current chain (re-estimate offered). */
  stale: boolean;
  fetching: boolean;
  /** Progress counters (answered = final answers, sent = wire points). */
  answered: number;
  sent: number;
  total: number;
  /** Points with a defined elevation (the partial note's numerator). */
  resolved: number;
  /** Disclosure numbers for the CURRENT chain (null when not fetchable). */
  disclosure: {
    sentPoints: number;
    totalPoints: number;
    requestCount: number;
  } | null;
  /** Provider copy (disclosure + attribution). */
  providerName: string;
  attribution: string;
  privacyNote: string;
  /** Per-gap summary of the fetched samples (fresh complete/partial only). */
  summary: {
    minEleM: number;
    maxEleM: number;
    gainM: number;
    lossM: number;
  } | null;
  /** Failure message (status failed). */
  error: string | null;
  /** Intent: run the fetch for the active gap (disclosure confirmed). */
  confirmFetch: () => void;
}

// ---------------------------------------------------------------------------
// Attachment (what the merge/export consumes)
// ---------------------------------------------------------------------------

/** Fresh per-gap elevation for the merge + the honest stale count. */
export interface ElevationAttachment {
  /** Fresh (revision + road-signature match) samples, keyed by gap id. */
  samplesByGap: Readonly<
    Record<string, { providerName: string; samples: readonly ElevationSample[] }>
  >;
  /** Committed repairs whose elevation went stale (excluded from export). */
  staleCount: number;
}

export function useElevation(
  session: GpxSession,
  draw: DrawEditorBinding,
): {
  controls: ElevationControlsBinding;
  attachment: ElevationAttachment;
  /** Gaps with a fresh usable result (stats honesty note). */
  fetchedCount: number;
} {
  const byGap = useElevationStore((s) => s.byGap);
  const reconstructions = useEditorStore((s) => s.reconstructions);
  const roadLegs = useEditorStore((s) => s.roadLegs);
  const activeGapId = useEditorStore((s) => s.activeGapId);

  const provider = getElevationProvider();
  const activeGap = draw.activeGap;

  // -- lifecycle hygiene (same contract as useDrawEditor) ------------------

  useEffect(() => {
    if (session.status !== "parsed") {
      useElevationStore.getState().reset();
    }
  }, [session.status]);

  useEffect(() => {
    const known = [
      ...session.gapRows.map((row) => row.id),
      ...draw.manualRows.map((row) => row.id),
    ];
    useElevationStore.getState().prune(known);
  }, [session.gapRows, draw.manualRows]);

  // -- active-gap view ------------------------------------------------------

  const activeRecon = activeGapId === null ? null : reconstructions[activeGapId] ?? null;
  const activeRecord = activeGapId === null ? null : byGap[activeGapId] ?? null;
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

  // -- the fetch -------------------------------------------------------------

  const confirmFetch = useCallback(() => {
    const gapId = useEditorStore.getState().activeGapId;
    if (gapId === null) return;
    const editor = useEditorStore.getState();
    const recon = editor.reconstructions[gapId];
    if (!recon || recon.vertices.length === 0) return;
    const row = draw.activeGap;
    const near = row ? (row.before ?? row.after) : null;
    if (!near) return;
    const far = row?.before && row?.after ? row.after : null;
    const legs = editor.roadLegs[gapId] ?? [];

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

    const fetchSeq = useElevationStore.getState().beginFetch(gapId, {
      providerId: provider.id,
      fetchedAtRevision: recon.geometryRevision,
      fetchedAtRoadSignature: roadLegsSignature(legs),
      totalPoints: interior.length,
      sentPoints: sent.length,
    });

    void provider
      .getElevations(
        sent.map((point): LatLon => ({ lat: point.lat, lon: point.lon })),
        {
          onProgress: (answered, resolved) =>
            useElevationStore
              .getState()
              .setProgress(gapId, fetchSeq, answered, resolved),
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
        // The sequence token drops a superseded fetch's late writes
        // (a newer fetch for the same gap owns the record now).
        useElevationStore.getState().finish(gapId, fetchSeq, {
          status:
            resolved === 0
              ? "failed"
              : resolved === sent.length
                ? "complete"
                : "partial",
          samples,
          resolvedPoints: resolved,
          ...(resolved === 0
            ? {
                error:
                  "The elevation service returned no usable data — try again in a moment.",
              }
            : {}),
        });
      })
      .catch(() => {
        useElevationStore.getState().finish(gapId, fetchSeq, {
          status: "failed",
          samples: [],
          resolvedPoints: 0,
          error:
            "The elevation service could not be reached — check your connection and try again.",
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

  // -- export attachment ------------------------------------------------------

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
      const record = byGap[row.id];
      if (!record || (record.status !== "complete" && record.status !== "partial")) {
        continue;
      }
      const recon = reconstructions[row.id];
      if (!recon || recon.vertices.length === 0) continue;
      if (isStale(record, row.id)) {
        // Only committed repairs count: an open/skipped gap's elevation
        // was never going into this export anyway.
        if (
          draw.statusById[row.id] === "reconstructed" &&
          row.id !== useEditorStore.getState().activeGapId
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
