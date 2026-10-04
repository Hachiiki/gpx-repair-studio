/**
 * BatchStudio (Phase 18 — §EE 18.1) — the composition root of the
 * Batch section: the queue table, the preset door (chips + the shared
 * per-file preview dialog), and the ZIP export, under one aggregate
 * line.
 *
 * No map by design: the batch is a table workflow (the plan's queue
 * list + statuses + aggregate stats; per-file maps are a non-goal —
 * the repair studio is the per-file surface). The shell mounts this
 * only while the section's phase is "studio"; its uploads happen on
 * the landing's batch tool page (BatchIntake).
 *
 * The BINDING arrives as a prop — the AppShell owns the single
 * `useBatchSession()` instance (the intake and the studio share one
 * parse pump; two instances would race the queue).
 *
 * Composition only (§D-6): the cards, the one dialog — nothing else.
 */

"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BatchQueueCard } from "@/components/batch/batch-queue-card";
import { BatchPresetCard } from "@/components/batch/batch-preset-card";
import { BatchPresetDialog } from "@/components/batch/batch-preset-dialog";
import { BatchExportCard } from "@/components/batch/batch-export-card";
import { BatchSummarySection } from "@/components/compare/batch-summary-section";
import type { BatchSessionBinding } from "@/hooks/use-batch-session";
import { useBatchStore } from "@/state/batch-store";
import type { PresetId } from "@/types/domain";
import { formatDistanceMeters } from "@/lib/utils/format";
import { useI18n } from "@/hooks/use-i18n";

/** The studio's one piece of local state: the pending preset flow. */
interface PendingPreset {
  id: PresetId;
  name: string;
  perFile: ReturnType<BatchSessionBinding["planBatchPreset"]>;
}

export function BatchStudio({ session }: { session: BatchSessionBinding }) {
  const { t } = useI18n();
  const [pending, setPending] = useState<PendingPreset | null>(null);
  const aggregate = session.aggregate;

  // The aggregate line — one sentence, every number derived (§EE 18.1).
  const summaryParts = [
    t("batch.studio.summaryParsed", { count: aggregate.parsed }),
    ...(aggregate.failed > 0
      ? [t("batch.studio.summaryFailed", { count: aggregate.failed })]
      : []),
    ...(aggregate.fixed > 0
      ? [t("batch.studio.summaryFixed", { count: aggregate.fixed })]
      : []),
    ...(aggregate.issuesFound > 0
      ? [t("batch.studio.summaryFindings", { count: aggregate.issuesFound })]
      : []),
    ...(aggregate.clean > 0
      ? [t("batch.studio.summaryClean", { count: aggregate.clean })]
      : []),
  ];
  const summary = summaryParts.join(" · ");

  const openPreset = (id: PresetId) => {
    const preset = session.presets.find((p) => p.id === id);
    if (!preset) return;
    setPending({
      id,
      name: preset.name,
      perFile: session.planBatchPreset(id),
    });
  };

  const confirmPreset = () => {
    if (pending === null) return;
    session.applyBatchPlans(pending.id, pending.perFile);
    setPending(null);
  };

  return (
    <section
      aria-label={t("batch.studio.sectionAria")}
      data-testid="batch-section"
      className="scroll-mt-20"
      id="batch"
    >
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 py-8">
        {/*
         * Phase 19 — the studio's interactive furniture hides under
         * print; the batch summary region below carries the sheet (the
         * stats print flow's discipline, applied to the batch studio).
         */}
        <div data-print-hide className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2.5 font-display text-[30px] font-bold leading-[1.05] tracking-[0.01em]">
              <span
                className="size-[11px] shrink-0 rounded-[1.5px] bg-signal"
                aria-hidden="true"
              />
              {t("batch.studio.title")}
            </h2>
            <p
              className="mt-1.5 max-w-[62ch] text-sm leading-relaxed text-muted-foreground"
              data-testid="batch-aggregate"
            >
              {summary} ·{" "}
              {t("batch.studio.recordedPoints", {
                count: aggregate.recordedPoints.toLocaleString(),
              })}{" "}
              ·{" "}
              {t("batch.studio.recordedDistance", {
                distance: formatDistanceMeters(aggregate.recordedDistanceM),
              })}
              {aggregate.deletedPoints > 0 &&
                t("batch.studio.pointsRemoved", {
                  count: aggregate.deletedPoints.toLocaleString(),
                })}
              {t("batch.studio.aggregateNote")}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            data-testid="batch-add-files"
            onClick={() => useBatchStore.getState().backToIntake()}
          >
            <Plus className="size-4" aria-hidden="true" />
            {t("batch.studio.addFiles")}
          </Button>
        </div>

        <BatchQueueCard session={session} onOpenPreset={openPreset} />
        <BatchPresetCard
          presets={session.presets}
          onOpenPreset={openPreset}
        />
        <BatchExportCard session={session} />
        </div>

        {/*
         * Phase 19 — the per-batch summary sheet (§EE 19.2): on screen
         * a card under the export; on paper the whole show (masthead +
         * one row per file, thumbnails included).
         */}
        <div data-print-region="batch-summary">
          <BatchSummarySection session={session} />
        </div>

        <BatchPresetDialog
          pending={pending}
          onConfirm={confirmPreset}
          onClose={() => setPending(null)}
        />
      </div>
    </section>
  );
}
