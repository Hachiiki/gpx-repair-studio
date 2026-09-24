/**
 * GapThresholdSettings — the gap-detection threshold controls
 * (Phase 2 scope: "gap-threshold settings"; §H-4 thresholds).
 *
 * Edits commit on blur / Enter (not per keystroke): a threshold change
 * re-runs detection over the whole model, and per-keystroke commits on a
 * 100k-point file would recompute dozens of times mid-typing. Invalid
 * drafts are discarded by re-syncing from the store.
 *
 * Wired to the persisted ui store via the session hook's props.
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
import type { GapThresholds } from "@/hooks/use-gpx-session";

export interface GapThresholdSettingsProps {
  thresholds: GapThresholds;
  onThresholdsChange: (patch: Partial<GapThresholds>) => void;
  onReset: () => void;
}

interface ThresholdFieldProps {
  id: string;
  label: string;
  /** Hint shown under the label. */
  hint: string;
  unit: string;
  /** Current store value, already in display units. */
  value: number;
  min: number;
  step: number;
  /** Commit a valid display-unit value. */
  onCommit: (value: number) => void;
}

function ThresholdField({
  id,
  label,
  hint,
  unit,
  value,
  min,
  step,
  onCommit,
}: ThresholdFieldProps) {
  const [draft, setDraft] = useState(String(value));

  // Re-sync when the store value changes externally (reset, persistence).
  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = () => {
    const parsed = Number(draft);
    if (draft !== "" && Number.isFinite(parsed) && parsed >= min) {
      if (parsed !== value) onCommit(parsed);
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
    </div>
  );
}

export function GapThresholdSettings({
  thresholds,
  onThresholdsChange,
  onReset,
}: GapThresholdSettingsProps) {
  const fieldId = useId();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
          <SlidersHorizontal className="size-3.5" aria-hidden="true" />
          Detection settings
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <div className="grid gap-4">
          <p className="text-xs text-muted-foreground">
            Changes re-run gap detection on the original data. The file
            itself is never modified.
          </p>
          <ThresholdField
            id={`${fieldId}-time`}
            label="Time gap threshold"
            hint="Timestamp jumps longer than this count as gaps."
            unit="s"
            value={thresholds.timeGapMs / 1000}
            min={0}
            step={10}
            onCommit={(seconds) =>
              onThresholdsChange({ timeGapMs: Math.round(seconds * 1000) })
            }
          />
          <ThresholdField
            id={`${fieldId}-speed`}
            label="Speed anomaly threshold"
            hint="Legs implying a straight-line speed above this count as gaps."
            unit="km/h"
            value={thresholds.speedAnomalyKmh}
            min={0.5}
            step={1}
            onCommit={(kmh) => onThresholdsChange({ speedAnomalyKmh: kmh })}
          />
          <ThresholdField
            id={`${fieldId}-guard`}
            label="Short-leg guard"
            hint="Legs with a time delta at or below this are immune to the speed check."
            unit="s"
            value={thresholds.speedDtGuardMs / 1000}
            min={0}
            step={1}
            onCommit={(seconds) =>
              onThresholdsChange({ speedDtGuardMs: Math.round(seconds * 1000) })
            }
          />
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={onReset}
          >
            <RotateCcw className="size-3.5" aria-hidden="true" />
            Reset to defaults
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
