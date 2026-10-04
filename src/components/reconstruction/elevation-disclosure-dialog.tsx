/**
 * ElevationDisclosureDialog — the FR-6.5 privacy gate (Phase 6).
 *
 * Nothing is sent until this dialog is confirmed. It states, in plain
 * language and exact numbers: WHICH points leave (reconstructed points
 * only, never the file, never the recorded route), HOW MANY (after the
 * per-gap cap, with the unsampled total when the cap applied), WHERE
 * they go (the provider's host), and how many requests that makes at
 * the provider's own rate limit.
 *
 * Pure presentation: props in (confirm intent out). The provider copy
 * (privacy note, attribution) flows in from the elevation binding so
 * a future provider only edits its own strings.
 */

"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MountainSnow } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";

export interface ElevationDisclosureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Points that would be sent (after the per-gap cap). */
  sentPoints: number;
  /** Interior points before the cap ("sampled from" when it applied). */
  totalPoints: number;
  /** Requests this makes (provider batches ~100 points per request). */
  requestCount: number;
  /** Provider display name (e.g. "OpenTopoData"). */
  providerName: string;
  /** The provider's plain-language privacy note. */
  privacyNote: string;
  /** Called when the user confirms — the fetch starts. */
  onConfirm: () => void;
}

export function ElevationDisclosureDialog({
  open,
  onOpenChange,
  sentPoints,
  totalPoints,
  requestCount,
  providerName,
  privacyNote,
  onConfirm,
}: ElevationDisclosureDialogProps) {
  const { t } = useI18n();
  const sampled = sentPoints < totalPoints;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="elevation-disclosure-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MountainSnow className="size-4 text-signal" aria-hidden="true" />
            {t("elevationDialog.title", { provider: providerName })}
          </DialogTitle>
          <DialogDescription>
            {t("elevationDialog.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 text-sm" data-testid="elevation-disclosure-body">
          <p>
            <span className="font-medium">
              {sentPoints === 1
                ? t("elevationDialog.coordinateOne", {
                    count: sentPoints.toLocaleString("en-US"),
                  })
                : t("elevationDialog.coordinateMany", {
                    count: sentPoints.toLocaleString("en-US"),
                  })}
            </span>{" "}
            {t("elevationDialog.ofYourPoints")}
            {sampled ? (
              <>
                {" "}
                {t("elevationDialog.sampledSuffix", {
                  total: totalPoints.toLocaleString("en-US"),
                })}
              </>
            ) : (
              t("elevationDialog.everyPointSuffix")
            )}{" "}
            {requestCount === 1
              ? t("elevationDialog.willSendOne", { count: requestCount })
              : t("elevationDialog.willSendMany", { count: requestCount })}{" "}
            <span className="font-medium">{providerName}</span>
            {t("elevationDialog.sentenceEnd")}
          </p>
          <p className="text-muted-foreground">{privacyNote}</p>
          <p className="text-muted-foreground">
            {t("elevationDialog.resultPrefix")}{" "}
            <span className="font-medium">
              {t("elevationDialog.estimatedWord")}
            </span>{" "}
            {t("elevationDialog.resultSuffix")}
          </p>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            data-testid="elevation-disclosure-cancel"
            onClick={() => onOpenChange(false)}
          >
            {t("elevationDialog.cancel")}
          </Button>
          <Button
            type="button"
            data-testid="elevation-disclosure-confirm"
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {sentPoints === 1
              ? t("elevationDialog.sendOne", {
                  count: sentPoints.toLocaleString("en-US"),
                })
              : t("elevationDialog.sendMany", {
                  count: sentPoints.toLocaleString("en-US"),
                })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
