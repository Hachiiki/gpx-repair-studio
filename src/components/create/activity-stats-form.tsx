/**
 * ActivityStatsForm — Step 1 of the "create from activity stats"
 * workflow: what the watch DID record.
 *
 * Lives on the landing page (it replaces the upload zone under the
 * "Create from stats" tab — this workflow has no file to upload). The
 * user enters distance, average pace, total time, and when the activity
 * started; the values are validated and cross-checked (`time ≈ distance
 * × pace`) but never overwritten — a disagreement surfaces as a
 * non-blocking notice and the user continues with their own numbers.
 *
 * The entry fields speak the app's Field Plot input language (the same
 * vocabulary the manual-duration dialog established: 1.5 px ink/25
 * borders, card fill, centered semibold tabular numerals, clearly
 * separated fields) and the unit follows the app-wide pace unit
 * preference (km/mi — the shared segmented control).
 *
 * Pure presentation: local field state in, a validated
 * {@link ActivityStats} intent out. No stores, no domain imports (the
 * validation helpers arrive through the hooks facade).
 */

"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Sparkles, Watch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PaceUnitToggle } from "@/components/shared/pace-unit-toggle";
import { useI18n } from "@/hooks/use-i18n";
import { UNIT_WORDS } from "@/i18n/units";
import {
  validateStatsEntry,
  type ActivityStats,
  type StatsFieldErrors,
} from "@/hooks/use-create-session";
import {
  durationFieldsToMs,
  msToDurationFields,
  PACE_METERS_PER_UNIT,
  type PaceUnit,
} from "@/lib/utils/format";

export interface ActivityStatsFormProps {
  /** Confirmed statistics to prefill (returning from the studio). */
  initialStats?: ActivityStats | null;
  /** The app-wide distance/pace unit (the shared preference). */
  paceUnit: PaceUnit;
  onPaceUnitChange: (unit: PaceUnit) => void;
  /** Confirmed → enter the drawing phase. */
  onBegin: (stats: ActivityStats) => void;
}

/** One bare number field of the form (the Field Plot input language). */
function NumberField({
  id,
  value,
  onChange,
  placeholder,
  ariaLabel,
  suffix,
  min = 0,
  max,
  step,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number | string;
}) {
  return (
    <div className="relative">
      <input
        id={id}
        type="number"
        inputMode="decimal"
        value={value}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-[7px] border-[1.5px] border-ink/25 bg-card px-2 text-center text-[15px] font-semibold tabular-nums transition-colors hover:border-ink/45 focus-visible:border-signal focus-visible:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      {suffix && (
        <span
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11.5px] font-semibold text-muted-foreground"
          aria-hidden="true"
        >
          {suffix}
        </span>
      )}
    </div>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="text-xs text-destructive" role="alert">
      {message}
    </p>
  );
}

