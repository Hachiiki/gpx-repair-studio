/**
 * LibraryRecords (Phase 24.2/24.5) — the records tab: farthest /
 * longest / most gain over recorded data, the best-efforts ladder
 * (elapsed time, reconstructed stretches excluded, top three per
 * distance), and the opt-in Riegel race-time predictions with the
 * formula and its caveats stated in place.
 *
 * Pure presentation: the aggregated records arrive as props; nothing
 * leaves. Every rule the engines enforce is disclosed in the copy the
 * user can read without leaving the tab.
 */

"use client";

import { Fragment, useMemo, useState } from "react";
import { Medal, Sparkles, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useI18n } from "@/hooks/use-i18n";
import type {
  LadderRecord,
  LibraryEffortEntry,
  LifetimeRecords,
} from "@/hooks/use-library";
import { EFFORT_LADDER, riegelLadder } from "@/hooks/use-library";
import {
  formatDistanceForUnit,
  formatDurationMs,
  formatElevationMeters,
  formatDateTime,
  type PaceUnit,
} from "@/lib/utils/format";
import { cn } from "@/lib/utils";

/** The ladder's dict key for one distance. */
const LADDER_KEYS: ReadonlyMap<number, string> = new Map(
  EFFORT_LADDER.map(({ id, distanceM }) => [distanceM, `records.dist.${id}`]),
);

export interface LibraryRecordsProps {
  records: LifetimeRecords;
  paceUnit: PaceUnit;
}

