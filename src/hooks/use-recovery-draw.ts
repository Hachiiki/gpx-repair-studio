/**
 * useRecoveryDraw — the React binding for the Gap Recovery section's draw
 * editor (Task 26, extended in Task 28).
 *
 * A deliberate mirror of the repair studio's `useDrawEditor`, bound to the
 * recovery store instead of the editor store. The existing hook stays
 * byte-for-byte untouched; the shared logic lives in the pure modules both
 * hooks consume (drawModel commands, snap candidates, road-follow joins,
 * resample, the §J-1 + PE time plan, the pace join).
 *
 * Task 28 — "draw even without detection": the binding now carries the
 * SAME manual-span machinery the repair studio has (one-click anchor pick
 * deriving insert/extend shapes, two-click pair pick, open-ended chains,
 * per-span remove), so the Recover tab's contract is "upload, draw the
 * route you lost, the app calculates the time". What stays recovery's
 * own: user-drawn insert/extend spans default to the PACE-ESTIMATED time
 * strategy (duration = drawn distance ÷ the file's recorded average
 * speed — synced into `fileTiming.recordedSpeedMps` from the session
 * stats below), and the repair studio's hook never learns that strategy
 * (its file timing carries no speed, so the UI never offers it there).
 *
 * The returned binding implements the SAME `DrawEditorBinding` interface
 * as the repair studio, so the section reuses `DrawEditorPanel`, the map
 * chrome (Draw/Pan chip, distance badge, pick chip), and the undo/redo
 * bar unchanged — `manualRows` and `pickMode` are now real values.
 *
 * Task 26 — Gap Recovery section. Client-side hook.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { MAX_VERTICES } from "@/features/reconstruction/drawModel";
import { resamplePath } from "@/features/reconstruction/resample";
import {
  resolveGapTimePlan,
  type GapTimePlan,
} from "@/features/reconstruction/timestamps";
import { buildPaceRows, type PaceRow } from "@/features/statistics/pace";
import { isUsableStatsPoint } from "@/features/statistics/distance";
import {
  buildSnapCandidates,
  nearestSnap,
  type SnapCandidate,
} from "@/features/reconstruction/snap";
import {
  closingLegCoordinates,
  isStraightLinePath,
  joinDrawChain,
} from "@/features/reconstruction/roadFollow";
import {
  polylineLengthMeters,
} from "@/lib/geo/geodesy";
import type { MapController } from "@/lib/map/mapController";
import type {
  DrawCommitPosition,
  PickTarget,
} from "@/lib/map/mapController";
import {
  deriveGapStatus,
  type GapStatus,
} from "@/state/editor-store";
import { useRecoveryStore } from "@/state/recovery-store";
import type {
  GapId,
  LatLon,
  OriginalTrackPoint,
  PointId,
  RoadFollowMode,
  RoadLeg,
  SegmentId,
  TimeStrategy,
  VertexId,
} from "@/types/domain";
import type { RecoverySession } from "@/hooks/use-recovery-session";
import type { DrawEditorBinding, RepairRow, RepairTimeStats } from "@/hooks/use-draw-editor";
import { getRoadRouter } from "@/hooks/use-draw-editor";
import type { MapBinding } from "@/hooks/use-map-controller";

export type { GapTimePlan };
export type { PaceRow };
export type { RepairRow };
export type { RepairTimeStats as RecoveryRepairTimeStats };

export function useRecoveryDraw(
  session: RecoverySession,
  map: MapBinding,
): DrawEditorBinding {
  const activeGapId = useRecoveryStore((s) => s.activeGapId);
  const drawMode = useRecoveryStore((s) => s.drawMode);
  const snapEnabled = useRecoveryStore((s) => s.snapEnabled);
  const roadFollow = useRecoveryStore((s) => s.roadFollow);
  const roadLegs = useRecoveryStore((s) => s.roadLegs);
  const roadRouting = useRecoveryStore((s) => s.roadRouting);
  const reconstructions = useRecoveryStore((s) => s.reconstructions);
  const skippedGapIds = useRecoveryStore((s) => s.skippedGapIds);
  const history = useRecoveryStore((s) => s.history);
  const fileTiming = useRecoveryStore((s) => s.fileTiming);
  const manualSpans = useRecoveryStore((s) => s.manualSpans);
  const pickMode = useRecoveryStore((s) => s.pickMode);

  const gapRows = session.gapRows;
  const mapReady = map.status === "ready";

  // Point index for manual-span joins: coordinates, segment, document
  // order, and each usable point's usable NEIGHBORS in the same segment —
  // everything needed to turn a picked anchor or pair into a row (and to
  // derive the one-anchor span shape). Mirrors useDrawEditor.
  const pointIndex = useMemo(() => {
    const byId = new Map<
      PointId,
      {
        point: OriginalTrackPoint;
        segmentId: SegmentId;
        ordinal: number;
        /** Next usable point in the same segment (null at the segment end). */
        nextUsableId: PointId | null;
        /** Previous usable point in the same segment (null at the start). */
        prevUsableId: PointId | null;
      }
    >();
    let ordinal = 0;
    if (session.data) {
      for (const segment of session.data.segments) {
        const usable = segment.points.filter(isUsableStatsPoint);
        const nextUsable = new Map<PointId, PointId | null>();
        const prevUsable = new Map<PointId, PointId | null>();
        usable.forEach((point, i) => {
          nextUsable.set(point.id, usable[i + 1]?.id ?? null);
          prevUsable.set(point.id, usable[i - 1]?.id ?? null);
        });
        for (const point of segment.points) {
          byId.set(point.id, {
            point,
            segmentId: segment.id,
            ordinal: ordinal++,
            nextUsableId: nextUsable.get(point.id) ?? null,
            prevUsableId: prevUsable.get(point.id) ?? null,
          });
        }
      }
    }
    return byId;
  }, [session.data]);

  const manualRows = useMemo<RepairRow[]>(() => {
    const rows: RepairRow[] = [];
    const boundaryOf = (pointId: PointId) => {
      const entry = pointIndex.get(pointId);
      if (!entry) return null;
      return {
        pointId: entry.point.id,
        segmentId: entry.segmentId,
        lat: entry.point.lat,
        lon: entry.point.lon,
        ...(entry.point.time !== undefined ? { time: entry.point.time } : {}),
      };
    };
    for (const span of manualSpans) {
      if (span.kind === "extend") {
        // Open-ended: one boundary (the anchor). Side "after" anchors the
        // chain's start; side "before" anchors its end (route order —
        // the geometry is the same chain either way).
        const anchor = boundaryOf(span.anchorPointId);
        if (!anchor) continue;
        rows.push({
          id: span.id,
          kind: "manual-insert",
          severity: "info",
          status: "new",
          ...(span.side === "after" ? { before: anchor } : { after: anchor }),
        });
        continue;
      }
      const b = pointIndex.get(span.beforePointId);
      const a = pointIndex.get(span.afterPointId);
      if (!b || !a) continue;
      rows.push({
        id: span.id,
        kind: span.kind === "insert" ? "manual-insert" : "manual",
        severity: "info",
        status: "new",
        before: {
          pointId: b.point.id,
          segmentId: b.segmentId,
          lat: b.point.lat,
          lon: b.point.lon,
          ...(b.point.time !== undefined ? { time: b.point.time } : {}),
        },
        after: {
          pointId: a.point.id,
          segmentId: a.segmentId,
          lat: a.point.lat,
          lon: a.point.lon,
          ...(a.point.time !== undefined ? { time: a.point.time } : {}),
        },
      });
    }
    return rows;
  }, [manualSpans, pointIndex]);

  // Every repairable row, detected or user-drawn — the join basis for the
  // active editor session and the status map.
  const allRows = useMemo<RepairRow[]>(
    () => [...gapRows, ...manualRows],
    [gapRows, manualRows],
  );

  const activeGap = useMemo(
    () =>
      activeGapId === null
        ? null
        : (allRows.find((row) => row.id === activeGapId) ?? null),
    [activeGapId, allRows],
  );

  const activeRecon =
    activeGapId === null ? null : reconstructions[activeGapId] ?? null;
  const vertices = activeRecon?.vertices ?? [];

  /** Resolved road legs of the ACTIVE section (empty when none/off). */
  const activeRoadLegs = useMemo(
    () => (activeGapId === null ? [] : (roadLegs[activeGapId] ?? [])),
    [activeGapId, roadLegs],
  );

  // Resolved anchors: the near anchor always exists (the recorded point
  // the chain attaches to); the far anchor only for bounded rows
  // (detected gaps, pair/insert spans) — open extensions draw with no
  // closing segment at all.
  const nearAnchor = activeGap ? (activeGap.before ?? activeGap.after) : null;
  const farAnchor =
    activeGap?.before && activeGap?.after ? activeGap.after : null;

  // -- session lifecycle hygiene ---------------------------------------------

  // Re-detection may remove sections: drop their repairs. User-drawn
  // spans anchor their own repairs — their ids join the known set, so a
  // drawn section survives threshold changes even when detection stops
  // flagging anything there. Gap ids are deterministic per boundary
  // pair, so surviving sections keep theirs.
  useEffect(() => {
    const known = [
      ...gapRows.map((row) => row.id),
      ...manualSpans.map((span) => span.id),
    ];
    useRecoveryStore.getState().prune(known);
  }, [gapRows, manualSpans]);

  // -- the file's recorded pace (Task 28) --------------------------------------

  // The pace-estimated strategy's speed basis: the session's own recorded
  // distance over recorded MOVING time (stops must not dilute the pace).
  // No usable timing → null → the strategy controls never offer "From
  // your pace" and the plan says so honestly.
  const recordedSpeedMps = useMemo(() => {
    const movingMs = session.timeStats?.recordedMovingTimeMs ?? 0;
    const distanceM = session.distanceStats?.totalDistanceM ?? 0;
    return movingMs > 0 && distanceM > 0
      ? distanceM / (movingMs / 1000)
      : null;
  }, [session.timeStats, session.distanceStats]);

  useEffect(() => {
    const current =
      useRecoveryStore.getState().fileTiming.recordedSpeedMps ?? null;
    if (current === recordedSpeedMps) return;
    useRecoveryStore.getState().setFileTiming({ recordedSpeedMps });
  }, [recordedSpeedMps]);

  // -- snap magnet (pure domain, injected into the controller) ----------------

  // The near anchor is always present; the far anchor only for bounded
  // rows. Open extensions snap around their single anchor.
  const snapCandidates = useMemo<SnapCandidate[]>(
    () =>
      nearAnchor && session.data
        ? buildSnapCandidates(session.data, {
            before: { lat: nearAnchor.lat, lon: nearAnchor.lon },
            ...(farAnchor
              ? { after: { lat: farAnchor.lat, lon: farAnchor.lon } }
              : {}),
          })
        : [],
    [nearAnchor, farAnchor, session.data],
  );

  const snapRef = useRef(snapCandidates);
  useEffect(() => {
    snapRef.current = snapCandidates;
  }, [snapCandidates]);

  const snapFn = useCallback(
    (target: { lat: number; lon: number }, maxDistanceM: number) => {
      if (!useRecoveryStore.getState().snapEnabled) return null;
      const snapped = nearestSnap(snapRef.current, target, maxDistanceM);
      if (!snapped) return null;
      return {
        lat: snapped.lat,
        lon: snapped.lon,
        ...(snapped.pointId !== undefined
          ? { snappedTo: snapped.pointId }
          : {}),
      } satisfies DrawCommitPosition;
    },
    [],
  );

  // -- span-pick session driving (draw-anywhere) ------------------------------

  // While pickMode is on, the controller collects clicks on recorded
  // points. Pair mode: the picked pair becomes a replace span (document-
  // order fixing happens here — the map layer knows nothing of the file's
  // order). Anchor mode: ONE click — the point's position in its segment
  // derives the shape: route start → open "before" extension; route end →
  // open "after" extension; mid-route → insert at the [anchor, next]
  // boundary (same id scheme as a picked pair, so it deduplicates into
  // any existing repair there — detected or drawn).
  useEffect(() => {
    const controller: MapController | null = map.getController();
    if (!controller) return;
    if (!pickMode || !session.data) {
      controller.endPickSession();
      return;
    }
    const targets: PickTarget[] = [];
    for (const segment of session.data.segments) {
      // Endpoint flagging: the first/last usable point of each segment
      // wins pick near-ties (clicking the visible route end = the
      // endpoint, even when its neighbor sits a sub-pixel away).
      const usableIds = new Set(
        segment.points.filter(isUsableStatsPoint).map((point) => point.id),
      );
      let firstUsableId: PointId | null = null;
      let lastUsableId: PointId | null = null;
      for (const point of segment.points) {
        if (!usableIds.has(point.id)) continue;
        if (firstUsableId === null) firstUsableId = point.id;
        lastUsableId = point.id;
      }
      for (const point of segment.points) {
        if (!isUsableStatsPoint(point)) continue;
        targets.push({
          pointId: point.id,
          lat: point.lat,
          lon: point.lon,
          trackIndex: segment.trackIndex,
          ...(point.id === firstUsableId || point.id === lastUsableId
            ? { isSegmentEnd: true }
            : {}),
        });
      }
    }
    controller.startPickSession({
      mode: pickMode,
      targets,
      callbacks: {
        onSpanPicked: (a, b) => {
          const entryA = pointIndex.get(a);
          const entryB = pointIndex.get(b);
          if (!entryA || !entryB) return;
          const [before, after] =
            entryA.ordinal <= entryB.ordinal ? [a, b] : [b, a];
          useRecoveryStore.getState().addManualSpan(before, after);
        },
        onAnchorPicked: (pointId) => {
          const entry = pointIndex.get(pointId);
          if (!entry) return;
          const store = useRecoveryStore.getState();
          if (entry.prevUsableId === null && entry.nextUsableId !== null) {
            // The route's first usable point: the lost head precedes it.
            store.addExtendSpan(pointId, "before");
          } else if (entry.nextUsableId !== null) {
            store.addInsertSpan(pointId, entry.nextUsableId);
          } else {
            // No next usable point: the segment's end — the lost tail.
            store.addExtendSpan(pointId, "after");
          }
        },
        onCancel: () => useRecoveryStore.getState().cancelPickMode(),
      },
    });
    return () => controller.endPickSession();
    // pointIndex is derived from session.data — stable per file.
  }, [pickMode, mapReady, map.getController, session.data, pointIndex]);

  // -- controller draw-session driving ----------------------------------------

  const makeJoins = useCallback(
    (legs: readonly RoadLeg[]) => ({
      chainJoin: (nodes: readonly LatLon[]) => joinDrawChain(nodes, legs),
      closingJoin: (from: LatLon, to: LatLon) =>
        closingLegCoordinates(from, to, legs),
    }),
    [],
  );

  // Open/switch/close the controller session when the active section
  // changes (also fires once the map becomes ready — startDrawSession is
  // deferred internally until then). The chain always starts at the
  // section's anchor; the far boundary exists only for bounded rows —
  // open extensions draw with NO closing segment at all.
  useEffect(() => {
    const controller: MapController | null = map.getController();
    if (!controller) return;
    if (!activeGap || !nearAnchor) {
      controller.endDrawSession();
      return;
    }
    const store = useRecoveryStore.getState();
    const initial = store.reconstructions[activeGap.id]?.vertices ?? [];
    const initialLegs = store.roadLegs[activeGap.id] ?? [];
    controller.startDrawSession({
      gapId: activeGap.id,
      anchors: {
        before: { lat: nearAnchor.lat, lon: nearAnchor.lon },
        after: farAnchor
          ? { lat: farAnchor.lat, lon: farAnchor.lon }
          : null,
      },
      vertices: initial,
      snap: snapFn,
      ...makeJoins(initialLegs),
      callbacks: {
        onVertexAdd: (position) =>
          useRecoveryStore.getState().addVertex(position),
        onVertexMove: (vertexId, position) =>
          useRecoveryStore.getState().moveVertex(vertexId, position),
        onVertexInsert: (index, position) =>
          useRecoveryStore.getState().insertVertex(index, position),
        onVertexDelete: (vertexId) =>
          useRecoveryStore.getState().deleteVertex(vertexId),
      },
    });
    return () => {
      controller.endDrawSession();
    };
  }, [activeGap, nearAnchor, farAnchor, mapReady, map.getController, snapFn, makeJoins]);

  // Push every authoritative vertex change (and every resolved road leg)
  // into the controller — the store is the single source of truth.
  useEffect(() => {
    map.getController()?.updateDrawSession(vertices, makeJoins(activeRoadLegs));
  }, [vertices, activeRoadLegs, map.getController, makeJoins]);

  // -- road-follow leg resolution (snap to road) --------------------------------

  const roadGeneration = useRef(0);

  useEffect(() => {
    const resetRouting = () => {
      const state = useRecoveryStore.getState();
      if (state.roadRouting.pending !== 0 || state.roadRouting.failed) {
        state.setRoadRouting({ pending: 0, failed: false });
      }
    };
    if (!activeGap || !nearAnchor) {
      resetRouting();
      return;
    }
    const gapId = activeGap.id;
    if (roadFollow === "off") {
      const legs = useRecoveryStore.getState().roadLegs[gapId] ?? [];
      if (legs.length > 0) useRecoveryStore.getState().setRoadLegs(gapId, []);
      resetRouting();
      return;
    }
    const nodes: LatLon[] = [
      { lat: nearAnchor.lat, lon: nearAnchor.lon },
      ...vertices,
      ...(farAnchor ? [{ lat: farAnchor.lat, lon: farAnchor.lon }] : []),
    ];
    const pairs: { a: LatLon; b: LatLon }[] = [];
    for (let i = 0; i + 1 < nodes.length; i += 1) {
      pairs.push({ a: nodes[i], b: nodes[i + 1] });
    }
    const router = getRoadRouter();
    const resolved: RoadLeg[] = [];
    const missing: { a: LatLon; b: LatLon }[] = [];
    for (const pair of pairs) {
      const leg = router.cached(roadFollow, pair.a, pair.b);
      if (leg) resolved.push(leg);
      else missing.push(pair);
    }
    useRecoveryStore.getState().setRoadLegs(gapId, resolved);
    useRecoveryStore.getState().setRoadRouting({
      pending: missing.length,
      failed: false,
    });
    if (missing.length === 0) return;
    const generation = (roadGeneration.current += 1);
    let pending = missing.length;
    for (const pair of missing) {
      void router.segment(roadFollow, pair.a, pair.b).then((leg) => {
        if (roadGeneration.current !== generation) return; // stale
        const state = useRecoveryStore.getState();
        if (state.activeGapId !== gapId || state.roadFollow !== roadFollow) {
          return;
        }
        pending -= 1;
        if (leg) {
          state.setRoadLegs(gapId, [...(state.roadLegs[gapId] ?? []), leg]);
          state.setRoadRouting({ pending, failed: false });
        } else {
          state.setRoadRouting({ pending, failed: true });
        }
      });
    }
  }, [activeGap, nearAnchor, farAnchor, vertices, roadFollow]);

  // Draw/Pan toggle → controller interaction handlers.
  useEffect(() => {
    map.getController()?.setDrawMode(drawMode);
  }, [drawMode, map.getController, mapReady]);

  // Keyboard accelerators (QoL): D = draw, P = pan — active only while an
  // editor session is open, never while typing in a form control.
  useEffect(() => {
    if (activeGapId === null) return;
    const onKeydown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "d") {
        event.preventDefault();
        useRecoveryStore.getState().setDrawMode(true);
      } else if (key === "p") {
        event.preventDefault();
        useRecoveryStore.getState().setDrawMode(false);
      }
    };
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [activeGapId]);

  // -- derived view data --------------------------------------------------------

  // Distance runs over the RENDERED path (nodes with road legs
  // substituted): anchor-to-anchor for bounded rows, the drawn chain for
  // open extensions — the number the line draws is the number the badge
  // shows (WYSIWYG honesty).
  const distanceM = useMemo(() => {
    if (!nearAnchor) return null;
    const nodes: LatLon[] = [
      { lat: nearAnchor.lat, lon: nearAnchor.lon },
      ...vertices,
      ...(farAnchor ? [{ lat: farAnchor.lat, lon: farAnchor.lon }] : []),
    ];
    return polylineLengthMeters(joinDrawChain(nodes, activeRoadLegs).points);
  }, [nearAnchor, farAnchor, vertices, activeRoadLegs]);

  // Straight-line honesty over the RENDERED path. Open extensions have
  // no straight line to hug — always false.
  const straightLine = useMemo(() => {
    if (!nearAnchor || !farAnchor || vertices.length === 0) return false;
    const nodes: LatLon[] = [
      { lat: nearAnchor.lat, lon: nearAnchor.lon },
      ...vertices,
      { lat: farAnchor.lat, lon: farAnchor.lon },
    ];
    return isStraightLinePath(
      joinDrawChain(nodes, activeRoadLegs).points,
      { lat: nearAnchor.lat, lon: nearAnchor.lon },
      { lat: farAnchor.lat, lon: farAnchor.lon },
    );
  }, [nearAnchor, farAnchor, vertices, activeRoadLegs]);

  const statusById = useMemo(() => {
    const byId: Record<string, GapStatus> = {};
    for (const row of allRows) {
      byId[row.id] = deriveGapStatus({
        gapId: row.id,
        activeGapId,
        reconstruction: reconstructions[row.id],
        skipped: skippedGapIds.includes(row.id),
      });
    }
    return byId;
  }, [allRows, activeGapId, reconstructions, skippedGapIds]);

  const reconstructedCount = useMemo(
    () =>
      allRows.filter((row) => {
        const recon = reconstructions[row.id];
        return (
          row.id !== activeGapId &&
          !skippedGapIds.includes(row.id) &&
          (recon?.vertices.length ?? 0) > 0
        );
      }).length,
    [allRows, reconstructions, activeGapId, skippedGapIds],
  );

  const skippedCount = useMemo(
    () => allRows.filter((row) => skippedGapIds.includes(row.id)).length,
    [allRows, skippedGapIds],
  );

  // -- time & pace -------------------------------------------------------------

  // The resolved plan of the ACTIVE section: which case applies, the
  // duration feeding the live pace, the anchor, the discrepancy. The
  // RENDERED path length rides along — the pace-estimated strategy's
  // duration is that length over the file's recorded speed.
  const timePlan = useMemo<GapTimePlan | null>(() => {
    if (!activeGap) return null;
    const strategy: TimeStrategy =
      activeRecon?.timeStrategy ?? { kind: "distance-proportional" };
    return resolveGapTimePlan(
      {
        routeBeforeMs: activeGap.before?.time,
        routeAfterMs: activeGap.after?.time,
      },
      strategy,
      fileTiming,
      distanceM,
    );
  }, [activeGap, activeRecon, fileTiming, distanceM]);

  // Committed repairs → the stats join. Distances are the RENDERED path
  // lengths (road legs included); durations from the case matrix + the
  // pace-estimated source. Extend-before rows carry only `after` — their
  // path runs reversed against route order (the anchor keeps the latest
  // time).
  const repairTimeStats = useMemo<RepairTimeStats>(() => {
    let reconstructedDistanceM = 0;
    let reconstructedTimeMs: number | null = null;
    let gapsWithoutDuration = 0;
    let beyondWallMs = 0;
    const discrepancies: RepairTimeStats["discrepancies"][number][] = [];
    let gapCount = 0;

    for (const row of allRows) {
      if (row.id === activeGapId || skippedGapIds.includes(row.id)) continue;
      const recon = reconstructions[row.id];
      if (!recon || recon.vertices.length === 0) continue;

      const near = row.before ?? row.after;
      if (!near) continue;
      const far = row.before && row.after ? row.after : null;
      const path = resamplePath(
        { lat: near.lat, lon: near.lon },
        recon.vertices,
        far ? { lat: far.lat, lon: far.lon } : null,
        recon.resampleSpacingM,
        roadLegs[row.id] ?? [],
      );
      const pathLengthM =
        path.length > 0 ? path[path.length - 1].cumDistanceM : 0;
      reconstructedDistanceM += pathLengthM;

      const plan = resolveGapTimePlan(
        {
          routeBeforeMs: row.before?.time,
          routeAfterMs: row.after?.time,
        },
        recon.timeStrategy,
        fileTiming,
        pathLengthM,
      );
      gapCount += 1;
      if (plan.durationMs === null) {
        gapsWithoutDuration += 1;
      } else {
        reconstructedTimeMs = (reconstructedTimeMs ?? 0) + plan.durationMs;
        // Time the file's clock never counted (Task 28): a window-less
        // duration contributes itself; a windowed one only its overrun.
        beyondWallMs +=
          plan.recordedSpanMs === null
            ? plan.durationMs
            : Math.max(0, plan.durationMs - plan.recordedSpanMs);
      }
      if (
        plan.discrepancyMs !== null &&
        plan.durationMs !== null &&
        plan.recordedSpanMs !== null
      ) {
        discrepancies.push({
          gapId: row.id,
          manualMs: plan.durationMs,
          recordedMs: plan.recordedSpanMs,
        });
      }
    }

    return {
      gapCount,
      reconstructedDistanceM,
      reconstructedTimeMs,
      gapsWithoutDuration,
      discrepancies,
      beyondWallMs,
    };
  }, [allRows, activeGapId, skippedGapIds, reconstructions, roadLegs, fileTiming]);

  const paceRows = useMemo<readonly PaceRow[]>(
    () =>
      buildPaceRows({
        hasTimingData: session.timeStats?.hasTimingData ?? false,
        recordedMovingTimeMs: session.timeStats?.recordedMovingTimeMs ?? 0,
        recordedDistanceM: session.distanceStats?.totalDistanceM ?? 0,
        repairDistanceM: repairTimeStats.reconstructedDistanceM,
        repairTimeMs: repairTimeStats.reconstructedTimeMs,
        repairsWithoutDuration: repairTimeStats.gapsWithoutDuration,
        hasRepairs: repairTimeStats.gapCount > 0,
        manualTotalDurationMs: fileTiming.totalDurationMs,
      }),
    [session.timeStats, session.distanceStats, repairTimeStats, fileTiming],
  );

  // -- intents -------------------------------------------------------------------

  const openEditor = useCallback((gapId: GapId) => {
    useRecoveryStore.getState().openEditor(gapId);
    // A user-drawn span benefits from the map focusing it (its row's
    // "Draw route" button may sit far from the camera); detected gaps
    // keep the section's selection-neutral open behavior.
    if (
      useRecoveryStore
        .getState()
        .manualSpans.some((span) => span.id === gapId)
    ) {
      useRecoveryStore.getState().selectGap(gapId);
    }
  }, []);

  const closeEditor = useCallback(() => {
    useRecoveryStore.getState().closeEditor();
  }, []);

  const beginPickAnchor = useCallback(() => {
    useRecoveryStore.getState().startPickMode("anchor");
  }, []);

  const beginPickPair = useCallback(() => {
    useRecoveryStore.getState().startPickMode("pair");
  }, []);

  const cancelPickSpan = useCallback(() => {
    useRecoveryStore.getState().cancelPickMode();
  }, []);

  const removeManualSpan = useCallback((gapId: GapId) => {
    useRecoveryStore.getState().removeManualSpan(gapId);
  }, []);

  const setDrawMode = useCallback((on: boolean) => {
    useRecoveryStore.getState().setDrawMode(on);
  }, []);

  const setSnapEnabled = useCallback((on: boolean) => {
    useRecoveryStore.getState().setSnapEnabled(on);
  }, []);

  const setRoadFollow = useCallback((mode: RoadFollowMode) => {
    useRecoveryStore.getState().setRoadFollow(mode);
  }, []);

  const undo = useCallback(() => useRecoveryStore.getState().undo(), []);
  const redo = useCallback(() => useRecoveryStore.getState().redo(), []);
  const clearVertices = useCallback(
    () => useRecoveryStore.getState().clearVertices(),
    [],
  );

  const setResampleSpacing = useCallback(
    (spacing: number | "off") => {
      const gapId = useRecoveryStore.getState().activeGapId;
      if (gapId === null) return;
      useRecoveryStore.getState().setResampleSpacing(gapId, spacing);
    },
    [],
  );

  const setTimeStrategy = useCallback((strategy: TimeStrategy) => {
    const gapId = useRecoveryStore.getState().activeGapId;
    if (gapId === null) return;
    useRecoveryStore.getState().setTimeStrategy(gapId, strategy);
  }, []);

  const setFileTiming = useCallback(
    (patch: Partial<{ startMs: number | null; totalDurationMs: number | null }>) => {
      useRecoveryStore.getState().setFileTiming(patch);
    },
    [],
  );

  const toggleSkip = useCallback(() => {
    const gapId = useRecoveryStore.getState().activeGapId;
    if (gapId === null) return;
    useRecoveryStore.getState().toggleSkip(gapId);
  }, []);

  const deleteVertex = useCallback((vertexId: VertexId) => {
    useRecoveryStore.getState().deleteVertex(vertexId);
  }, []);

  return {
    active: activeGap !== null,
    activeGap,
    drawMode,
    snapEnabled,
    roadFollow,
    routingPending: roadRouting.pending > 0,
    routingFailed: roadRouting.failed && roadFollow !== "off",
    vertices,
    vertexCount: vertices.length,
    maxVertices: MAX_VERTICES,
    atVertexCap: vertices.length >= MAX_VERTICES,
    distanceM,
    straightLine,
    resampleSpacing: activeRecon?.resampleSpacingM ?? "off",
    timePlan,
    fileTiming,
    canUndo: history.undo.length > 0,
    canRedo: history.redo.length > 0,
    undoCount: history.undo.length,
    redoCount: history.redo.length,
    statusById,
    reconstructedCount,
    skippedCount,
    repairTimeStats,
    paceRows,
    manualRows,
    pickMode,
    openEditor,
    closeEditor,
    beginPickAnchor,
    beginPickPair,
    cancelPickSpan,
    removeManualSpan,
    setDrawMode,
    setSnapEnabled,
    setRoadFollow,
    undo,
    redo,
    clearVertices,
    setResampleSpacing,
    setTimeStrategy,
    setFileTiming,
    toggleSkip,
    deleteVertex,
  };
}
