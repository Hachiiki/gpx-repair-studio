/**
 * BatchQueueCard (Phase 18 — §EE 18.1) — the studio's queue table:
 * one row per file with the plan's status vocabulary (parsed / issues
 * found / fixed / exported), the honest numbers (recorded points, deep
 * findings), the applied-fix summary line, and the per-file controls
 * (undo the most recent fix, remove).
 *
 * The status word is the binding's derived view — never a second
 * computation. Failed files show their typed error; nothing is hidden.
 */

"use client";

import { CircleCheck, Undo2, Wrench, X } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import type { BatchSessionBinding, BatchItemView } from "@/hooks/use-batch-session";
import type { PresetId } from "@/types/domain";
import { useI18n } from "@/hooks/use-i18n";
import { translateLabel } from "@/i18n/runtime";

/** The §EE status vocabulary → chip tone + label key. */
const STATUS_WORDS: Record<
  BatchItemView["statusWord"],
  { tone: StatusTone; labelKey: string }
> = {
  queued: { tone: "neutral", labelKey: "batch.status.queued" },
  reading: { tone: "info", labelKey: "batch.status.reading" },
  failed: { tone: "danger", labelKey: "batch.status.failed" },
  fixed: { tone: "success", labelKey: "batch.status.fixed" },
  "issues-found": { tone: "warning", labelKey: "batch.status.issuesFound" },
  clean: { tone: "info", labelKey: "batch.status.clean" },
};

export interface BatchQueueCardProps {
  session: BatchSessionBinding;
  /** Open the preset flow pre-aimed at the files with findings. */
  onOpenPreset: (id: PresetId) => void;
}

export function BatchQueueCard({ session, onOpenPreset }: BatchQueueCardProps) {
  const { t } = useI18n();
  const findings = session.aggregate.issuesFound;
  return (
    <Card data-testid="batch-queue-card">
      <CardHeader>
        <h3 className="flex items-center gap-2 text-[15.5px] font-bold leading-tight">
          <span
            className="size-2 shrink-0 rounded-[1px] bg-signal"
            aria-hidden="true"
          />
          {t("batch.queue.title")}
        </h3>
        <CardDescription>
          {session.aggregate.total === 1
            ? t("batch.queue.fileOne", { count: session.aggregate.total })
            : t("batch.queue.fileMany", { count: session.aggregate.total })}{" "}
          ·{" "}
          {t("batch.queue.parsedCount", { count: session.aggregate.parsed })}
          {session.aggregate.failed > 0
            ? t("batch.queue.failedCount", { count: session.aggregate.failed })
            : ""}
          {session.aggregate.fixed > 0
            ? t("batch.queue.fixedCount", { count: session.aggregate.fixed })
            : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {findings > 0 && (
          <p className="flex items-start gap-2 rounded-[8px] border-[1.5px] border-signal bg-signal/[0.06] px-3 py-2 text-[12.5px] leading-relaxed text-ink">
            <Wrench className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {t(
              findings === 1
                ? "batch.queue.findingsOne"
                : "batch.queue.findingsMany",
              { count: findings },
            )}
          </p>
        )}
        <ScrollArea className="max-h-[26rem] -mx-2">
          <ul className="grid gap-2 px-2" data-testid="batch-queue-rows">
            {session.views.map((view) => (
              <QueueRow
                key={view.item.id}
                view={view}
                session={session}
                onOpenPreset={onOpenPreset}
              />
            ))}
          </ul>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function QueueRow({
  view,
  session,
  onOpenPreset,
}: {
  view: BatchItemView;
  session: BatchSessionBinding;
  onOpenPreset: (id: PresetId) => void;
}) {
  const { t } = useI18n();
  const { item } = view;
  const status = STATUS_WORDS[view.statusWord];
  const points =
    view.working !== null
      ? countPoints(view.working.segments)
      : item.data
        ? countPoints(item.data.segments)
        : null;
  const findings = view.report?.totalCount ?? 0;
  const lastEdit = item.edits.at(-1);

  return (
    <li
      data-testid="batch-queue-row"
      data-status={view.statusWord}
      className="grid gap-1.5 rounded-[9px] border-[1.25px] border-ink/15 px-3 py-2.5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={status.tone}>{t(status.labelKey)}</StatusBadge>
        {item.exported && (
          <StatusBadge tone="outline">{t("batch.status.exported")}</StatusBadge>
        )}
        <span
          className="min-w-0 flex-1 truncate text-[13px] font-semibold"
          title={item.fileName}
        >
          {item.fileName}
        </span>
        {view.statusWord === "fixed" && (
          <button
            type="button"
            data-testid={`batch-undo-${item.id}`}
            className="inline-flex items-center gap-1.5 rounded-[5px] px-2 py-1 text-[12px] font-bold text-signal-ink transition-colors hover:bg-signal/10 hover:underline hover:underline-offset-[3px] focus-visible:outline-2"
            onClick={() => session.undoFileEdit(item.id)}
          >
            <Undo2 className="size-3.5" aria-hidden="true" />
            {t("batch.queue.undoLastFix")}
          </button>
        )}
        <button
          type="button"
          data-testid={`batch-remove-${item.id}`}
          aria-label={t("batch.queue.removeAria", { name: item.fileName })}
          className="rounded-[5px] p-1 text-muted-foreground transition-colors hover:bg-ink/[0.06] hover:text-foreground focus-visible:outline-2"
          onClick={() => session.removeItem(item.id)}
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      {view.statusWord === "failed" && item.error && (
        <p className="text-[11.5px] leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
          <span className="font-semibold text-ink">{item.error.title}.</span>{" "}
          {item.error.detail}
        </p>
      )}

      {view.statusWord !== "failed" && (
        <p className="text-[11.5px] leading-relaxed text-muted-foreground">
          {points !== null &&
            t(
              points === 1
                ? "batch.queue.recordedPointsOne"
                : "batch.queue.recordedPointsMany",
              { count: points.toLocaleString() },
            )}
          {view.statusWord !== "reading" && view.statusWord !== "queued" && (
            <>
              {" · "}
              {findings === 0 ? (
                <span className="inline-flex items-center gap-1">
                  <CircleCheck
                    className="size-3 shrink-0 text-ink"
                    aria-hidden="true"
                  />
                  {t("batch.queue.deepChecksClean")}
                </span>
              ) : (
                <>
                  {t(
                    findings === 1
                      ? "batch.queue.deepChecksOne"
                      : "batch.queue.deepChecksMany",
                    { count: findings },
                  )}
                  {view.statusWord === "issues-found" && (
                    <>
                      {" — "}
                      <button
                        type="button"
                        className="font-bold text-signal-ink underline decoration-signal/40 underline-offset-[3px] hover:bg-signal/10 focus-visible:outline-2"
                        onClick={() => onOpenPreset("spike-sweep")}
                      >
                        {t("batch.queue.fixWithPreset")}
                      </button>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </p>
      )}

      {lastEdit !== undefined && (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {t("batch.queue.lastFix", { label: translateLabel(t, lastEdit.label) })}
          {item.edits.length > 1 &&
            t("batch.queue.earlierFixes", { count: item.edits.length - 1 })}
        </p>
      )}
    </li>
  );
}

function countPoints(
  segments: readonly { points: readonly unknown[] }[],
): number {
  let total = 0;
  for (const segment of segments) total += segment.points.length;
  return total;
}
