/**
 * SummaryPrintHeader — the print-only masthead of the repair-summary
 * sheet (§EE 19.2), the Phase 15 stats masthead's twin.
 *
 * Screen-invisible (`display:none` via the `.summary-print-only` rule
 * in globals.css); "Print repair summary" adds `printing-summary` to
 * <body> and the @media print block shows it: what the sheet is, which
 * file it covers, when it was made, and the privacy line. The batch
 * variant carries the queue's aggregate sentence instead of one file
 * name.
 *
 * Pure presentation.
 */

"use client";

export interface SummaryPrintHeaderProps {
  /** The sheet's subject (a file name or a queue label). */
  subject: string | null;
  /** Which sheet this is (the title under the app name). */
  variant?: "repair" | "batch";
}

export function SummaryPrintHeader({
  subject,
  variant = "repair",
}: SummaryPrintHeaderProps) {
  const generated = new Date();
  const dateLabel = generated.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <header
      className="summary-print-only"
      data-testid={
        variant === "batch" ? "batch-summary-print-header" : "summary-print-header"
      }
    >
      <div className="flex items-end justify-between gap-4 border-b-[2px] border-ink pb-2">
        <div>
          <p className="font-display text-[22px] font-bold leading-none tracking-[0.02em]">
            GPX REPAIR STUDIO
          </p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {variant === "batch"
              ? "Batch repair summary"
              : "Repair summary sheet"}
            {subject ? ` — ${subject}` : ""}
          </p>
        </div>
        <p className="text-right text-[11px] leading-snug text-muted-foreground">
          {dateLabel}
          <br />
          Computed locally in the browser — no data left this device.
        </p>
      </div>
    </header>
  );
}
