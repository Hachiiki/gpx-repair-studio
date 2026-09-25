/**
 * ExportCard — the tools-panel entry point of the export workflow
 * (docs/MASTER_PLAN.md §H-7/8, Phase 7).
 *
 * The last card in the repair column: a running summary of what a
 * download would contain (committed repairs, added distance, skipped and
 * open counts) and the "Review & export" action that opens the pre-export
 * dialog. Owns only the dialog's open state — everything else arrives as
 * the `GpxExportBinding` from `useGpxExport`.
 *
 * Pure presentation + local UI state; no data logic.
 */

"use client";

import { useState } from "react";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { ExportDialog } from "@/components/gpx/export-dialog";
import type { GpxExportBinding } from "@/hooks/use-gpx-export";
import { formatDistanceMeters } from "@/lib/utils/format";

export interface ExportCardProps {
  exporter: GpxExportBinding;
}

export function ExportCard({ exporter }: ExportCardProps) {
  const [open, setOpen] = useState(false);
  const summary = exporter.summary;
  if (!summary) return null;

  const hasRepairs = summary.repairCount > 0;

  return (
    <>
      <Card data-testid="export-card">
        <CardHeader>
          <h3 className="leading-none font-semibold">Export</h3>
          <CardDescription>
            {hasRepairs
              ? "Your committed repairs, ready to download with their provenance markers."
              : "Download the file as-is, or after adding repairs."}
          </CardDescription>
          <CardAction>
            <Button
              size="sm"
              className="gap-1.5"
              data-testid="open-export-button"
              onClick={() => setOpen(true)}
            >
              <Download className="size-3.5" aria-hidden="true" />
              Review &amp; export
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-1.5 text-sm" data-testid="export-card-stats">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">
                Repairs to include
              </dt>
              <dd className="tabular-nums">{summary.repairCount}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Distance added</dt>
              <dd className="tabular-nums">
                {formatDistanceMeters(summary.addedDistanceM)}
              </dd>
            </div>
            {summary.skippedCount > 0 && (
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Skipped gaps</dt>
                <dd className="tabular-nums">{summary.skippedCount}</dd>
              </div>
            )}
            {summary.openRepairCount > 0 && (
              <div className="flex items-center justify-between gap-3 text-muted-foreground">
                <dt>Open in editor (excluded)</dt>
                <dd className="tabular-nums">{summary.openRepairCount}</dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      <ExportDialog
        open={open}
        onOpenChange={setOpen}
        summary={summary}
        exportMode={exporter.exportMode}
        prettyPrint={exporter.prettyPrint}
        onExportModeChange={exporter.setExportMode}
        onPrettyPrintChange={exporter.setPrettyPrint}
        onDownload={exporter.download}
      />
    </>
  );
}
