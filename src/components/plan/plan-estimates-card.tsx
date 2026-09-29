/**
 * PlanEstimatesCard — the "plan a route" section's estimates card
 * (Task 50): what the app reads back from the route the user draws.
 *
 * Three blocks, one card:
 *   - Route facts — the crow-flies start→finish distance and the path's
 *     detour factor over it (the classic planning comparison);
 *   - Elevation — the shared opt-in DEM lookup (ElevationControls), the
 *     same disclosure-first machinery every editor has;
 *   - Pace from a goal time — the user enters h/m/s and the app
 *     computes the pace and speed that time implies over the drawn
 *     distance, plus the even-pace split table (a PLAN, not a
 *     prediction — the badge says "Planned", never "Estimated-as-
 *     measured").
 *
 * The section's defining contract is visible here too: there is no
 * export intent and no share intent anywhere in this card — the
 * numbers are for reading, not for files.
 *
 * Pure presentation: values + bindings in, one intent out
 * (setPlannedTimeMs).
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ElevationControls } from "@/components/reconstruction/elevation-controls";
import { PaceUnitToggle } from "@/components/shared/pace-unit-toggle";
import { StatusBadge } from "@/components/shared/status-badge";
import { Eraser, TimerReset } from "lucide-react";
import type { ElevationControlsBinding } from "@/hooks/use-elevation";
import {
  plannedPaceMsPerUnit,
  plannedSplits,
  plannedSpeedKmh,
  plannedTail,
} from "@/hooks/use-plan-estimates";
import {
  durationFieldsToMs,
  formatDistanceForUnit,
  formatDurationMs,
  formatPaceMs,
  formatSpeedKmh,
  msToDurationFields,
  type PaceUnit,
} from "@/lib/utils/format";

export interface PlanEstimatesCardProps {
  /** The drawn route's rendered length in meters (null: nothing drawn). */
  distanceM: number | null;
  /** Straight-line start→finish distance (null: fewer than two points). */
  crowFliesM: number | null;
  /** Path length ÷ crow-flies length (null: not computable, e.g. loops). */
  detour: number | null;
  /** The shared elevation controls binding (opt-in DEM lookup). */
  elevation: ElevationControlsBinding;
  /** The entered goal time in ms, or null while none is usable. */
  plannedTimeMs: number | null;
  /** Replace the goal time (the pace calculator's single intent). */
  setPlannedTimeMs: (ms: number | null) => void;
  /** The app-wide distance/pace unit. */
  paceUnit: PaceUnit;
  onPaceUnitChange: (unit: PaceUnit) => void;
}

/**
 * The split table's compact row: "3 km — 18:30". The tail renders as
 * its own row ("last 230 m — ends at 32:35").
 */
function SplitRow({ label, value }: { label: string; value: string }) {
  return (
    <li
      className="flex items-baseline justify-between gap-2 rounded-[5px] px-2 py-1 text-[11.5px] tabular-nums odd:bg-ink/[0.03]"
      data-testid="plan-split-row"
    >
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </li>
  );
}

