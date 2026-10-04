/**
 * CompareCard (Phase 19 — §EE 19.1): the tools-column home of the
 * before/after compare.
 *
 * Three modes, one segmented control: OFF (the map as before), OVERLAY
 * (the original as a dashed ghost under the working copy, the edit
 * log's changed stretches in signal — the map legend gains its
 * entries), and SIDE BY SIDE (a dialog with two static snapshots at a
 * shared scale). Below the control, the stats delta table — original
 * vs outcome with the estimated/modified flags the plan asks for —
 * rendered from the compare binding's pure join, never a second
 * computation.
 *
 * Pure presentation: the binding (hooks/use-compare.ts) carries every
 * behavior and number.
 */

"use client";

import {
  Card,
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
import { Columns2, GitCompareArrows, Layers } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { CompareSideBySideDialog } from "@/components/compare/compare-side-by-side";
import {
  formatCompareCell,
  type CompareBinding,
  type CompareMode,
  type CompareProvenance,
  type CompareStatRow,
} from "@/hooks/use-compare";
import { cn } from "@/lib/utils";

/** The mode control's entries (labels resolved at render). */
const MODES: readonly {
  id: CompareMode;
  labelKey: string;
  icon: typeof Layers;
}[] = [
  { id: "off", labelKey: "compare.mode.off", icon: Layers },
  { id: "overlay", labelKey: "compare.mode.overlay", icon: GitCompareArrows },
  { id: "side-by-side", labelKey: "compare.mode.sideBySide", icon: Columns2 },
];

/** The delta table's flag chip — the badge vocabulary plus "Modified". */
const FLAG_STYLES: Record<
  CompareProvenance,
  { labelKey: string; square: string; className: string }
> = {
  recorded: {
    labelKey: "compare.flag.recorded",
    square: "bg-ink",
    className: "border-ink/35 bg-transparent text-ink",
  },
  modified: {
    labelKey: "compare.flag.modified",
    square: "bg-ink ring-[1.5px] ring-signal",
    className: "border-signal/50 bg-signal/[0.06] text-ink",
  },
  estimated: {
    labelKey: "compare.flag.estimated",
    square: "bg-signal",
    className: "border-signal bg-signal/10 text-ink",
  },
  mixed: {
    labelKey: "compare.flag.mixed",
    square:
      "bg-[linear-gradient(135deg,#FC4C02_0_50%,#222222_50%_100%)]",
    className: "border-ink bg-card text-ink",
  },
};

function DeltaFlag({ kind }: { kind: CompareProvenance }) {
  const { t } = useI18n();
  const style = FLAG_STYLES[kind];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-none",
        style.className,
      )}
      data-testid={`compare-flag-${kind}`}
    >
      <span
        className={cn("size-[7px] shrink-0 rounded-[1px]", style.square)}
        aria-hidden="true"
      />
      {t(style.labelKey)}
    </span>
  );
}

function DeltaRow({ row }: { row: CompareStatRow }) {
  const { t } = useI18n();
  const cells = formatCompareCell(row);
  return (
    <TableRow data-testid={`compare-row-${row.id}`}>
      <TableCell className="py-2.5 pl-3">
        <span className="font-medium">{t(row.labelKey)}</span>
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
      <TableCell className="w-[1%] py-2.5 pl-2 pr-3">
        <DeltaFlag kind={row.provenance} />
      </TableCell>
    </TableRow>
  );
}

export interface CompareCardProps {
  compare: CompareBinding;
}

export function CompareCard({ compare }: CompareCardProps) {
  const { t } = useI18n();
  const stats = compare.stats;
  if (!stats) return null;

  return (
    <>
      <Card data-testid="compare-card">
        <CardHeader>
          <h3 className="flex items-center gap-2 text-[15.5px] font-bold leading-tight">
            <span
              className="size-2 shrink-0 rounded-[1px] bg-signal"
              aria-hidden="true"
            />
            {t("compare.card.title")}
          </h3>
          <CardDescription>
            {stats.hasChanges
              ? t("compare.card.descChanged")
              : t("compare.card.descUnchanged")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* The mode control (a radiogroup of toggles). */}
          <div
            role="radiogroup"
            aria-label={t("compare.card.modeA11y")}
            data-testid="compare-mode"
            className="mb-3 grid grid-cols-3 gap-1 rounded-[8px] border-[1.5px] border-ink p-1"
          >
            {MODES.map((entry) => {
              const active = compare.mode === entry.id;
              return (
                <button
                  key={entry.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  data-testid={`compare-mode-${entry.id}`}
                  onClick={() => compare.setMode(entry.id)}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-[6px] px-1.5 py-1.5 text-[12px] font-semibold transition-colors focus-visible:outline-2",
                    active
                      ? "bg-signal/[0.12] text-ink"
                      : "text-muted-foreground hover:bg-ink/[0.05] hover:text-ink",
                  )}
                >
                  <entry.icon
                    className={cn(
                      "size-3.5 shrink-0",
                      active && "text-signal",
                    )}
                    aria-hidden="true"
                  />
                  <span className="truncate">{t(entry.labelKey)}</span>
                </button>
              );
            })}
          </div>
          {compare.mode === "overlay" && (
            <p
              className="mb-3 rounded-[8px] border-[1.25px] border-signal/40 bg-signal/[0.06] px-3 py-2 text-[12px] leading-relaxed text-muted-foreground"
              data-testid="compare-overlay-note"
            >
              {t("compare.card.overlayNote")}
              {!compare.hasChanges && (
                <>
                  {" "}
                  {t("compare.card.overlayNoteNoChanges")}
                </>
              )}
            </p>
          )}

          {/* The stats delta table. */}
          <Table data-testid="compare-table">
            <TableHeader>
              <TableRow>
                <TableHead className="h-9 pl-3 text-left">
                  {t("compare.table.metric")}
                </TableHead>
                <TableHead className="h-9 px-2 text-right">
                  {t("compare.table.original")}
                </TableHead>
                <TableHead className="h-9 px-2 text-right">
                  {t("compare.table.after")}
                </TableHead>
                <TableHead className="h-9 pl-2 pr-3 text-right">
                  {t("compare.table.change")}
                </TableHead>
                <TableHead className="h-9 pl-2 pr-3">
                  <span className="sr-only">{t("compare.table.provenance")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.rows.map((row) => (
                <DeltaRow key={row.id} row={row} />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* The side-by-side dialog (mode-driven). */}
      <CompareSideBySideDialog
        open={compare.mode === "side-by-side"}
        panels={compare.sideBySide}
        onClose={() => compare.setMode("off")}
      />
    </>
  );
}
