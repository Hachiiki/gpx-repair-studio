/**
 * MergeDetailsCard — the merged activity's identity (Task 43).
 *
 * The one editable string the merged file carries — the combined
 * activity's name — plus the quick facts of the merge as it stands
 * (files, points, distance). The name commits on blur or Enter (the
 * same commit discipline as the threshold settings: never re-deriving
 * the merge per keystroke); the facts re-derive from the session's
 * merged view on every arrangement change.
 *
 * Pure presentation: local input state in, intents out.
 *
 * Task 43 — Merge tool.
 */

"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { formatDistanceMeters } from "@/lib/utils/format";

/** One label/value row of the merge facts. */
function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="shrink-0 text-[12.5px] text-muted-foreground">{label}</dt>
      <dd className="overflow-wrap-anywhere min-w-0 text-right text-[13px] font-semibold tabular-nums">
        {value}
      </dd>
    </div>
  );
}

export interface MergeDetailsCardProps {
  /** The combined activity's name (the store's current value). */
  combinedName: string;
  /** Name edit intent (commits on blur / Enter). */
  onNameChange: (name: string) => void;
  /** How many source files are in the current merge. */
  fileCount: number;
  /** Total recorded points across the merged files. */
  totalPoints: number;
  /** The merged route's recorded distance. */
  distanceM: number;
  /** Waypoints carried into the merge (hidden when none). */
  waypointCount: number;
}

export function MergeDetailsCard({
  combinedName,
  onNameChange,
  fileCount,
  totalPoints,
  distanceM,
  waypointCount,
}: MergeDetailsCardProps) {
  // Local field state; commits on blur/Enter (see header). Syncs when
  // the store's value changes from elsewhere (a reset).
  const [draft, setDraft] = useState(combinedName);
  useEffect(() => {
    setDraft(combinedName);
  }, [combinedName]);

  const commit = () => {
    if (draft !== combinedName) onNameChange(draft);
  };

  return (
    <Card data-testid="merge-details-card">
      <CardHeader>
        <h3 className="flex items-center gap-2 text-[15.5px] font-bold leading-tight">
          <span
            className="size-2 shrink-0 rounded-[1px] bg-signal"
            aria-hidden="true"
          />
          The combined activity
        </h3>
        <CardDescription>
          One track, one name — this is what Strava and other platforms
          display for the merged file.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="space-y-1.5">
          <label
            htmlFor="merge-activity-name"
            className="text-[12.5px] font-medium text-muted-foreground"
          >
            Activity name
          </label>
          <input
            id="merge-activity-name"
            type="text"
            value={draft}
            placeholder="e.g. Weekend double"
            maxLength={120}
            data-testid="merge-activity-name"
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commit();
                event.currentTarget.blur();
              }
            }}
            className="h-10 w-full rounded-[7px] border-[1.5px] border-ink/25 bg-card px-2.5 text-[14.5px] font-semibold transition-colors hover:border-ink/45 focus-visible:border-signal focus-visible:outline-none"
          />
          <p className="text-[11.5px] text-muted-foreground">
            Written to the file's metadata and its single track. Leave
            empty for an unnamed file, like a raw watch export.
          </p>
        </div>
        <dl className="divide-y divide-ink/10" data-testid="merge-facts">
          <FactRow label="Files merged" value={String(fileCount)} />
          <FactRow label="Recorded points" value={String(totalPoints)} />
          <FactRow label="Distance" value={formatDistanceMeters(distanceM)} />
          {waypointCount > 0 && (
            <FactRow label="Waypoints" value={String(waypointCount)} />
          )}
        </dl>
      </CardContent>
    </Card>
  );
}
