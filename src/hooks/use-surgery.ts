/**
 * useSurgery — the track-surgery orchestration hook (§EE 16.1).
 *
 * Owns the map-pick loop for the surgery card's point selections
 * (split point, range A/B): while a slot is armed, the controller
 * collects ONE click on any recorded point of the WORKING view, and
 * the pick lands in `lastPick` for the card's form fill. Entering a
 * pick closes any open draw editor and cancels the span picks (the
 * one-pick-mode rule — the same mutual exclusion the manual-repairs
 * card and the gap list already follow).
 *
 * Also exposes the pure planners over the working view and the apply
 * intent (one `WorkingEdit` per confirmed plan — the Phase 13 ritual:
 * preview → confirm → logged → undoable).
 *
 * Composition root pattern: AppShell wires `(session, map)` in; the
 * card renders the binding. No component imports feature internals.
 *
 * Phase 16 — Track surgery & input freedom. Client-side hook.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { editFromPlan } from "@/features/validation/fixes";
import {
  locateWorkingPoint,
  planDeleteRange,
  planDuplicateSegment,
  planSegmentOrder,
  planSplitSegment,
} from "@/features/validation/surgery";
import { announce } from "@/lib/announcements";
import { useI18n } from "@/hooks/use-i18n";
import { translateLabel } from "@/i18n/runtime";
import { isUsableStatsPoint } from "@/features/statistics/distance";
import type { MapController } from "@/lib/map/mapController";
import { activeReconstruction, useEditorStore } from "@/state/editor-store";
import { nextEditId, useWorkingStore } from "@/state/working-store";
import type { FixPlan, PointId, SegmentId } from "@/types/domain";
import type { GpxSession } from "@/hooks/use-gpx-session";
import type { MapBinding } from "@/hooks/use-map-controller";

/** Which form slot a map click fills. */
export type SurgeryPickSlot = "split" | "range-from" | "range-to";

/** One completed map pick, stamped for the card's form fill. */
export interface SurgeryPick {
  slot: SurgeryPickSlot;
  pointId: string;
  /** Monotonic — the same point picked twice re-triggers the fill. */
  seq: number;
}

/** The binding the surgery card renders. */
export interface SurgeryBinding {
  /** The armed pick slot (null = not picking). */
  pickMode: SurgeryPickSlot | null;
  /** Arm map-pick mode for a slot (closes the draw editor, like the span picks). */
  beginPick: (slot: SurgeryPickSlot) => void;
  /** Leave pick mode without a selection. */
  cancelPick: () => void;
  /** The last completed pick (the card's effect fills its form). */
  lastPick: SurgeryPick | null;
  /** Resolve a 1-based point number in a working segment (null = out of range). */
  pointAt: (
    segmentId: string,
    number1Based: number,
  ) => { pointId: string; lat: number; lon: number } | null;
  /** Locate a point id → its segment + 1-based number (pick fill, jump). */
  locate: (pointId: string) => { segmentId: string; number: number } | null;
  /** Plan split-after-point (1-based). Null = invalid (the card says why). */
  planSplit: (segmentId: string, afterNumber: number) => FixPlan | null;
  /** Plan the A–B range deletion (1-based, either order). */
  planRange: (
    segmentId: string,
    fromNumber: number,
    toNumber: number,
  ) => FixPlan | null;
  /** Plan duplicating a segment. */
  planDuplicate: (segmentId: string) => FixPlan | null;
  /** Plan a new global segment order (within-track moves only). */
  planOrder: (order: readonly string[]) => FixPlan | null;
  /** Apply a confirmed plan (one undo step, announced, log entry). */
  applyPlan: (plan: FixPlan) => void;
}

