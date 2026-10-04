/**
 * BatchSummarySection (Phase 19 — §EE 19.2 "per-batch manifest
 * variant"): the batch queue's printable summary.
 *
 * On screen, a card with the aggregate sentence and the "Print batch
 * summary" intent; on paper (the `printing-batch-summary` body class),
 * the masthead + one row per file — parse status, its numbers, what
 * the applied edits changed, and a tiny track thumbnail — with failed
 * files listed honestly and nothing hidden. The rest of the batch
 * studio hides under print (the parent wraps it in data-print-hide).
 *
 * Pure presentation of the binding's pure-built rows.
 */

"use client";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Printer } from "lucide-react";
import { SummaryPrintHeader } from "@/components/compare/summary-print-header";
import type { BatchSessionBinding } from "@/hooks/use-batch-session";
import { formatDistanceMeters } from "@/lib/utils/format";

export interface BatchSummarySectionProps {
  session: BatchSessionBinding;
}

function statusWord(status: "parsed" | "failed" | "pending"): string {
  return status === "parsed" ? "parsed" : status === "failed" ? "failed" : "reading";
}

export function BatchSummarySection({ session }: BatchSummarySectionProps) {
  const summary = session.summary;
  const aggregate = summary.aggregate;

  const printBatchSummary = () => {
    if (
      typeof window === "undefined" ||
      typeof window.print !== "function"
    ) {
      return;
    }
    const cleanup = () => {
      document.body.classList.remove("printing-batch-summary");
      window.removeEventListener("afterprint", cleanup);
      if (backstop !== undefined) window.clearTimeout(backstop);
    };
    let backstop: number | undefined;
    if (typeof window.setTimeout === "function") {
      backstop = window.setTimeout(cleanup, 10_000);
    }
    window.addEventListener("afterprint", cleanup);
    document.body.classList.add("printing-batch-summary");
    window.print();
  };

  return (
    <Card
      className="border-[1.5px] border-ink"
      data-testid="batch-summary-card"
    >
      <CardHeader>
        <h3 className="flex items-center gap-2 text-[15.5px] font-bold leading-tight">
          <span
            className="size-2 shrink-0 rounded-[1px] bg-signal"
            aria-hidden="true"
          />
          Batch summary
        </h3>
        <CardDescription>
          {aggregate.parsed} parsed · {aggregate.changed} changed ·{" "}
          {aggregate.deletedPoints.toLocaleString()} points removed by
          fixes. The printable sheet lists every file with its own
          numbers and thumbnail.
        </CardDescription>
        <CardAction>
          <button
            type="button"
            data-testid="print-batch-summary-button"
            data-print-hide-on-print
            onClick={printBatchSummary}
            className="inline-flex items-center gap-1.5 rounded-[5px] border-[1.25px] border-ink/30 px-2 py-1 text-[12px] font-semibold text-ink transition-colors hover:border-signal hover:bg-signal/[0.08] focus-visible:outline-2"
          >
            <Printer className="size-3.5" aria-hidden="true" />
            Print
          </button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <SummaryPrintHeader
          subject={`${aggregate.total} file${aggregate.total === 1 ? "" : "s"}`}
          variant="batch"
        />
        <Table data-testid="batch-summary-table">
          <TableHeader>
            <TableRow>
              <TableHead className="h-9 pl-3 text-left">File</TableHead>
              <TableHead className="h-9 px-2 text-right">Points</TableHead>
              <TableHead className="h-9 px-2 text-right">Distance</TableHead>
              <TableHead className="h-9 px-2 text-right">Changes</TableHead>
              <TableHead className="h-9 pl-2 pr-3 text-left">Track</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {summary.rows.map((row) => {
              const changes: string[] = [];
              if (row.deletedPoints > 0) {
                changes.push(`${row.deletedPoints} removed`);
              }
              if (row.sortedSegments > 0) {
                changes.push(`${row.sortedSegments} sorted`);
              }
              if (row.smoothedElevations > 0) {
                changes.push(`${row.smoothedElevations} smoothed`);
              }
              return (
                <TableRow
                  key={row.fileName}
                  data-testid="batch-summary-row"
                >
                  <TableCell className="py-2.5 pl-3">
                    <span className="font-medium">{row.fileName}</span>
                    <span className="mt-0.5 block text-[11.5px] text-muted-foreground">
                      {statusWord(row.status)}
                      {row.presetName ? ` · ${row.presetName}` : ""}
                    </span>
                  </TableCell>
                  <TableCell className="px-2 py-2.5 text-right tabular-nums">
                    {row.pointCount === null
                      ? "—"
                      : row.pointCount.toLocaleString()}
                  </TableCell>
                  <TableCell className="px-2 py-2.5 text-right tabular-nums">
                    {row.distanceM === null
                      ? "—"
                      : formatDistanceMeters(row.distanceM)}
                  </TableCell>
                  <TableCell className="px-2 py-2.5 text-right text-[12.5px] tabular-nums text-muted-foreground">
                    {changes.length > 0 ? changes.join(" · ") : "none"}
                  </TableCell>
                  <TableCell className="w-[168px] py-2.5 pl-2 pr-3">
                    {row.snapshotSvg === null ? (
                      <span className="text-[12px] text-muted-foreground">—</span>
                    ) : (
                      <div
                        role="img"
                        aria-label={`Track thumbnail of ${row.fileName}`}
                        data-testid="batch-summary-thumb"
                        className="overflow-hidden rounded-[6px] border-[1.25px] border-ink/15 bg-card [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
                        dangerouslySetInnerHTML={{ __html: row.snapshotSvg }}
                      />
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
