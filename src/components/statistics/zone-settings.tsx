/**
 * ZoneSettings — the Phase 23 fitness-settings popover (§23.1/23.4 +
 * the calorie amendment): HR max + boundaries, FTP, the pace race
 * result, the stopped-time threshold, and the opt-in calorie weight.
 *
 * Edits commit on blur / Enter (the gap-threshold popover's rule: a
 * change re-runs analysis over the whole merge, so per-keystroke
 * commits would recompute mid-typing). Invalid drafts are discarded by
 * re-syncing from the store; guardrail failures (overlap, adjacent
 * gap, out-of-range) show their reason inline.
 *
 * Editing max HR re-derives the four boundaries at the default
 * fractions (disclosed in the hint) — the one clobber the model
 * allows, because a boundary set inconsistent with its own max is the
 * alternative.
 */

"use client";

import { useEffect, useId, useState } from "react";
import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/hooks/use-i18n";
import {
  type FitnessSettings,
  type PaceRaceResult,
  type ZoneGuardrailIssue,
  PACE_RACE_PRESETS,
  defaultHrBoundaries,
  validateFtp,
  validateHrBoundaries,
  validateMaxHr,
  validateRaceResult,
  validateStopSpeedMps,
  validateWeightKg,
} from "@/hooks/use-zones";

export interface ZoneSettingsProps {
  fitness: FitnessSettings;
  onFitnessChange: (patch: Partial<FitnessSettings>) => void;
  onReset: () => void;
}

interface NumberFieldProps {
  id: string;
  label: string;
  hint: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** Commit a valid value (already range-checked by the caller). */
  onCommit: (value: number) => void;
  /** The live guardrail verdict, when the caller has one. */
  issue?: ZoneGuardrailIssue | null;
}

const ISSUE_KEYS: Record<ZoneGuardrailIssue, string> = {
  "out-of-range": "zoneSettings.error.out-of-range",
  "not-ascending": "zoneSettings.error.not-ascending",
  "adjacent-gap": "zoneSettings.error.adjacent-gap",
};

function NumberField({
  id,
  label,
  hint,
  unit,
  value,
  min,
  max,
  step,
  onCommit,
  issue = null,
}: NumberFieldProps) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(String(value));

  // Re-sync when the store value changes externally (reset, persistence).
  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = () => {
    const parsed = Number(draft);
    if (
      draft !== "" &&
      Number.isFinite(parsed) &&
      parsed >= min &&
      parsed <= max &&
      parsed !== value
    ) {
      onCommit(parsed);
    } else {
      setDraft(String(value)); // discard invalid drafts
    }
  };

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit();
          }}
          className="h-8 tabular-nums"
        />
        <span className="w-10 shrink-0 text-xs text-muted-foreground">
          {unit}
        </span>
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p>
      {issue !== null && (
        <p
          data-testid="zone-settings-issue"
          className="text-[11px] leading-snug font-semibold text-signal-ink"
        >
          {t(ISSUE_KEYS[issue])}
        </p>
      )}
    </div>
  );
}

