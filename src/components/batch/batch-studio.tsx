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
import type { BatchSessionBinding } from "@/hooks/use-batch-session";
import { useBatchStore } from "@/state/batch-store";
import type { PresetId } from "@/types/domain";
import { formatDistanceMeters } from "@/lib/utils/format";

/** The studio's one piece of local state: the pending preset flow. */
interface PendingPreset {
  id: PresetId;
  name: string;
  perFile: ReturnType<BatchSessionBinding["planBatchPreset"]>;
}

export function BatchStudio({ session }: { session: BatchSessionBinding }) {
  const [pending, setPending] = useState<PendingPreset | null>(null);
  const aggregate = session.aggregate;

  // The aggregate line — one sentence, every number derived (§EE 18.1).
  const summaryParts = [
    `${aggregate.parsed} parsed`,
    ...(aggregate.failed > 0 ? [`${aggregate.failed} failed`] : []),
    ...(aggregate.fixed > 0 ? [`${aggregate.fixed} fixed`] : []),
    ...(aggregate.issuesFound > 0
      ? [`${aggregate.issuesFound} with findings`]
      : []),
    ...(aggregate.clean > 0 ? [`${aggregate.clean} clean`] : []),
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
      aria-label="Batch queue studio"
      data-testid="batch-section"
      className="scroll-mt-20"
      id="batch"
    >
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2.5 font-display text-[30px] font-bold leading-[1.05] tracking-[0.01em]">
              <span
                className="size-[11px] shrink-0 rounded-[1.5px] bg-signal"
                aria-hidden="true"
              />
              The batch queue
            </h2>
            <p
              className="mt-1.5 max-w-[62ch] text-sm leading-relaxed text-muted-foreground"
              data-testid="batch-aggregate"
            >
              {summary} · {aggregate.recordedPoints.toLocaleString()} recorded
              points · {formatDistanceMeters(aggregate.recordedDistanceM)}{" "}
              recorded
              {aggregate.deletedPoints > 0 &&
                ` · ${aggregate.deletedPoints.toLocaleString()} points removed by fixes`}
              . Everything stays in this browser; the originals are never
              modified.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            data-testid="batch-add-files"
            onClick={() => useBatchStore.getState().backToIntake()}
          >
            <Plus className="size-4" aria-hidden="true" />
            Add files
          </Button>
        </div>

        <BatchQueueCard session={session} onOpenPreset={openPreset} />
        <BatchPresetCard
          presets={session.presets}
          onOpenPreset={openPreset}
        />
        <BatchExportCard session={session} />

        <BatchPresetDialog
          pending={pending}
          onConfirm={confirmPreset}
          onClose={() => setPending(null)}
        />
      </div>
    </section>
  );
}