export function LibraryRecords({ records, paceUnit }: LibraryRecordsProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set());
  const [predictionsOn, setPredictionsOn] = useState(false);
  const [seedDistanceM, setSeedDistanceM] = useState<number | null>(null);

  const covered = records.ladder.map((l) => l.distanceM);
  // The seed defaults to the LONGEST covered distance (predicting up
  // from a long effort is the standard use; the select lets you choose).
  const effectiveSeed =
    seedDistanceM !== null && covered.includes(seedDistanceM)
      ? seedDistanceM
      : (covered.length > 0 ? Math.max(...covered) : null);
  const seedEffort = useMemo(() => {
    if (effectiveSeed === null) return null;
    const ladderRow: LadderRecord | undefined = records.ladder.find(
      (l) => l.distanceM === effectiveSeed,
    );
    return ladderRow?.efforts[0] ?? null;
  }, [records.ladder, effectiveSeed]);
  const predictions = useMemo(
    () =>
      seedEffort === null
        ? []
        : riegelLadder({
            distanceM: seedEffort.distanceM,
            timeMs: seedEffort.timeMs,
          }),
    [seedEffort],
  );

  const tile = (
    testid: string,
    labelKey: string,
    icon: React.ReactNode,
    value: string | null,
    sessionName: string | null,
    when: number | null,
  ) => (
    <div
      data-testid={testid}
      className="grid gap-1 rounded-[10px] border-[1.25px] border-ink/15 px-3 py-2.5"
    >
      <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
        {icon}
        {t(labelKey)}
      </span>
      <span className="font-mono text-[15px] font-semibold tabular-nums">
        {value ?? "—"}
      </span>
      {value !== null && sessionName !== null && (
        <span className="truncate text-[11.5px] text-muted-foreground">
          {sessionName}
          {when !== null ? ` · ${formatDateTime(when)}` : ""}
        </span>
      )}
    </div>
  );

  return (
    <section
      data-testid="records-card"
      aria-label={t("records.title")}
      className="grid gap-3"
    >
      <div>
        <h3 className="flex items-center gap-2 text-[15.5px] font-bold leading-tight">
          <Medal className="size-4 text-signal" aria-hidden="true" />
          {t("records.title")}
        </h3>
        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
          {t("records.desc")}
        </p>
      </div>

      {records.eligibleCount === 0 ? (
        <p
          data-testid="records-empty"
          className="text-[12.5px] leading-relaxed text-muted-foreground"
        >
          {t("records.none")}
        </p>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-3">
            {tile(
              "records-farthest",
              "records.farthest",
              <TrendingUp className="size-3.5" aria-hidden="true" />,
              records.farthest === null
                ? null
                : formatDistanceForUnit(records.farthest.value, paceUnit),
              records.farthest?.sessionName ?? null,
              records.farthest?.activityStartMs ?? null,
            )}
            {tile(
              "records-longest",
              "records.longest",
              <Medal className="size-3.5" aria-hidden="true" />,
              records.longest === null
                ? null
                : formatDurationMs(records.longest.value),
              records.longest?.sessionName ?? null,
              records.longest?.activityStartMs ?? null,
            )}
            {tile(
              "records-mostgain",
              "records.mostGain",
              <TrendingUp className="size-3.5" aria-hidden="true" />,
              records.mostGain === null
                ? null
                : formatElevationMeters(records.mostGain.value),
              records.mostGain?.sessionName ?? null,
              records.mostGain?.activityStartMs ?? null,
            )}
          </div>

          {records.untimedCount > 0 && (
            <p className="text-[11.5px] leading-relaxed text-muted-foreground">
              {t("records.untimedNote", { count: records.untimedCount })}
            </p>
          )}

          <div className="grid gap-1.5">
            <h4 className="text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              {t("records.ladderTitle")}
            </h4>
            <div className="overflow-x-auto">
              <Table data-testid="records-ladder">
                <TableHeader>
                  <TableRow>
                    {[
                      "records.colDistance",
                      "records.colBest",
                      "records.colWhen",
                      "records.colSession",
                    ].map((key, i) => (
                      <TableHead
                        key={key}
                        scope="col"
                        className={cn(
                          "h-auto pb-2 text-[11.5px] font-semibold text-muted-foreground border-b-[1.5px] border-ink/25",
                          i === 0 ? "" : "text-right",
                        )}
                      >
                        {t(key)}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.ladder.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="py-3 text-[12px] text-muted-foreground"
                      >
                        {t("riegel.noSeed")}
                      </TableCell>
                    </TableRow>
                  )}
                  {records.ladder.map((row: LadderRecord) => {
                    const best = row.efforts[0]!;
                    const rest = row.efforts.slice(1);
                    const key = LADDER_KEYS.get(row.distanceM);
                    const isOpen = expanded.has(row.distanceM);
                    return (
                      <Fragment key={row.distanceM}>
                        <TableRow key={row.distanceM}>
                          <TableCell className="whitespace-nowrap text-[12.5px] font-semibold">
                            {key !== undefined ? t(key) : `${row.distanceM} m`}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right font-mono text-[12.5px] tabular-nums">
                            <span data-testid={`records-effort-${row.distanceM}`}>
                              {formatDurationMs(best.timeMs)}
                            </span>
                            {(best.startInterpolated || best.endInterpolated) && (
                              <span
                                className="ml-1.5 text-[10px] font-sans text-muted-foreground"
                                title={t("records.effort.interpolated")}
                              >
                                ≈
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right text-[11.5px] text-muted-foreground">
                            {best.activityStartMs === null
                              ? "—"
                              : formatDateTime(best.activityStartMs)}
                          </TableCell>
                          <TableCell className="max-w-[14rem] truncate text-right text-[11.5px]">
                            {rest.length > 0 ? (
                              <button
                                type="button"
                                aria-expanded={isOpen}
                                data-testid={`records-expand-${row.distanceM}`}
                                className="rounded-[5px] px-1.5 text-left font-semibold text-signal-ink underline decoration-dotted underline-offset-[3px] transition-colors hover:bg-signal/10 focus-visible:outline-2"
                                onClick={() =>
                                  setExpanded((current) => {
                                    const next = new Set(current);
                                    if (next.has(row.distanceM)) {
                                      next.delete(row.distanceM);
                                    } else {
                                      next.add(row.distanceM);
                                    }
                                    return next;
                                  })
                                }
                              >
                                {best.sessionName}
                              </button>
                            ) : (
                              <span className="text-muted-foreground">
                                {best.sessionName}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                        {isOpen &&
                          rest.map((effort, i) => (
                            <TableRow
                              key={`${row.distanceM}-rank-${i}`}
                              className="bg-ink/[0.02]"
                            >
                              <TableCell className="whitespace-nowrap text-[11.5px] text-muted-foreground">
                                {t("records.effort.rank", { rank: i + 2 })}
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-right font-mono text-[12px] tabular-nums text-muted-foreground">
                                {formatDurationMs(effort.timeMs)}
                                {(effort.startInterpolated ||
                                  effort.endInterpolated) && (
                                  <span
                                    className="ml-1.5 text-[10px] font-sans"
                                    title={t("records.effort.interpolated")}
                                  >
                                    ≈
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-right text-[11.5px] text-muted-foreground">
                                {effort.activityStartMs === null
                                  ? "—"
                                  : formatDateTime(effort.activityStartMs)}
                              </TableCell>
                              <TableCell className="max-w-[14rem] truncate text-right text-[11.5px] text-muted-foreground">
                                {effort.sessionName}
                              </TableCell>
                            </TableRow>
                          ))}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {t("records.rules")}
            </p>
          </div>

          {/* 24.5 — Riegel predictions, opt-in. */}
          <div
            data-testid="riegel-section"
            className="grid gap-2 rounded-[10px] border-[1.25px] border-ink/15 p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="flex items-center gap-1.5 text-[13px] font-bold">
                <Sparkles className="size-3.5 text-signal" aria-hidden="true" />
                {t("riegel.title")}
              </h4>
              <Button
                type="button"
                size="sm"
                variant="outline"
                data-testid="riegel-enable"
                aria-pressed={predictionsOn}
                onClick={() => setPredictionsOn((on) => !on)}
              >
                {t("riegel.enable")}
              </Button>
            </div>
            <p className="text-[11.5px] leading-relaxed text-muted-foreground">
              {t("riegel.desc")}
            </p>
            {predictionsOn && (
              <div className="grid gap-2">
                {seedEffort === null ? (
                  <p className="text-[12px] text-muted-foreground">
                    {t("riegel.noSeed")}
                  </p>
                ) : (
                  <>
                    <label
                      htmlFor="riegel-seed"
                      className="text-[12px] font-semibold"
                    >
                      {t("riegel.seedLabel")}
                    </label>
                    <select
                      id="riegel-seed"
                      data-testid="riegel-seed"
                      value={effectiveSeed ?? undefined}
                      onChange={(event) =>
                        setSeedDistanceM(Number(event.target.value))
                      }
                      className="h-9 w-fit rounded-[7px] border-[1.25px] border-ink/25 bg-card px-2 text-[12.5px] focus:border-signal focus:outline-none"
                    >
                      {records.ladder.map((row: LadderRecord) => {
                        const key = LADDER_KEYS.get(row.distanceM);
                        return (
                          <option key={row.distanceM} value={row.distanceM}>
                            {key !== undefined
                              ? t(key)
                              : `${row.distanceM} m`}
                          </option>
                        );
                      })}
                    </select>
                    <div className="overflow-x-auto">
                      <Table data-testid="riegel-table">
                        <TableHeader>
                          <TableRow>
                            {[
                              "riegel.colDistance",
                              "riegel.colPredicted",
                            ].map((key, i) => (
                              <TableHead
                                key={key}
                                scope="col"
                                className={cn(
                                  "h-auto pb-2 text-[11.5px] font-semibold text-muted-foreground border-b-[1.5px] border-ink/25",
                                  i === 0 ? "" : "text-right",
                                )}
                              >
                                {t(key)}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {predictions.map((p: { distanceM: number; timeMs: number }) => {
                            const key = LADDER_KEYS.get(p.distanceM);
                            return (
                              <TableRow key={p.distanceM}>
                                <TableCell className="whitespace-nowrap text-[12.5px] font-semibold">
                                  {key !== undefined
                                    ? t(key)
                                    : `${p.distanceM} m`}
                                </TableCell>
                                <TableCell
                                  className="whitespace-nowrap text-right font-mono text-[12.5px] tabular-nums"
                                  data-testid={`riegel-row-${p.distanceM}`}
                                >
                                  {formatDurationMs(p.timeMs)}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                )}
                <p className="font-mono text-[11px] text-shade">
                  {t("riegel.formula")}
                </p>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  {t("riegel.caveat")}
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
