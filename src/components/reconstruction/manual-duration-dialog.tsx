/**
 * ManualDurationDialog — the §J-1 manual-duration entry (Phase 5).
 *
 * One dialog, three number fields (h / m / s), the shared field parser
 * (lib/utils/format.durationFieldsToMs — the same one the file-level
 * card uses), and the honesty copy baked into the description: a manual
 * duration only ever affects the gap's interior; recorded timestamps
 * are never rewritten.
 *
 * Pure presentation: props in (duration intent out). Validation is the
 * parser's; the Save button disables on invalid input with the reason
 * shown inline.
 */

"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  durationFieldsToMs,
  msToDurationFields,
} from "@/lib/utils/format";

export interface ManualDurationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Prefill from an existing manual strategy (ms), when editing. */
  initialDurationMs?: number;
  /** What the entered duration spans (for honest copy). */
  context: "gap" | "file-total";
  /** Called with the parsed duration in ms on Save. */
  onSave: (durationMs: number) => void;
}

const FIELDS = [
  { key: "hours", label: "Hours", testid: "duration-hours" },
  { key: "minutes", label: "Minutes", testid: "duration-minutes" },
  { key: "seconds", label: "Seconds", testid: "duration-seconds" },
] as const;

export function ManualDurationDialog({
  open,
  onOpenChange,
  initialDurationMs,
  context,
  onSave,
}: ManualDurationDialogProps) {
  const [fields, setFields] = useState({ hours: "", minutes: "", seconds: "" });

  // Prefill on each open transition — state adjusted during render (the
  // "derive from prop changes" pattern; no effect, so no
  // setState-in-effect). Closed → open carries the current strategy's
  // duration (or zeros); staying open never disturbs typing.
  const [wasOpen, setWasOpen] = useState(false);
  if (open && !wasOpen) {
    setWasOpen(true);
    const prefill = initialDurationMs
      ? msToDurationFields(initialDurationMs)
      : { hours: 0, minutes: 0, seconds: 0 };
    setFields({
      hours: String(prefill.hours),
      minutes: String(prefill.minutes),
      seconds: String(prefill.seconds),
    });
  } else if (!open && wasOpen) {
    setWasOpen(false);
  }

  const parsed = durationFieldsToMs(fields);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="manual-duration-dialog">
        <DialogHeader>
          <DialogTitle>
            {context === "gap" ? "How long was the missing stretch?" : "Total activity duration"}
          </DialogTitle>
          <DialogDescription>
            {context === "gap"
              ? "The repair's interior timestamps will span exactly this duration — recorded timestamps are never changed."
              : "Used for overall pace, and later for spreading timestamps over the whole activity when exporting."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3">
          {FIELDS.map((field) => (
            <label key={field.key} className="grid gap-1 text-sm font-medium">
              {field.label}
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                className="h-9 rounded-md border border-input bg-transparent px-2 text-sm font-normal tabular-nums"
                data-testid={field.testid}
                aria-label={field.label}
                value={fields[field.key]}
                onChange={(event) =>
                  setFields((current) => ({
                    ...current,
                    [field.key]: event.target.value,
                  }))
                }
              />
            </label>
          ))}
        </div>

        {parsed === null && (
          <p
            className="text-sm text-destructive"
            data-testid="duration-error"
            role="alert"
          >
            Enter numbers of 0 or more in each field.
          </p>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            data-testid="cancel-duration-button"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            data-testid="save-duration-button"
            disabled={parsed === null}
            onClick={() => {
              if (parsed === null) return;
              onSave(parsed);
              onOpenChange(false);
            }}
          >
            Save duration
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