export function ActivityStatsForm({
  initialStats = null,
  paceUnit,
  onPaceUnitChange,
  onBegin,
}: ActivityStatsFormProps) {
  const { t, locale } = useI18n();
  // Prefill from a previous confirmation (the user returned to tweak) —
  // the entered values are the user's facts; they survive navigation.
  const prefill = useMemo(() => {
    if (!initialStats) return null;
    const metersPerUnit = PACE_METERS_PER_UNIT[paceUnit];
    const paceMsPerUnit =
      (initialStats.paceMsPerKm / PACE_METERS_PER_UNIT.km) * metersPerUnit;
    const paceSeconds = Math.round(paceMsPerUnit / 1000);
    const duration = msToDurationFields(initialStats.durationMs);
    const start = new Date(initialStats.startMs);
    const pad = (n: number) => String(n).padStart(2, "0");
    return {
      distance: String(
        Number((initialStats.distanceM / metersPerUnit).toFixed(2)),
      ),
      paceMinutes: String(Math.floor(paceSeconds / 60)),
      paceSeconds: String(paceSeconds % 60),
      hours: String(duration.hours),
      minutes: String(duration.minutes),
      seconds: String(duration.seconds),
      // datetime-local value (local time, minutes precision).
      start: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(
        start.getDate(),
      )}T${pad(start.getHours())}:${pad(start.getMinutes())}`,
    };
  }, [initialStats, paceUnit]);

  const [distance, setDistance] = useState(prefill?.distance ?? "");
  const [paceMinutes, setPaceMinutes] = useState(prefill?.paceMinutes ?? "");
  const [paceSeconds, setPaceSeconds] = useState(prefill?.paceSeconds ?? "");
  const [hours, setHours] = useState(prefill?.hours ?? "");
  const [minutes, setMinutes] = useState(prefill?.minutes ?? "");
  const [seconds, setSeconds] = useState(prefill?.seconds ?? "");
  const [start, setStart] = useState(prefill?.start ?? "");
  const [errors, setErrors] = useState<StatsFieldErrors>({});

  /*
   * Phase 12 — "Use example numbers": the sample for the no-file
   * workflow. 5 [unit] at 6:00 / [unit] = exactly 30:00 — the same
   * arithmetic holds in km AND mi, so the example is always internally
   * consistent with the cross-check (time ≈ distance × pace), whatever
   * the current unit is. The user's own values always win: this only
   * fills empty-looking fields on demand, never overwrites silently.
   */
  const fillExampleNumbers = () => {
    setDistance("5");
    setPaceMinutes("6");
    setPaceSeconds("0");
    setHours("0");
    setMinutes("30");
    setSeconds("0");
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    setStart(
      `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
        now.getDate(),
      )}T07:30`,
    );
    setErrors({});
  };

  const numberOrNull = (text: string): number | null => {
    const trimmed = text.trim();
    if (trimmed === "") return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const durationMs = durationFieldsToMs({
      hours: numberOrNull(hours) ?? 0,
      minutes: numberOrNull(minutes) ?? 0,
      seconds: numberOrNull(seconds) ?? 0,
    });
    // A datetime-local value is local wall time — parse it as such.
    const startMs = start.trim() !== "" ? new Date(start).getTime() : null;
    const result = validateStatsEntry(
      {
        distance: numberOrNull(distance),
        paceMinutes: numberOrNull(paceMinutes),
        paceSeconds: numberOrNull(paceSeconds),
        durationMs,
        startMs,
      },
      paceUnit,
    );
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    // The time ≈ distance × pace cross-check is computed in the store at
    // confirmation and rendered by the studio's cards — this form
    // unmounts the moment the intent fires, so a local notice would
    // never be seen. The user's values always stand (never overwritten).
    onBegin(result.stats);
  };

  // The distance unit word rides alongside the number — it comes from
  // the locale-aware units table (i18n/units), never the dictionary.
  const unitSuffix = UNIT_WORDS[locale][paceUnit];

  return (
    <form
      className="grid gap-4 rounded-[10px] border-[1.5px] border-ink bg-card p-[18px] text-left shadow-float"
      data-testid="activity-stats-form"
      aria-label={t("create.statsForm.title")}
      onSubmit={onSubmit}
      noValidate
    >
      <div className="grid gap-1">
        <h3 className="flex items-center gap-2 text-[15.5px] font-bold leading-tight">
          <Watch className="size-4 text-signal" aria-hidden="true" />
          {t("create.statsForm.title")}
        </h3>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          {t("create.statsForm.blurb")}
        </p>
        <button
          type="button"
          data-testid="stats-example"
          onClick={fillExampleNumbers}
          className="mt-0.5 inline-flex w-fit items-center gap-1 rounded-[5px] px-1.5 py-1 text-[12.5px] font-semibold text-signal-ink underline decoration-signal/40 underline-offset-[3px] transition-colors hover:bg-signal/[0.08] focus-visible:outline-2"
        >
          <Sparkles className="size-3.5" aria-hidden="true" />
          {t("create.statsForm.example")}
        </button>
      </div>

      {/* Unit preference — the app-wide km/mi segmented control. */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold text-muted-foreground">
          {t("create.statsForm.units")}
        </span>
        <PaceUnitToggle unit={paceUnit} onChange={onPaceUnitChange} />
      </div>

      <div className="grid gap-3.5">
        {/* Distance */}
        <div className="grid gap-1.5">
          <Label htmlFor="stats-distance" className="text-xs font-semibold">
            {t("create.statsForm.distance")}
          </Label>
          <NumberField
            id="stats-distance"
            value={distance}
            onChange={setDistance}
            placeholder="5.23"
            ariaLabel={t("create.statsForm.distanceA11y")}
            suffix={unitSuffix}
            step="0.01"
            max={9999}
          />
          <FieldError message={errors.distance} />
        </div>

        {/* Average pace — minutes : seconds per unit */}
        <div className="grid gap-1.5">
          <span className="text-xs font-semibold" id="stats-pace-label">
            {t("create.statsForm.pace")}{" "}
            <span className="font-normal text-muted-foreground">
              {t("create.statsForm.paceHint", { unit: unitSuffix })}
            </span>
          </span>
          <div
            className="grid grid-cols-2 gap-3.5"
            role="group"
            aria-labelledby="stats-pace-label"
          >
            <NumberField
              id="stats-pace-minutes"
              value={paceMinutes}
              onChange={setPaceMinutes}
              placeholder="6"
              ariaLabel={t("create.statsForm.paceMinutesA11y")}
            />
            <NumberField
              id="stats-pace-seconds"
              value={paceSeconds}
              onChange={setPaceSeconds}
              placeholder="14"
              ariaLabel={t("create.statsForm.paceSecondsA11y")}
              max={59}
            />
          </div>
          <FieldError message={errors.pace} />
        </div>

        {/* Total time — h : m : s (the manual-duration language) */}
        <div className="grid gap-1.5">
          <span className="text-xs font-semibold" id="stats-time-label">
            {t("create.statsForm.time")}{" "}
            <span className="font-normal text-muted-foreground">
              {t("create.statsForm.timeHint")}
            </span>
          </span>
          <div
            className="grid grid-cols-3 gap-3.5"
            role="group"
            aria-labelledby="stats-time-label"
          >
            <NumberField
              id="stats-hours"
              value={hours}
              onChange={setHours}
              placeholder="0"
              ariaLabel={t("create.statsForm.hoursA11y")}
            />
            <NumberField
              id="stats-minutes"
              value={minutes}
              onChange={setMinutes}
              placeholder="32"
              ariaLabel={t("create.statsForm.minutesA11y")}
              max={59}
            />
            <NumberField
              id="stats-seconds"
              value={seconds}
              onChange={setSeconds}
              placeholder="35"
              ariaLabel={t("create.statsForm.secondsA11y")}
              max={59}
            />
          </div>
          <FieldError message={errors.durationMs} />
        </div>

        {/* Start — when the activity began */}
        <div className="grid gap-1.5">
          <Label htmlFor="stats-start" className="text-xs font-semibold">
            {t("create.statsForm.start")}{" "}
            <span className="font-normal text-muted-foreground">
              {t("create.statsForm.startHint")}
            </span>
          </Label>
          <input
            id="stats-start"
            type="datetime-local"
            value={start}
            onChange={(event) => setStart(event.target.value)}
            className="h-10 w-full rounded-[7px] border-[1.5px] border-ink/25 bg-card px-2.5 text-[13.5px] font-medium tabular-nums transition-colors hover:border-ink/45 focus-visible:border-signal focus-visible:outline-none"
          />
          <FieldError message={errors.start} />
        </div>
      </div>

      <Button
        type="submit"
        className="h-11 w-full text-[15px] font-bold"
        data-testid="begin-drawing-button"
      >
        {t("create.statsForm.begin")}
        <ArrowRight className="size-4" aria-hidden="true" />
      </Button>

      <p className="text-center text-[11.5px] text-muted-foreground">
        {t("create.statsForm.noFile")}
      </p>
    </form>
  );
}