export function useSurgery(
  session: GpxSession,
  map: MapBinding,
): SurgeryBinding {
  const { t } = useI18n();
  // The armed slot is DERIVED through two guards instead of being
  // synced by effects (the react-hooks/set-state-in-effect rule): the
  // editor's span picks cancel it (the one-pick-mode rule — the same
  // mutual exclusion the manual-repairs card and the gap list
  // follow), and leaving the parsed session disarms it (no targets).
  const [pickSlot, setPickSlot] = useState<SurgeryPickSlot | null>(null);
  const [lastPick, setLastPick] = useState<SurgeryPick | null>(null);
  const pickSeq = useRef(0);
  const editorPickMode = useEditorStore((s) => s.pickMode);
  const pickMode: SurgeryPickSlot | null =
    editorPickMode !== null || session.status !== "parsed" ? null : pickSlot;

  const workingData = session.workingData;
  const getController = map.getController;

  // Arming a surgery pick cancels the span picks and closes the open
  // draw editor (the startPickMode pattern — the canvas must mean ONE
  // thing).
  const beginPick = useCallback((slot: SurgeryPickSlot) => {
    const editor = useEditorStore.getState();
    if (editor.pickMode !== null) editor.cancelPickMode();
    if (activeReconstruction(editor) !== null) editor.closeEditor();
    setPickSlot(slot);
  }, []);

  const cancelPick = useCallback(() => setPickSlot(null), []);

  // Drive the controller's "point" pick session while a slot is armed.
  // Targets come from the WORKING view (deleted points are not
  // pickable; split pieces and copies are).
  useEffect(() => {
    const controller: MapController | null = getController();
    if (!controller) return;
    if (pickMode === null || !workingData) {
      controller.endPickSession();
      return;
    }
    const targets = buildSurgeryTargets(workingData);
    controller.startPickSession({
      mode: "point",
      targets,
      callbacks: {
        onSpanPicked: () => undefined,
        onAnchorPicked: () => undefined,
        onPointPicked: (pointId: PointId) => {
          pickSeq.current += 1;
          setLastPick({ slot: pickMode, pointId, seq: pickSeq.current });
          setPickSlot(null);
          announce(t("hook.surgery.pointPicked"));
        },
        onCancel: () => setPickSlot(null),
      },
    });
    return () => controller.endPickSession();
  }, [pickMode, workingData, getController, t]);

  // -- resolvers + planners (pure, over the working view) --------------------

  const pointAt = useCallback(
    (segmentId: string, number1Based: number) => {
      if (!workingData) return null;
      const segment = workingData.segments.find((s) => s.id === segmentId);
      if (!segment) return null;
      const index = number1Based - 1;
      if (!Number.isInteger(number1Based) || index < 0 || index >= segment.points.length) {
        return null;
      }
      const point = segment.points[index];
      return { pointId: point.id, lat: point.lat, lon: point.lon };
    },
    [workingData],
  );

  const locate = useCallback(
    (pointId: string) => {
      if (!workingData) return null;
      const location = locateWorkingPoint(workingData, pointId);
      return location
        ? { segmentId: location.segmentId, number: location.index + 1 }
        : null;
    },
    [workingData],
  );

  const planSplit = useCallback(
    (segmentId: string, afterNumber: number) => {
      if (!workingData) return null;
      const target = pointAt(segmentId, afterNumber);
      if (!target) return null;
      return planSplitSegment(workingData, segmentId as SegmentId, target.pointId);
    },
    [workingData, pointAt],
  );

  const planRange = useCallback(
    (segmentId: string, fromNumber: number, toNumber: number) => {
      if (!workingData) return null;
      const from = pointAt(segmentId, fromNumber);
      const to = pointAt(segmentId, toNumber);
      if (!from || !to) return null;
      return planDeleteRange(
        workingData,
        segmentId as SegmentId,
        from.pointId,
        to.pointId,
      );
    },
    [workingData, pointAt],
  );

  const planDuplicate = useCallback(
    (segmentId: string) =>
      workingData
        ? planDuplicateSegment(workingData, segmentId as SegmentId)
        : null,
    [workingData],
  );

  const planOrder = useCallback(
    (order: readonly string[]) =>
      workingData
        ? planSegmentOrder(workingData, order as readonly SegmentId[])
        : null,
    [workingData],
  );

  const applyPlan = useCallback((plan: FixPlan) => {
    const appliedAt = Date.now();
    useWorkingStore
      .getState()
      .applyEdit(editFromPlan(plan, nextEditId(), appliedAt));
    announce(
      t("hook.surgery.applied", { label: translateLabel(t, plan.label) }),
    );
  }, [t]);

  return useMemo(
    () => ({
      pickMode,
      beginPick,
      cancelPick,
      lastPick,
      pointAt,
      locate,
      planSplit,
      planRange,
      planDuplicate,
      planOrder,
      applyPlan,
    }),
    [
      pickMode,
      beginPick,
      cancelPick,
      lastPick,
      pointAt,
      locate,
      planSplit,
      planRange,
      planDuplicate,
      planOrder,
      applyPlan,
    ],
  );
}

/** Every usable point of the working view, in document order. */
function buildSurgeryTargets(
  working: NonNullable<GpxSession["workingData"]>,
): Parameters<MapController["startPickSession"]>[0]["targets"] {
  const targets: {
    pointId: PointId;
    lat: number;
    lon: number;
    trackIndex: number;
    isSegmentEnd?: boolean;
  }[] = [];
  for (const segment of working.segments) {
    for (const point of segment.points) {
      // The established pick predicate — damaged coordinates (Null
      // Island, non-finite) are not pickable surgery anchors.
      if (!isUsableStatsPoint(point)) continue;
      targets.push({
        pointId: point.id,
        lat: point.lat,
        lon: point.lon,
        trackIndex: segment.trackIndex,
      });
    }
  }
  return targets;
}
