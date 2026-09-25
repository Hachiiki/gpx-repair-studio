/**
 * FileTimingCard — the file-level "no timing data" mode (§J-1 Case 3,
 * Phase 5).
 *
 * Rendered only when the loaded file carries no usable timestamps: the
 * user may enter an activity start time and/or a total duration once
 * per file. The entries feed overall pace immediately and anchor Case-3
 * gap interiors; the whole-activity distance-proportional spread of the
 * total is the Phase 7 export's job (stated honestly in the copy).
 *
 * Pure presentation: entries in (patch intent out), no parsing beyond
 * the shared field parser.
 */

"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Clock } from "lucide-react";
import {
  durationFieldsToMs,
  msToDurationFields,
} from "@/lib/utils/format";

export interface FileTimingCardProps {
  /** Current file-level entries (from the editor store). */
  fileTiming: { startMs: number | null; totalDurationMs: number | null };
  /** Patch intent (entries save immediately — no submit step). */
  setFileTiming: (patch: {
    startMs?: number | null;
    totalDurationMs?: number | null;
  }) => void;
}

/** epoch ms → the value format <input type="datetime-local"> expects. */
function toLocalInputValue(ms: number | null): string {
  if (ms === null) return "";
  const date = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const FIELDS = [
  { key: "hours", label: "h", testid: "file-total-hours" },
  { key: "minutes", label: "m", testid: "file-total-minutes" },
  { key: "seconds", label: "s", testid: "file-total-seconds" },
] as const;

export function FileTimingCard({ fileTiming, setFileTiming }: FileTimingCardProps) {
  const [start, setStart] = useState(() => toLocalInputValue(fileTiming.startMs));
  const [fields, setFields] = useState(() => {
    const prefill = fileTiming.totalDurationMs
      ? msToDurationFields(fileTiming.totalDurationMs)
      : { hours: 0, minutes: 0, seconds: 0 };
    return {
      hours: String(prefill.hours),
      minutes: String(prefill.minutes),
      seconds: String(prefill.seconds),
    };
  });

  // Store → inputs sync, adjusted during render per field (the
  // "derive from prop changes" pattern — no effects). Each part syncs
  // only when ITS committed value changes: the blur-commit normalizes
  // the duration fields, a new file resets both, and typing is never
  // disturbed (keystrokes never touch the store).
  const [prevStartMs, setPrevStartMs] = useState(fileTiming.startMs);
  if (fileTiming.startMs !== prevStartMs) {
    setPrevStartMs(fileTiming.startMs);
    setStart(toLocalInputValue(fileTiming.startMs));
  }
  const [prevTotalMs, setPrevTotalMs] = useState(fileTiming.totalDurationMs);
  if (fileTiming.totalDurationMs !== prevTotalMs) {
    setPrevTotalMs(fileTiming.totalDurationMs);
    const prefill = fileTiming.totalDurationMs
      ? msToDurationFields(fileTiming.totalDurationMs)
      : { hours: 0, minutes: 0, seconds: 0 };
    setFields({
      hours: String(prefill.hours),
      minutes: String(prefill.minutes),
      seconds: String(prefill.seconds),
    });
  }

  const parsedTotal = durationFieldsToMs(fields);

  return (
    <Card data-testid="file-timing-card">
      <CardHeader>
        <h3 className="flex items-center gap-2 leading-none font-semibold">
          <Clock className="size-4 text-muted-foreground" aria-hidden="true" />
          No timing data
        </h3>
        <CardDescription>
          This file has no usable timestamps. Enter what you know — every
          value derived from it is labeled estimated.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <label className="grid gap-1 text-xs font-medium">
          Activity start (optional)
          <input
            type="datetime-local"
            className="h-8 rounded-md border border-input bg-transparent px-2 text-xs font-normal"
            data-testid="file-start-input"
            value={start}
            onChange={(event) => {
              setStart(event.target.value);
              setFileTiming({
                startMs:
                  event.target.value === ""
                    ? null
                    : new Date(event.target.value).getTime(),
              });
            }}
          />
        </label>

        <div className="grid gap-1">
          <span className="text-xs font-medium">
            Total duration (optional)
          </span>
          <div
            className="flex items-center gap-1.5"
            onBlur={() => {
              // Blur-commit (the gap-threshold pattern): keystrokes never
              // fight the store→fields sync; the committed value then
              // normalizes back through msToDurationFields.
              if (parsedTotal !== null) {
                setFileTiming({ totalDurationMs: parsedTotal });
              }
            }}
          >
            {FIELDS.map((field) => (
              <input
                key={field.key}
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                aria-label={`Total duration ${field.label}`}
                data-testid={field.testid}
                className="h-8 w-14 rounded-md border border-input bg-transparent px-2 text-xs tabular-nums"
                value={fields[field.key]}
                onChange={(event) =>
                  setFields((current) => ({
                    ...current,
                    [field.key]: event.target.value,
                  }))
                }
              />
            ))}
          </div>
          {parsedTotal !== null && (
            <p className="text-[11px] text-muted-foreground">
              {parsedTotal === 0
                ? "No total duration entered."
                : `Entered: ${Math.floor(parsedTotal / 60000)} min.`}
            </p>
          )}
        </div>

        <p className="text-[11px] leading-snug text-muted-foreground">
          The start time anchors repairs that have no timestamps around
          them; the total drives the overall pace. Each repair&apos;s own
          duration is set in its editor. Exporting (a later release) will
          spread these times across the whole activity by distance.
        </p>
      </CardContent>
    </Card>
  );
}
