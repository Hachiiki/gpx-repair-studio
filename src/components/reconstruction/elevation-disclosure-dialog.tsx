/**
 * ElevationDisclosureDialog — the FR-6.5 privacy gate (Phase 6).
 *
 * Nothing is sent until this dialog is confirmed. It states, in plain
 * language and exact numbers: WHICH points leave (reconstructed points
 * only, never the file, never the recorded route), HOW MANY (after the
 * per-gap cap, with the unsampled total when the cap applied), WHERE
 * they go (the provider's host), and how many requests that makes at
 * the provider's one-per-second limit.
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
  const sampled = sentPoints < totalPoints;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="elevation-disclosure-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MountainSnow className="size-4 text-emerald-600" aria-hidden="true" />
            Estimate elevation from {providerName}?
          </DialogTitle>
          <DialogDescription>
            Elevation is looked up from a terrain database, so some data
            has to leave this browser. Here is exactly what leaves:
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 text-sm" data-testid="elevation-disclosure-body">
          <p>
            <span className="font-medium">
              {sentPoints.toLocaleString("en-US")} coordinate
              {sentPoints === 1 ? "" : "s"}
            </span>{" "}
            of your reconstructed points
            {sampled ? (
              <>
                {" "}
                (sampled from {totalPoints.toLocaleString("en-US")} — the
                rest is interpolated from these)
              </>
            ) : (
              " (every point you drew)"
            )}{" "}
            will be sent in {requestCount} request
            {requestCount === 1 ? "" : "s"} to{" "}
            <span className="font-medium">{providerName}</span>.
          </p>
          <p className="text-muted-foreground">{privacyNote}</p>
          <p className="text-muted-foreground">
            The result is labeled <span className="font-medium">estimated</span>{" "}
            everywhere it appears — statistics, the profile chart, and the
            exported file&apos;s provenance markers. Recorded elevation in
            your file is never modified.
          </p>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            data-testid="elevation-disclosure-cancel"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            data-testid="elevation-disclosure-confirm"
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            Send {sentPoints.toLocaleString("en-US")} point
            {sentPoints === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
