/**
 * BatchPresetDialog (Phase 18 — §EE 18.2) — the per-file preview of a
 * batch preset: the FixPreviewDialog's plural twin.
 *
 * Lists every parsed file with the chain the preset would run on it —
 * the plan labels and their first summary sentence, the same words the
 * single-file dialog shows — and says "nothing to do" plainly for
 * files the chain cannot help. Confirm applies each file's plans;
 * Cancel leaves every file untouched.
 */

"use client";

import { Wrench } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import type { BatchPresetFilePlan } from "@/hooks/use-batch-session";
import { useI18n } from "@/hooks/use-i18n";
import { translateLabel } from "@/i18n/runtime";

export interface BatchPresetDialogProps {
  /** The pending flow (null = closed). */
  pending: { name: string; perFile: readonly BatchPresetFilePlan[] } | null;
  onConfirm: () => void;
  onClose: () => void;
}

export function BatchPresetDialog({
  pending,
  onConfirm,
  onClose,
}: BatchPresetDialogProps) {
  const { t } = useI18n();
  const open = pending !== null;
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        data-testid="batch-preset-dialog"
        className="gap-0 overflow-hidden p-0 sm:max-w-lg"
      >
        <div className="border-b-[1.5px] border-ink pl-5 pr-12 pt-4">
          <DialogTitle className="flex items-center gap-2 text-left text-[17px] font-bold tracking-tight">
            <Wrench className="size-4 text-signal" aria-hidden="true" />
            {pending?.name} —{" "}
            {t(
              (pending?.perFile.length ?? 0) === 1
                ? "batch.preset.dialogTitleOne"
                : "batch.preset.dialogTitleMany",
              { count: pending?.perFile.length ?? 0 },
            )}
          </DialogTitle>
          <DialogDescription className="mt-0.5 pb-3 text-left text-[13px] text-muted-foreground">
            {t("batch.preset.dialogDescription")}
          </DialogDescription>
        </div>
        <div className="max-h-[min(70vh,640px)] overflow-y-auto overscroll-contain p-5">
          <ul className="grid gap-2.5">
            {pending?.perFile.map((file) => (
              <li
                key={file.itemId}
                data-testid="batch-preset-file"
                className="grid gap-1 rounded-[9px] border-[1.25px] border-ink/15 px-3 py-2.5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge
                    tone={
                      file.plans !== null && file.plans.length > 0
                        ? "warning"
                        : "info"
                    }
                  >
                    {file.plans !== null && file.plans.length > 0
                      ? t(
                          file.plans.length === 1
                            ? "batch.preset.stepOne"
                            : "batch.preset.stepMany",
                          { count: file.plans.length },
                        )
                      : t("batch.preset.nothingToDo")}
                  </StatusBadge>
                  <span
                    className="min-w-0 flex-1 truncate text-[13px] font-semibold"
                    title={file.fileName}
                  >
                    {file.fileName}
                  </span>
                </div>
                {file.plans?.map((plan) => (
                  <p
                    key={plan.kind}
                    className="text-[11.5px] leading-relaxed text-muted-foreground"
                  >
                    <span className="font-semibold text-ink">
                      {translateLabel(t, plan.label)}.
                    </span>{" "}
                    {translateLabel(t, plan.summary[0] ?? "")}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t-[1.5px] border-ink px-5 py-3.5">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("batch.preset.cancel")}
          </Button>
          <Button
            type="button"
            data-testid="batch-preset-confirm"
            onClick={onConfirm}
          >
            {t("batch.preset.apply")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
