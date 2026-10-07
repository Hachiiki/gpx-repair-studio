/**
 * LibrarySegments (Phase 25.2–25.4) — the segments tab: the
 * user-authored personal segments, each with its effort table (PR
 * first, flagged after, dates shown), the two authoring doors
 * (pick a stretch of the loaded track / draw one on the map), the
 * rematch intent, and the rules disclosure — elapsed time, the drift
 * tolerance, the honesty rule (drawn-in stretches never set PRs), and
 * the repair dividend (§25.4: on Strava a mid-segment gap breaks
 * matching; repairing it here restores eligibility, flagged efforts
 * still never count).
 *
 * Pure presentation: the segments binding arrives as props (the
 * use-segments controller); nothing leaves. Every rule the matcher
 * enforces is disclosed in copy the user can read without leaving
 * the tab.
 */

"use client";

import { useEffect, useState } from "react";
import {
  Flag,
  Info,
  MousePointerClick,
  PenLine,
  RefreshCw,
  Trash2,
  Trophy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useI18n } from "@/hooks/use-i18n";
import type { SegmentsBinding } from "@/hooks/use-segments";
import type { SegmentView } from "@/hooks/use-segments";
import {
  formatDateTime,
  formatDistanceForUnit,
  formatDurationMs,
  type PaceUnit,
} from "@/lib/utils/format";

export interface LibrarySegmentsProps {
  segments: SegmentsBinding;
  paceUnit: PaceUnit;
  /** Close the manager dialog (the authoring doors need the map). */
  onClose: () => void;
}