export function PlanEstimatesCard({
  distanceM,
  crowFliesM,
  detour,
  elevation,
  plannedTimeMs,
  setPlannedTimeMs,
  paceUnit,
  onPaceUnitChange,
}: PlanEstimatesCardProps) {
  // The h/m/s entry fields, kept as strings (the shared DurationFields
  // contract): "" reads as 0, invalid text blocks the update. This card
  // is the ONLY writer of the store's plannedTimeMs, so the fields stay
  // local — no prop sync loop, no effect (the §D-6 rule's "derive
  // during render" sibling: the store is downstream of the fields,
  // never the other way around). Clear is the one reset intent, handled
  // locally below.
  const [fields, setFields] = useState(() => {
    const split = msToDurationFields(plannedTimeMs ?? 0);
    return {
      hours: String(split.hours),
      minutes: String(split.minutes),
      seconds: String(split.seconds),
    };
  });

  const updateField = (part: "hours" | "minutes" | "seconds", raw: string) => {
    const next = { ...fields, [part]: raw };
    setFields(next);
    const ms = durationFieldsToMs(next);
    setPlannedTimeMs(ms);
  };

  const clearTime = () => {
    setFields({ hours: "0", minutes: "0", seconds: "0" });
    setPlannedTimeMs(null);
  };

  const hasRoute = distanceM !== null && distanceM > 0;
  const paceMsPerUnit = plannedPaceMsPerUnit(plannedTimeMs, distanceM ?? 0, paceUnit);
  const speedKmh = plannedSpeedKmh(plannedTimeMs, distanceM ?? 0);
  const splits = plannedSplits(plannedTimeMs, distanceM ?? 0, paceUnit);
  const tail = plannedTail(plannedTimeMs, distanceM ?? 0, paceUnit);

  // The splits' reveal (the Task-49 pattern): the first keystroke
  // that makes the pace computable scrolls the EVEN-SPLITS list
  // minimally into view ("nearest" — a no-op when already visible).
  // The headline pace sits just under the inputs being typed in, so it
  // is visible by construction; the splits below it would otherwise
  // stay buried under the tools column's fold on shorter viewports.
  // DOM-only (no state), guarded for jsdom; fires once per entry
  // session (the undefined→defined transition), never per keystroke.
  const splitsRef = useRef<HTMLDivElement | null>(null);
  const hasSplits = splits.length > 0;
  const hadSplits = useRef(hasSplits);
  useEffect(() => {
    if (!hasSplits) {
      hadSplits.current = false;
      return;
    }
    if (hadSplits.current) return;
    hadSplits.current = true;
    if (typeof document === "undefined") return;
    // Deferred past the typing burst: a smooth scroll started on the
    // first keystroke is CANCELLED by the next keystroke's DOM mutation
    // (the pace text re-renders mid-animation and Chromium abandons the
    // scroll). Waiting a beat lets the entry settle first.
    const timer = window.setTimeout(() => {
      splitsRef.current?.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [hasSplits]);

  const paceLine =
    !hasRoute
      ? "Draw a route on the map first — the pace needs a distance."
      : plannedTimeMs === null
        ? "Enter a time above to see the pace it implies."
        : plannedTimeMs <= 0
          ? "The time needs to be more than zero."
          : null;

  return (
    <Card
      className="border-[1.5px] border-ink"
      data-testid="plan-estimates-card"
    >
      <CardHeader>
        <h3 className="flex items-center gap-2 text-[15.5px] font-bold leading-tight">
          <TimerReset className="size-4 text-signal" aria-hidden="true" />
          Estimates
        </h3>
        <CardDescription>
          What the route implies — read-only, nothing is exported.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {/* Route facts: the crow-flies comparison. */}
        <div className="grid gap-1">
          <p className="text-xs font-bold tracking-[0.01em]">Route facts</p>
          <p
            className="text-[11.5px] leading-snug tabular-nums text-muted-foreground"
            data-testid="plan-crowflies"
          >
            {crowFliesM === null
              ? "Place at least two points for the start-to-finish line."
              : detour === null
                ? `Start to finish straight line: ${formatDistanceForUnit(crowFliesM, paceUnit)} — the route runs ${formatDistanceForUnit(distanceM ?? 0, paceUnit)}.`
                : `Start to finish straight line: ${formatDistanceForUnit(crowFliesM, paceUnit)} — the route winds to ${detour.toFixed(detour >= 10 ? 0 : 1)}× that, at ${formatDistanceForUnit(distanceM ?? 0, paceUnit)}.`}
          </p>
        </div>

        {/* Elevation: the shared opt-in DEM lookup. */}
        <ElevationControls elevation={elevation} />

        {/* Pace from a goal time. */}
        <div className="grid gap-2 border-t border-ink/10 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-bold tracking-[0.01em]">
              Pace from a time you enter
            </p>
            <PaceUnitToggle unit={paceUnit} onChange={onPaceUnitChange} />
          </div>
          <div className="flex flex-wrap items-end gap-2" role="group" aria-label="Goal time">
            {(
              [
                { key: "hours", label: "Hours" },
                { key: "minutes", label: "Minutes" },
                { key: "seconds", label: "Seconds" },
              ] as const
            ).map((part) => (
              <label
                key={part.key}
                className="grid w-[4.5rem] gap-1 text-[11px] font-semibold text-muted-foreground"
              >
                {part.label}
                <input
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  className="h-8 rounded-[5px] border-[1.25px] border-ink/25 bg-card px-2 text-xs font-normal tabular-nums transition-colors hover:border-ink/45 focus-visible:border-signal focus-visible:outline-none"
                  data-testid={`plan-time-${part.key}`}
                  aria-label={`Goal time ${part.label.toLowerCase()}`}
                  value={fields[part.key]}
                  onChange={(event) => updateField(part.key, event.target.value)}
                />
              </label>
            ))}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 gap-1.5"
              data-testid="plan-time-clear"
              onClick={clearTime}
              disabled={plannedTimeMs === null}
              title="Clear the entered time"
            >
              <Eraser className="size-3.5" aria-hidden="true" />
              Clear
            </Button>
          </div>

          <div
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1"
            data-testid="plan-pace-result"
          >
            <span className="font-display text-[26px] font-bold leading-none tabular-nums">
              {paceMsPerUnit === undefined
                ? "—"
                : `${formatPaceMs(paceMsPerUnit)} /${paceUnit}`}
            </span>
            <span className="text-[13px] font-semibold tabular-nums text-muted-foreground">
              {speedKmh === undefined ? "" : formatSpeedKmh(speedKmh)}
            </span>
            {paceMsPerUnit !== undefined && (
              <StatusBadge tone="neutral" data-testid="plan-pace-planned-badge">
                Planned
              </StatusBadge>
            )}
          </div>
          {paceLine && (
            <p
              className="text-[11.5px] leading-snug text-muted-foreground"
              data-testid="plan-pace-hint"
              role="status"
            >
              {paceLine}
            </p>
          )}

          {/* Even-pace splits: the "am I on pace" checkpoints. */}
          {splits.length > 0 && (
            <div
              className="grid gap-1.5"
              data-testid="plan-splits"
              ref={splitsRef}
            >
              <p className="text-[11px] font-medium text-muted-foreground">
                Even splits — where each whole {paceUnit === "km" ? "kilometer" : "mile"} lands:
              </p>
              <ScrollArea className="max-h-44 -mx-2">
                <ul className="grid gap-0.5 px-2">
                  {splits.map((split) => (
                    <SplitRow
                      key={split.unit}
                      label={`${split.unit} ${paceUnit}`}
                      value={formatDurationMs(split.elapsedMs)}
                    />
                  ))}
                  {tail && (
                    <SplitRow
                      label={`last ${formatDistanceForUnit(tail.distanceM, paceUnit)}`}
                      value={`ends at ${formatDurationMs(tail.elapsedMsAtEnd)}`}
                    />
                  )}
                </ul>
              </ScrollArea>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
