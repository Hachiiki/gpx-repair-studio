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
import { useI18n, type TranslatorArg } from "@/hooks/use-i18n";
import { SummaryPrintHeader } from "@/components/compare/summary-print-header";
import type { BatchSessionBinding } from "@/hooks/use-batch-session";
import { formatDistanceMeters } from "@/lib/utils/format";

export interface BatchSummarySectionProps {
  session: BatchSessionBinding;
}

function statusWord(
  t: TranslatorArg,
  status: "parsed" | "failed" | "pending",
): string {
  return status === "parsed"
    ? t("compare.batch.statusParsed")
    : status === "failed"
      ? t("compare.batch.statusFailed")
      : t("compare.batch.statusReading");
}

export function BatchSummarySection({ session }: BatchSummarySectionProps) {
  const { t } = useI18n();
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
          {t("compare.batch.title")}
        </h3>
        <CardDescription>
          {t("compare.batch.desc", {
            parsed: aggregate.parsed,
            changed: aggregate.changed,
            points: aggregate.deletedPoints.toLocaleString(),
          })}
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
            {t("compare.batch.print")}
          </button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <SummaryPrintHeader
          subject={t(
            aggregate.total === 1
              ? "compare.batch.subject.one"
              : "compare.batch.subject.many",
            { count: aggregate.total },
          )}
          variant="batch"
        />
        <Table data-testid="batch-summary-table">
          <TableHeader>
            <TableRow>
              <TableHead className="h-9 pl-3 text-left">
                {t("compare.batch.colFile")}
              </TableHead>
              <TableHead className="h-9 px-2 text-right">
                {t("compare.batch.colPoints")}
              </TableHead>
              <TableHead className="h-9 px-2 text-right">
                {t("compare.batch.colDistance")}
              </TableHead>
              <TableHead className="h-9 px-2 text-right">
                {t("compare.batch.colChanges")}
              </TableHead>
              <TableHead className="h-9 pl-2 pr-3 text-left">
                {t("compare.batch.colTrack")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {summary.rows.map((row) => {
              const changes: string[] = [];
              if (row.deletedPoints > 0) {
                changes.push(
                  t("compare.batch.changeRemoved", { count: row.deletedPoints }),
                );
              }
              if (row.sortedSegments > 0) {
                changes.push(
                  t("compare.batch.changeSorted", { count: row.sortedSegments }),
                );
              }
              if (row.smoothedElevations > 0) {
                changes.push(
                  t("compare.batch.changeSmoothed", {
                    count: row.smoothedElevations,
                  }),
                );
              }
              return (
                <TableRow
                  key={row.fileName}
                  data-testid="batch-summary-row"
                >
                  <TableCell className="py-2.5 pl-3">
                    <span className="font-medium">{row.fileName}</span>
                    <span className="mt-0.5 block text-[11.5px] text-muted-foreground">
                      {statusWord(t, row.status)}
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
                    {changes.length > 0
                      ? changes.join(" · ")
                      : t("compare.batch.noChanges")}
                  </TableCell>
                  <TableCell className="w-[168px] py-2.5 pl-2 pr-3">
                    {row.snapshotSvg === null ? (
                      <span className="text-[12px] text-muted-foreground">—</span>
                    ) : (
                      <div
                        role="img"
                        aria-label={t("compare.batch.thumbA11y", {
                          fileName: row.fileName,
                        })}
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