export function ZoneSettings({
  fitness,
  onFitnessChange,
  onReset,
}: ZoneSettingsProps) {
  const { t } = useI18n();
  const fieldId = useId();
  const [boundaryIssue, setBoundaryIssue] =
    useState<ZoneGuardrailIssue | null>(null);

  const race = fitness.pace.race;
  const raceHours = race ? Math.floor(race.timeMs / 3_600_000) : 0;
  const raceMinutes = race ? Math.floor((race.timeMs % 3_600_000) / 60_000) : 0;
  const raceSeconds = race ? Math.floor((race.timeMs % 60_000) / 1000) : 0;
  // Radix Select items cannot carry an empty value — "none" is the
  // sentinel for "no race result" (pace zones off).
  const [racePreset, setRacePreset] = useState<string>(
    race
      ? (PACE_RACE_PRESETS.find((p) => p.distanceM === race.distanceM)?.id ??
        "none")
      : "none",
  );
  // The h/m/s draft — committed on blur, never per keystroke. The
  // typing override derives AT RENDER (the repo's vertex-entry
  // pattern — no syncing effect): the draft shows only while it was
  // typed against the race's CURRENT time; an external change (a
  // commit, a reset, persistence) drops it and the canonical split
  // shows again.
  const [raceEdit, setRaceEdit] = useState<{
    base: number;
    h: number;
    m: number;
    s: number;
  } | null>(null);
  const raceTimeMs = race?.timeMs ?? 0;
  const live = raceEdit !== null && raceEdit.base === raceTimeMs;
  const hours = live && raceEdit !== null ? raceEdit.h : raceHours;
  const minutes = live && raceEdit !== null ? raceEdit.m : raceMinutes;
  const seconds = live && raceEdit !== null ? raceEdit.s : raceSeconds;

  const commitRaceTime = () => {
    if (racePreset === "none") return;
    const preset = PACE_RACE_PRESETS.find((p) => p.id === racePreset);
    if (preset === undefined) return;
    const timeMs = ((hours * 60 + minutes) * 60 + seconds) * 1000;
    if (timeMs <= 0) return; // nothing entered — nothing to derive yet
    const next: PaceRaceResult = { distanceM: preset.distanceM, timeMs };
    if (validateRaceResult(next) === null) {
      onFitnessChange({ pace: { race: next } });
    }
  };

  // A preset switch keeps the entered time; the distance follows the pick.
  const commitRace = (presetId: string) => {
    setRacePreset(presetId);
    if (presetId === "none") {
      onFitnessChange({ pace: { race: null } });
      return;
    }
    const preset = PACE_RACE_PRESETS.find((p) => p.id === presetId);
    if (preset === undefined) return;
    const timeMs = ((hours * 60 + minutes) * 60 + seconds) * 1000;
    if (timeMs <= 0) {
      // Nothing entered yet: park the distance, the time comes on blur.
      onFitnessChange({
        pace: { race: { distanceM: preset.distanceM, timeMs: 0 } },
      });
      return;
    }
    const next: PaceRaceResult = { distanceM: preset.distanceM, timeMs };
    if (validateRaceResult(next) === null) {
      onFitnessChange({ pace: { race: next } });
    }
  };

  const raceTimeField = (
    id: string,
    label: string,
    key: "h" | "m" | "s",
    max: number,
  ) => (
    <div className="grid gap-1">
      <Label htmlFor={id} className="text-[11px] text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        max={max}
        step={1}
        value={String(key === "h" ? hours : key === "m" ? minutes : seconds)}
        onChange={(event) => {
          const parsed = Number(event.target.value);
          const clamped =
            Number.isFinite(parsed) && parsed >= 0
              ? Math.min(max, Math.floor(parsed))
              : 0;
          setRaceEdit({
            base: raceTimeMs,
            h: key === "h" ? clamped : hours,
            m: key === "m" ? clamped : minutes,
            s: key === "s" ? clamped : seconds,
          });
        }}
        onBlur={commitRaceTime}
        className="h-8 tabular-nums"
      />
    </div>
  );

  const hrIssue = validateMaxHr(fitness.hr.maxHr);
  const ftpIssue = validateFtp(fitness.power.ftp);
  const stopIssue = validateStopSpeedMps(fitness.stopSpeedMps);
  const weightIssue =
    fitness.calories.weightKg !== null
      ? validateWeightKg(fitness.calories.weightKg)
      : null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-xs"
          data-testid="zone-settings-trigger"
        >
          <SlidersHorizontal className="size-3.5" aria-hidden="true" />
          {t("zoneSettings.openButton")}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        // Radix's available-height var clamps the sheet to the space
        // its side actually has — a mid-viewport anchor can never push
        // the bottom sections out of reach (the audit's finding).
        className="max-h-[var(--radix-popover-content-available-height)] w-80 overflow-y-auto"
        data-testid="zone-settings-popover"
      >
        <div className="grid gap-4">
          <p className="text-xs text-muted-foreground">
            {t("zoneSettings.note")}
          </p>

          {/* --- heart-rate zones --------------------------------------- */}
          <div className="grid gap-3">
            <p className="text-xs font-bold">{t("zoneSettings.hr.title")}</p>
            <NumberField
              id={`${fieldId}-maxhr`}
              label={t("zoneSettings.hr.maxLabel")}
              hint={t("zoneSettings.hr.maxHint")}
              unit="bpm"
              value={fitness.hr.maxHr}
              min={60}
              max={230}
              step={1}
              issue={hrIssue}
              onCommit={(maxHr) => {
                if (validateMaxHr(maxHr) !== null) return;
                // Editing max re-derives the boundaries (hint discloses).
                onFitnessChange({
                  hr: { maxHr, boundaries: defaultHrBoundaries(maxHr) },
                });
                setBoundaryIssue(null);
              }}
            />
            <div className="grid grid-cols-2 gap-2">
              {fitness.hr.boundaries.map((boundary, i) => (
                <NumberField
                  key={i}
                  id={`${fieldId}-hr-${i + 2}`}
                  label={`Z${i + 2}`}
                  hint=""
                  unit="bpm"
                  value={boundary}
                  min={1}
                  max={230}
                  step={1}
                  issue={boundaryIssue}
                  onCommit={(value) => {
                    const next = [...fitness.hr.boundaries] as number[];
                    next[i] = Math.round(value);
                    const issue = validateHrBoundaries(
                      next,
                      fitness.hr.maxHr,
                    );
                    setBoundaryIssue(issue);
                    if (issue === null) {
                      onFitnessChange({
                        hr: {
                          maxHr: fitness.hr.maxHr,
                          boundaries: [
                            next[0],
                            next[1],
                            next[2],
                            next[3],
                          ] as [
                            number,
                            number,
                            number,
                            number,
                          ],
                        },
                      });
                    }
                  }}
                />
              ))}
            </div>
            <p className="text-[11px] leading-snug text-muted-foreground">
              {t("zoneSettings.hr.boundariesHint")}
            </p>
          </div>

          {/* --- power zones -------------------------------------------- */}
          <div className="grid gap-3">
            <p className="text-xs font-bold">{t("zoneSettings.power.title")}</p>
            <NumberField
              id={`${fieldId}-ftp`}
              label={t("zoneSettings.power.ftpLabel")}
              hint={t("zoneSettings.power.ftpHint")}
              unit="W"
              value={fitness.power.ftp}
              min={20}
              max={500}
              step={5}
              issue={ftpIssue}
              onCommit={(ftp) => {
                if (validateFtp(ftp) === null) {
                  onFitnessChange({ power: { ftp } });
                }
              }}
            />
          </div>

          {/* --- pace zones --------------------------------------------- */}
          <div className="grid gap-3">
            <p className="text-xs font-bold">{t("zoneSettings.pace.title")}</p>
            <div className="grid gap-1.5">
              <Label
                htmlFor={`${fieldId}-race`}
                className="text-xs"
              >
                {t("zoneSettings.pace.raceLabel")}
              </Label>
              <Select value={racePreset} onValueChange={commitRace}>
                <SelectTrigger
                  id={`${fieldId}-race`}
                  data-testid="zone-race-distance"
                  className="h-8 w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" data-testid="zone-race-none">
                    {t("zones.pace.raceUnset")}
                  </SelectItem>
                  {PACE_RACE_PRESETS.map((preset) => (
                    <SelectItem
                      key={preset.id}
                      value={preset.id}
                      data-testid={`zone-race-${preset.id}`}
                    >
                      {t(preset.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] leading-snug text-muted-foreground">
                {t("zoneSettings.pace.raceHint")}
              </p>
            </div>
            {racePreset !== "none" && (
              <div className="grid grid-cols-3 gap-2" data-testid="zone-race-time">
                {raceTimeField(`${fieldId}-race-h`, "h", "h", 23)}
                {raceTimeField(`${fieldId}-race-m`, "m", "m", 59)}
                {raceTimeField(`${fieldId}-race-s`, "s", "s", 59)}
              </div>
            )}
          </div>

          {/* --- stopped-time threshold (23.4) -------------------------- */}
          <div className="grid gap-3">
            <p className="text-xs font-bold">{t("zoneSettings.stop.title")}</p>
            <NumberField
              id={`${fieldId}-stop`}
              label={t("zoneSettings.stop.label")}
              hint={t("zoneSettings.stop.hint")}
              unit="m/s"
              value={fitness.stopSpeedMps}
              min={0.1}
              max={5}
              step={0.1}
              issue={stopIssue}
              onCommit={(stopSpeedMps) => {
                if (validateStopSpeedMps(stopSpeedMps) === null) {
                  onFitnessChange({ stopSpeedMps });
                }
              }}
            />
          </div>

          {/* --- calories (the opt-in estimate) -------------------------- */}
          <div className="grid gap-3">
            <p className="text-xs font-bold">
              {t("zoneSettings.calories.title")}
            </p>
            <label className="grid gap-1.5">
              <span className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  data-testid="zone-calories-toggle"
                  checked={fitness.calories.enabled}
                  onChange={(event) =>
                    onFitnessChange({
                      calories: {
                        ...fitness.calories,
                        enabled: event.target.checked,
                      },
                    })
                  }
                  className="size-4 accent-[var(--signal)]"
                />
                {t("zoneSettings.calories.enableLabel")}
              </span>
              <span className="text-[11px] leading-snug text-muted-foreground">
                {t("zoneSettings.calories.enableHint")}
              </span>
            </label>
            {fitness.calories.enabled && (
              <NumberField
                id={`${fieldId}-weight`}
                label={t("zoneSettings.calories.weightLabel")}
                hint={
                  fitness.calories.weightKg === null
                    ? t("zoneSettings.calories.weightNeeded")
                    : t("zoneSettings.calories.weightHint")
                }
                unit="kg"
                value={fitness.calories.weightKg ?? 70}
                min={20}
                max={250}
                step={1}
                issue={weightIssue}
                onCommit={(weightKg) => {
                  if (validateWeightKg(weightKg) === null) {
                    onFitnessChange({
                      calories: { ...fitness.calories, weightKg },
                    });
                  }
                }}
              />
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            data-testid="zone-settings-reset"
            onClick={() => {
              setBoundaryIssue(null);
              setRacePreset("none");
              setRaceEdit(null);
              onReset();
            }}
          >
            <RotateCcw className="size-3.5" aria-hidden="true" />
            {t("zoneSettings.reset")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
