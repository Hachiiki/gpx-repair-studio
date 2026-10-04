/**
 * HelpDialog (Phase 12) — the "Shortcuts & help" overlay.
 *
 * Opened by the footer's "Shortcuts & help" button and the "?" key
 * (the listener lives in AppShell, which owns this dialog's state —
 * the same store-driven pattern as the InfoDialog). Single pane, no
 * tabs: the cheat sheet plus the tool guide (help-content.tsx).
 *
 * The Dialog primitive handles focus trapping and focus return on
 * close (Esc / X / backdrop), so the "?" key's invoker gets focus
 * back exactly like the footer button does.
 */

"use client";

import { Keyboard } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { HelpContent } from "@/components/layout/help-content";
import type { ToolTourId } from "@/lib/storage/tour-flag";

export interface HelpDialogProps {
  /** Whether the dialog is open. */
  open: boolean;
  /** Close (Esc, X, or a click on the backdrop). */
  onClose: () => void;
  /**
   * Phase 19 — replay a tool's guided walkthrough (closes the help
   * dialog first: one dialog at a time, the "?"-key rule's
   * discipline).
   */
  onStartTour?: (id: ToolTourId) => void;
}

export function HelpDialog({ open, onClose, onStartTour }: HelpDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        data-testid="help-dialog"
        className="gap-0 overflow-hidden p-0 sm:max-w-lg"
      >
        <div className="border-b-[1.5px] border-ink pl-5 pr-12 pt-4">
          <DialogTitle className="flex items-center gap-2 text-left text-[17px] font-bold tracking-tight">
            <Keyboard className="size-4 text-signal" aria-hidden="true" />
            Shortcuts &amp; help
          </DialogTitle>
          <DialogDescription className="mt-0.5 pb-3 text-left text-[13px] text-muted-foreground">
            Every keyboard shortcut in the app, and where to find each tool.
            Press <span className="font-mono font-semibold">?</span> anytime
            to reopen this.
          </DialogDescription>
        </div>
        <div className="max-h-[min(70vh,640px)] overflow-y-auto p-5">
          <HelpContent onStartTour={onStartTour} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