export function LibrarySegments({
  segments: binding,
  paceUnit,
  onClose,
}: LibrarySegmentsProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  // Opening the tab pays the (idempotent, fingerprint-gated) match
  // pass — never at app load, one session at a time.
  useEffect(() => {
    binding.ensureEfforts();
  }, [binding]);

  const beginStretch = () => {
    binding.beginStretchPick();
    onClose();
  };
  const beginDraw = () => {
    binding.beginDraw();
    onClose();
  };

  const segmentCard = (view: SegmentView) => {
    const open = expanded === view.row.id;
    return (
      <li
        key={view.row.id}
        data-testid="segment-row"
        className="grid gap-2 rounded-[10px] border-[1.25px] border-ink/15 px-3 py-2.5"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <button
            type="button"
            className="flex-1 text-left"
            aria-expanded={open}
            onClick={() => setExpanded(open ? null : view.row.id)}
          >
            <span className="flex items-center gap-1.5 text-[13.5px] font-semibold">
              <Flag className="size-3.5 shrink-0 text-signal" aria-hidden="true" />
              {view.row.name}
            </span>
            <span className="mt-0.5 block text-[11.5px] text-muted-foreground">
              {formatDistanceForUnit(view.row.lengthM, paceUnit)}
              {" · "}
              {view.row.source === "stretch"
                ? t("segments.sourceStretch")
                : t("segments.sourceDrawn")}
            </span>
          </button>
          {view.pr !== null ? (
            <span
              data-testid={`segment-pr-${view.row.id}`}
              className="flex items-center gap-1 rounded-full bg-signal/[0.1] px-2 py-0.5 font-mono text-[12px] font-semibold tabular-nums text-ink"
            >
              <Trophy className="size-3 text-signal" aria-hidden="true" />
              {formatDurationMs(view.pr.elapsedMs)}
            </span>
          ) : view.efforts.length > 0 ? (
            <span className="text-[11.5px] text-muted-foreground">
              {t("segments.flaggedOnly")}
            </span>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[11.5px]"
            aria-label={t("segments.deleteAria", { name: view.row.name })}
            disabled={confirmingDelete !== null}
            onClick={() => setConfirmingDelete(view.row.id)}
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
          </Button>
        </div>

        {confirmingDelete === view.row.id && (
          <div className="flex flex-wrap items-center gap-2 rounded-[8px] bg-muted/50 px-2.5 py-2 text-[12px]">
            <span className="flex-1">
              {t("segments.deleteConfirm", { name: view.row.name })}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2.5 text-[11.5px]"
              onClick={() => setConfirmingDelete(null)}
            >
              {t("segments.deleteNo")}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="h-7 px-2.5 text-[11.5px]"
              data-testid="segment-delete-confirm"
              onClick={() => {
                binding.deleteSegment(view.row.id);
                setConfirmingDelete(null);
              }}
            >
              {t("segments.deleteYes")}
            </Button>
          </div>
        )}

        {open && (
          <div className="grid gap-2" data-testid="segment-detail">
            {view.efforts.length === 0 ? (
              <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                {t("segments.noEfforts")}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="h-8 text-[11px]">
                      {t("segments.effortTime")}
                    </TableHead>
                    <TableHead className="h-8 text-[11px]">
                      {t("segments.effortSession")}
                    </TableHead>
                    <TableHead className="h-8 text-[11px]">
                      {t("segments.effortDate")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {view.efforts.map((effort, index) => (
                    <TableRow
                      key={`${effort.sessionId}-${index}`}
                      data-testid="segment-effort"
                      data-flagged={effort.reconstructed}
                    >
                      <TableCell className="py-1.5 font-mono text-[12px] tabular-nums">
                        {effort === view.pr ? (
                          <span className="flex items-center gap-1 font-semibold">
                            <Trophy
                              className="size-3 text-signal"
                              aria-hidden="true"
                            />
                            {formatDurationMs(effort.elapsedMs)}
                          </span>
                        ) : (
                          formatDurationMs(effort.elapsedMs)
                        )}
                      </TableCell>
                      <TableCell className="max-w-40 truncate py-1.5 text-[12px]">
                        {effort.reconstructed ? (
                          <span
                            className="text-muted-foreground"
                            title={t("segments.flaggedReason")}
                          >
                            {effort.sessionName}
                            {" · "}
                            {t("segments.flaggedTag")}
                          </span>
                        ) : (
                          effort.sessionName
                        )}
                      </TableCell>
                      <TableCell className="py-1.5 text-[12px] text-muted-foreground">
                        {effort.activityStartMs !== null
                          ? formatDateTime(effort.activityStartMs)
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {view.row.efforts !== undefined && (
              <p className="text-[11px] text-muted-foreground">
                {t("segments.asOf", {
                  date: formatDateTime(view.row.efforts.computedAt),
                })}
              </p>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-fit px-2.5 text-[11.5px]"
              disabled={binding.matching}
              onClick={binding.rematch}
            >
              <RefreshCw className="size-3.5" aria-hidden="true" />
              {t("segments.rematch")}
            </Button>
          </div>
        )}
      </li>
    );
  };

  return (
    <section
      data-testid="segments-card"
      aria-label={t("segments.title")}
      className="grid gap-3"
    >
      <div>
        <h3 className="flex items-center gap-2 text-[15.5px] font-bold leading-tight">
          <Flag className="size-4 text-signal" aria-hidden="true" />
          {t("segments.title")}
        </h3>
        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
          {t("segments.desc")}
        </p>
      </div>

      {/* The two authoring doors — both need the repair map (load a
       * file first); opening one closes the dialog so the map is
       * reachable. */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          className="h-8 gap-1.5 px-2.5 text-[12px]"
          data-testid="segments-new-stretch"
          disabled={!binding.canAuthor}
          title={
            binding.canAuthor
              ? undefined
              : t("segments.authorNeedsTrack")
          }
          onClick={beginStretch}
        >
          <MousePointerClick className="size-3.5" aria-hidden="true" />
          {t("segments.newStretch")}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="h-8 gap-1.5 px-2.5 text-[12px]"
          data-testid="segments-new-draw"
          disabled={!binding.canAuthor}
          title={
            binding.canAuthor
              ? undefined
              : t("segments.authorNeedsTrack")
          }
          onClick={beginDraw}
        >
          <PenLine className="size-3.5" aria-hidden="true" />
          {t("segments.newDraw")}
        </Button>
      </div>
      {!binding.canAuthor && (
        <p className="text-[11.5px] leading-relaxed text-muted-foreground">
          {t("segments.authorNeedsTrack")}
        </p>
      )}

      {/* The rules disclosure (each engine rule, readable in place). */}
      <details className="rounded-[10px] border-[1.25px] border-ink/15 px-3 py-2">
        <summary className="flex cursor-pointer items-center gap-1.5 text-[12.5px] font-semibold">
          <Info className="size-3.5 text-muted-foreground" aria-hidden="true" />
          {t("segments.rulesTitle")}
        </summary>
        <ul className="mt-2 grid gap-1.5 text-[12px] leading-relaxed text-muted-foreground">
          <li>{t("segments.ruleElapsed")}</li>
          <li>{t("segments.ruleTolerance", { meters: binding.driftToleranceM })}</li>
          <li>{t("segments.ruleHonesty")}</li>
          <li>{t("segments.ruleRepair")}</li>
        </ul>
      </details>

        {/* The pass's progress — at section level, so a shelf with
         * no segments yet still discloses that matching is running. */}
        {binding.matching && (
          <p
            className="text-[11.5px] text-muted-foreground"
            role="status"
            data-testid="segments-matching"
          >
            {t("segments.matching", {
              done: binding.matchDone,
              total: binding.matchTotal,
            })}
          </p>
        )}

      {binding.segments.length === 0 ? (
        <p
          data-testid="segments-empty"
          className="text-[12.5px] leading-relaxed text-muted-foreground"
        >
          {t("segments.none")}
        </p>
      ) : (
        <ul role="list" className="grid gap-2">
          {binding.segments.map((view) => segmentCard(view))}
        </ul>
      )}
    </section>
  );
}
