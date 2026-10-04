/**
 * useRepairAnnouncements — the repair flow's two non-visual moments
 * (Phase 8): gaps detected after a parse, and a reconstruction
 * finishing.
 *
 * Both are DERIVED-state transitions, not events the stores fire, so
 * the hook diffs what the UI already renders from (the parsed model
 * and the per-gap statuses) and speaks only the transitions:
 *
 *   - "gaps detected" — once per parsed model (`data` is a fresh
 *     object every parse; re-running gap detection on threshold
 *     changes keeps the same model object, so threshold tuning stays
 *     quiet — the gap list visibly updates instead);
 *   - "reconstruction finished" — a gap whose derived status just
 *     became `reconstructed` (vertices committed and the editor no
 *     longer open on it). Batches into one utterance when several
 *     land in the same commit.
 *
 * Pure wiring — the wording lives here, the bus lives in
 * lib/announcements.ts, and nothing renders.
 */

import { useEffect, useRef } from "react";
import { announce } from "@/lib/announcements";
import { useI18n } from "@/hooks/use-i18n";
import type { GapStatus } from "@/state/editor-store";
import type { SessionStatus } from "@/state/session-store";
import type { OriginalTrackData } from "@/types/domain";

export interface RepairAnnouncementsInput {
  status: SessionStatus;
  fileName: string | null;
  /** Fresh object per parse — the announcement's identity key. */
  data: OriginalTrackData | null;
  gapCount: number;
  statusById: Readonly<Record<string, GapStatus>>;
}

export function useRepairAnnouncements(input: RepairAnnouncementsInput): void {
  const { t } = useI18n();
  const { status, fileName, data, gapCount, statusById } = input;

  // -- gaps detected (once per parsed model) --------------------------------
  const lastAnnouncedData = useRef<OriginalTrackData | null>(null);
  useEffect(() => {
    if (status !== "parsed" || !data) return;
    if (lastAnnouncedData.current === data) return;
    lastAnnouncedData.current = data;
    announce(
      gapCount > 0
        ? t(
            gapCount === 1
              ? "hook.repairAnnounce.gapsOne"
              : "hook.repairAnnounce.gapsMany",
            {
              count: gapCount,
              file: fileName ?? t("hook.repairAnnounce.theFile"),
            },
          )
        : t("hook.repairAnnounce.loadedNoGaps", {
            file: fileName ?? t("hook.repairAnnounce.fileFallback"),
          }),
    );
  }, [status, data, gapCount, fileName, t]);

  // -- reconstruction finished (status transitions) -------------------------
  const previousStatuses = useRef<Readonly<Record<string, GapStatus>>>({});
  useEffect(() => {
    const previous = previousStatuses.current;
    previousStatuses.current = statusById;
    // Skip the very first population (a file load sets `new` statuses;
    // mounting an editor sets `in-progress`) — only BECOMING
    // reconstructed is the finish moment.
    const finished = Object.keys(statusById).filter(
      (gapId) =>
        previous[gapId] !== undefined &&
        previous[gapId] !== "reconstructed" &&
        statusById[gapId] === "reconstructed",
    );
    if (finished.length === 0) return;
    const total = Object.keys(statusById).length;
    const repaired = Object.values(statusById).filter(
      (s) => s === "reconstructed",
    ).length;
    announce(
      finished.length === 1
        ? t("hook.repairAnnounce.reconstructedOne", {
            repaired,
            total,
          })
        : t("hook.repairAnnounce.reconstructedMany", {
            count: finished.length,
            repaired,
            total,
          }),
    );
  }, [statusById, t]);
}
