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
          <h3 className="flex items-center gap-2 text-[15.5px] font-bold leading-tight">
          <span
            className="size-2 shrink-0 rounded-[1px] bg-signal"
            aria-hidden="true"
          />
          Export
        </h3>
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
          <dl className="grid text-[13px]" data-testid="export-card-stats">
            <div className="flex items-center justify-between gap-3 border-b border-ink/[0.08] py-2">
              <dt className="text-muted-foreground">
                Repairs to include
              </dt>
              <dd className="text-[13.5px] font-semibold tabular-nums">{summary.repairCount}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-ink/[0.08] py-2">
              <dt className="text-muted-foreground">Distance added</dt>
              <dd className="text-[13.5px] font-semibold tabular-nums">
                {formatDistanceMeters(summary.addedDistanceM)}
              </dd>
            </div>
            {summary.skippedCount > 0 && (
              <div className="flex items-center justify-between gap-3 border-b border-ink/[0.08] py-2">
                <dt className="text-muted-foreground">Skipped gaps</dt>
                <dd className="text-[13.5px] font-semibold tabular-nums">{summary.skippedCount}</dd>
              </div>
            )}
            {summary.openRepairCount > 0 && (
              <div className="flex items-center justify-between gap-3 py-2 text-muted-foreground">
                <dt>Open in editor (excluded)</dt>
                <dd className="text-[13.5px] font-semibold tabular-nums">{summary.openRepairCount}</dd>
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
        exportFormat={exporter.exportFormat}
        onExportModeChange={exporter.setExportMode}
        onPrettyPrintChange={exporter.setPrettyPrint}
        onExportFormatChange={exporter.setExportFormat}
        onDownload={exporter.download}
      />
    </>
  );
}
