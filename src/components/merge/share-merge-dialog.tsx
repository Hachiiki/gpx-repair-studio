/**
 * ShareMergeDialog — the "Share card" warning of the Merge section (the
 * header button's gate).
 *
 * Sharing a merged recording does TWO things at once, so it asks first
 * and says exactly what will happen (the same consent pattern as the
 * create section's ShareCreateDialog and the elevation disclosure):
 *
 *   1. the merged GPX downloads immediately — the identical file the
 *      export card's Download button produces (the current arrangement,
 *      serialized at click time);
 *   2. the share card view opens — the combined route with the
 *      distance, pace, and time the merged file carries.
 *
 * Cancel is a full no-op: nothing downloads, the arrangement stays.
 * Pure presentation: props in (the confirm intent out); the open state
 * lives in the merge store (`shareDialogOpen`), the export + view
 * switch in the composition root (MergeStudio).
 *
 * Task 44 — Merge section share flow. Client component.
 */

"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Download, ImageUp } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import type { ShareCardContent } from "@/hooks/use-merge-share";

export interface ShareMergeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The file the confirm will download (name shown verbatim). */
  fileName: string;
  /** The share card's trio (what the card will show) — the studio's own
   * numbers, so the dialog and the view can never disagree. */
  content: ShareCardContent | null;
  /** Confirm: download the GPX and open the share card view. */
  onConfirm: () => void;
}

export function ShareMergeDialog({
  open,
  onOpenChange,
  fileName,
  content,
  onConfirm,
}: ShareMergeDialogProps) {
  const { t } = useI18n();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        className="rounded-[12px] border-2 border-ink"
        data-testid="merge-share-dialog"
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-left">
            <ImageUp className="size-4 text-signal" aria-hidden="true" />
            {t("merge.shareDialog.title")}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-left">
            {t("merge.shareDialog.intro")}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <ol className="grid gap-2 text-left text-sm leading-relaxed text-ink">
          <li className="flex items-start gap-2.5 rounded-[10px] border-[1.5px] border-ink/15 bg-ink/[0.03] px-3 py-2.5">
            <Download
              className="mt-0.5 size-4 shrink-0 text-signal"
              aria-hidden="true"
            />
            <span>
              <span className="font-semibold">
                {t("merge.shareDialog.step1Lead")}
              </span>{" "}
              {t("merge.shareDialog.step1Mid")}{" "}
              <span className="font-semibold">{fileName}</span>
              {t("merge.shareDialog.step1Tail")}
            </span>
          </li>
          <li className="flex items-start gap-2.5 rounded-[10px] border-[1.5px] border-ink/15 bg-ink/[0.03] px-3 py-2.5">
            <ImageUp
              className="mt-0.5 size-4 shrink-0 text-signal"
              aria-hidden="true"
            />
            <span>
              <span className="font-semibold">
                {t("merge.shareDialog.step2Lead")}
              </span>{" "}
              {t("merge.shareDialog.step2Mid")}{" "}
              {content ? (
                <>
                  <span className="font-semibold">{content.distance}</span>,{" "}
                  <span className="font-semibold">{content.pace}</span>
                  {t("merge.shareDialog.andGlue")}
                  <span className="font-semibold">{content.time}</span>
                </>
              ) : (
                t("merge.shareDialog.step2Fallback")
              )}
              {t("merge.shareDialog.step2Tail")}
            </span>
          </li>
        </ol>

        <p className="text-left text-xs leading-relaxed text-muted-foreground">
          {t("merge.shareDialog.honesty")}
        </p>

        <AlertDialogFooter className="sm:flex-col sm:items-stretch">
          <AlertDialogAction
            className="h-10 gap-1.5 font-bold"
            data-testid="merge-share-confirm"
            onClick={onConfirm}
          >
            <Download className="size-4" aria-hidden="true" />
            {t("merge.shareDialog.confirm")}
          </AlertDialogAction>
          <AlertDialogCancel
            className="h-10 gap-1.5 border-[1.5px] font-semibold"
            data-testid="merge-share-cancel"
          >
            {t("merge.shareDialog.cancel")}
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
