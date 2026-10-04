/**
 * RepairSummaryCard (Phase 19 — §EE 19.2): the repair summary, on
 * screen and on paper.
 *
 * Three blocks in one card, in the sheet's reading order:
 *   1. the stats DELTA TABLE (the compare card's own table, repeated
 *      here so the printed sheet carries the before/after numbers the
 *      plan asks for);
 *   2. the PROVENANCE TABLE — every modification kind with its count
 *      and its honest disclosure (the working-meta vocabulary, never a
 *      second computation) plus the applied-fix history;
 *   3. the TRACK SNAPSHOT — a static SVG of the outcome with the
 *      original ghosted underneath and the changed stretches in
 *      signal.
 *
 * "Print repair summary" drives the Phase 15 print flow's twin
 * (`printing-summary` on <body>); the masthead lives in the parent
 * print region (summary-print-header.tsx).
 *
 * Pure presentation of the compare binding.
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
import {
  formatCompareCell,
  type CompareBinding,
} from "@/hooks/use-compare";
import { cn } from "@/lib/utils";

const KIND_LABELS: Record<string, string> = {
  recorded: "Recorded",
  modified: "Modified",
  estimated: "Estimated",
};

function timeLabel(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export interface RepairSummaryCardProps {
  compare: CompareBinding;
}

export function RepairSummaryCard({ compare }: RepairSummaryCardProps) {
  const stats = compare.stats;
  const summary = compare.summary;
  if (!stats || !summary) return null;

  const hasAnyChange =
    summary.rows.length > 0 || summary.history.length > 0 || stats.hasChanges;

  return (
    <Card
      className="border-[1.5px] border-ink"
      data-testid="repair-summary-card"
    >
      <CardHeader>
        <h3 className="flex items-center gap-2 text-[15.5px] font-bold leading-tight">
          <span
            className="size-2 shrink-0 rounded-[1px] bg-signal"
            aria-hidden="true"
          />
          Repair summary
        </h3>
        <CardDescription>
          {hasAnyChange
            ? `Every modification, counted and disclosed — ${summary.totalChanges} change${summary.totalChanges === 1 ? "" : "s"} in total.`
            : "No modifications yet — the export will match the original recording."}
        </CardDescription>
        <CardAction>
          <button
            type="button"
            data-testid="print-summary-button"
            data-print-hide-on-print
            onClick={compare.printSummary}
            className="inline-flex items-center gap-1.5 rounded-[5px] border-[1.25px] border-ink/30 px-2 py-1 text-[12px] font-semibold text-ink transition-colors hover:border-signal hover:bg-signal/[0.08] focus-visible:outline-2"
          >
            <Printer className="size-3.5" aria-hidden="true" />
            Print
          </button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {/* 1 — the delta table (the sheet's numbers). */}
        <Table data-testid="repair-summary-delta">
          <TableHeader>
            <TableRow>
              <TableHead className="h-9 pl-3 text-left">Metric</TableHead>
              <TableHead className="h-9 px-2 text-right">Original</TableHead>
              <TableHead className="h-9 px-2 text-right">After</TableHead>
              <TableHead className="h-9 pl-2 pr-3 text-right">Change</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stats.rows.map((row) => {
              const cells = formatCompareCell(row);
              return (
                <TableRow key={row.id} data-testid={`summary-delta-${row.id}`}>
                  <TableCell className="py-2.5 pl-3">
                    <span className="font-medium">{row.label}</span>
                    {row.note && (
                      <span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">
                        {row.note}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="px-2 py-2.5 text-right tabular-nums text-muted-foreground">
                    {cells.original}
                  </TableCell>
                  <TableCell className="px-2 py-2.5 text-right font-semibold tabular-nums">
                    {cells.after}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "py-2.5 pl-2 pr-3 text-right font-semibold tabular-nums",
                      row.delta !== null && row.delta < 0
                        ? "text-signal-ink"
                        : "text-foreground",
                    )}
                  >
                    {cells.delta}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {/* 2 — the provenance table + history. */}
        {summary.rows.length > 0 ? (
          <div className="mt-4">
            <h4 className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-shade">
              Modifications
            </h4>
            <Table data-testid="repair-summary-table" className="mt-1.5">
              <TableHeader>
                <TableRow>
                  <TableHead className="h-9 pl-3 text-left">What</TableHead>
                  <TableHead className="h-9 px-2 text-right">Count</TableHead>
                  <TableHead className="h-9 pl-2 pr-3 text-left">
                    Disclosure
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.rows.map((row) => (
                  <TableRow
                    key={row.kind}
                    data-testid={`repair-summary-row-${row.kind}`}
                  >
                    <TableCell className="py-2.5 pl-3">
                      <span className="font-medium">{row.label}</span>
                      <span className="mt-0.5 block text-[11px] font-medium uppercase tracking-[0.12em] text-shade">
                        {KIND_LABELS[row.provenance] ?? "Modified"}
                      </span>
                    </TableCell>
                    <TableCell className="px-2 py-2.5 text-right font-semibold tabular-nums">
                      {row.count.toLocaleString()}
                    </TableCell>
                    <TableCell className="py-2.5 pl-2 pr-3 text-[12.5px] leading-snug text-muted-foreground">
                      {row.detail}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p
            className="mt-4 text-[13px] leading-relaxed text-muted-foreground"
            data-testid="repair-summary-empty"
          >
            No fixes, surgery, or repairs have been applied to this file
            yet. Anything you confirm will be counted here — and the
            original file on disk is never touched.
          </p>
        )}

        {summary.history.length > 0 && (
          <div className="mt-4">
            <h4 className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-shade">
              Applied fixes, in order
            </h4>
            <ol
              className="mt-1.5 grid gap-1 text-[12.5px] text-muted-foreground"
              data-testid="repair-summary-history"
            >
              {summary.history.map((entry, index) => (
                <li
                  key={`${entry.appliedAt}-${index}`}
                  className="flex items-baseline gap-2 border-b border-ink/[0.06] pb-1"
                  data-testid="repair-summary-history-row"
                >
                  <span className="w-14 shrink-0 font-mono text-[11px] tabular-nums text-shade">
                    {timeLabel(entry.appliedAt)}
                  </span>
                  <span className="text-ink">{entry.label}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* 3 — the track snapshot. */}
        <div className="mt-4">
          <h4 className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-shade">
            Track snapshot
          </h4>
          {compare.summarySvg !== null ? (
            <div
              role="img"
              aria-label="Track snapshot: the working copy in ink, the original ghosted underneath, changed stretches in orange"
              data-testid="repair-summary-snapshot"
              className="mt-1.5 overflow-hidden rounded-[10px] border-[1.5px] border-ink/15 bg-card [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: compare.summarySvg }}
            />
          ) : (
            <p className="mt-1.5 text-[12.5px] text-muted-foreground">
              No renderable track geometry.
            </p>
          )}
          <ul className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <li className="flex items-center gap-1.5">
              <span className="h-1 w-6 rounded-full bg-ink/70" aria-hidden="true" />
              Working copy
            </li>
            <li className="flex items-center gap-1.5">
              <span
                className="h-1 w-6 rounded-full"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(90deg,#75706B 0 5px,transparent 5px 9px)",
                }}
                aria-hidden="true"
              />
              Original (ghost)
            </li>
            <li className="flex items-center gap-1.5">
              <span
                className="h-1 w-6 rounded-full"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(90deg,#FC4C02 0 6px,transparent 6px 10px)",
                }}
                aria-hidden="true"
              />
              Changed / repaired
            </li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
