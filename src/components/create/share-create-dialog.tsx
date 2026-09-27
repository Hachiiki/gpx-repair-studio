/**
 * ShareCreateDialog — the "Share card" warning of the "create from
 * activity stats" workflow (the header button's gate).
 *
 * Sharing a created activity does TWO things at once, so it asks first
 * and says exactly what will happen (the same consent pattern as the
 * elevation disclosure):
 *
 *   1. the reconstructed GPX downloads immediately — the identical file
 *      the review's Export button produces (elevation included when a
 *      fresh estimate exists);
 *   2. the share card view opens — the drawn route with the distance,
 *      pace, and time the file carries.
 *
 * Cancel is a full no-op: nothing downloads, the review stays. Pure
 * presentation: props in (the confirm intent out); the open state lives
 * in the create store (`shareDialogOpen`), the export + view switch in
 * the composition root (CreateStudio).
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
import type { CreateShareContent } from "@/hooks/use-create-share";

export interface ShareCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The file the confirm will download (name shown verbatim). */
  fileName: string;
  /** The share card's trio (what the card will show) — the review's own
   * numbers, so the dialog and the view can never disagree. */
  content: CreateShareContent | null;
  /** Confirm: download the GPX and open the share card view. */
  onConfirm: () => void;
}

export function ShareCreateDialog({
  open,
  onOpenChange,
  fileName,
  content,
  onConfirm,
}: ShareCreateDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        className="rounded-[12px] border-2 border-ink"
        data-testid="create-share-dialog"
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-left">
            <ImageUp className="size-4 text-signal" aria-hidden="true" />
            Share your created activity
          </AlertDialogTitle>
          <AlertDialogDescription className="text-left">
            Here is exactly what happens next — nothing leaves this browser
            either way.
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
                Your GPX downloads now
              </span>{" "}
              — <span className="font-semibold">{fileName}</span>, the same
              file the Export button produces
              {content?.includesEstimatedElevation
                ? ", including the estimated elevation"
                : ""}
              . Import it into Strava or any GPX platform.
            </span>
          </li>
          <li className="flex items-start gap-2.5 rounded-[10px] border-[1.5px] border-ink/15 bg-ink/[0.03] px-3 py-2.5">
            <ImageUp
              className="mt-0.5 size-4 shrink-0 text-signal"
              aria-hidden="true"
            />
            <span>
              <span className="font-semibold">
                The share card opens
              </span>{" "}
              — your drawn route as a Strava-style graphic with{" "}
              {content ? (
                <>
                  <span className="font-semibold">{content.distance}</span>,{" "}
                  <span className="font-semibold">{content.pace}</span>, and{" "}
                  <span className="font-semibold">{content.time}</span>
                </>
              ) : (
                "the file's distance, pace, and time"
              )}
              . Download it as a PNG from there.
            </span>
          </li>
        </ol>

        <p className="text-left text-xs leading-relaxed text-muted-foreground">
          Every point in the file is marked as reconstructed — platforms will
          know the route was rebuilt, not recorded. You can come straight back
          to this review from the share view.
        </p>

        <AlertDialogFooter className="sm:flex-col sm:items-stretch">
          <AlertDialogAction
            className="h-10 gap-1.5 font-bold"
            data-testid="create-share-confirm"
            onClick={onConfirm}
          >
            <Download className="size-4" aria-hidden="true" />
            Download GPX &amp; open share card
          </AlertDialogAction>
          <AlertDialogCancel
            className="h-10 gap-1.5 border-[1.5px] font-semibold"
            data-testid="create-share-cancel"
          >
            Not now
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
