/**
 * StatsPrintHeader — the print-only masthead of the stats sheet
 * (§EE 15.4).
 *
 * Screen-invisible (`display:none` via the `.stats-print-only` rule in
 * globals.css); when "Print stats" adds `printing-stats` to <body>, the
 * @media print block shows it: what the sheet is, which file it came
 * from, when it was made, and the app's privacy line — the numbers on
 * the sheet carry their provenance badges, the masthead carries the
 * project's.
 *
 * Pure presentation.
 */

"use client";

export interface StatsPrintHeaderProps {
  fileName: string | null;
}

export function StatsPrintHeader({ fileName }: StatsPrintHeaderProps) {
  const generated = new Date();
  const dateLabel = generated.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <header className="stats-print-only" data-testid="stats-print-header">
      <div className="flex items-end justify-between gap-4 border-b-[2px] border-ink pb-2">
        <div>
          <p className="font-display text-[22px] font-bold leading-none tracking-[0.02em]">
            GPX REPAIR STUDIO
          </p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Activity statistics sheet
            {fileName ? ` — ${fileName}` : ""}
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
