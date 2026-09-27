/**
 * ConsistencyNote — the time ≈ distance × pace cross-check, rendered
 * where the user can actually see it.
 *
 * The landing form unmounts the moment it submits, so the check's verdict
 * is computed in the create store at confirmation and the studio's cards
 * (guide + review) render it from there. Informational by contract: the
 * user's values are never overwritten and nothing is ever blocked — the
 * note explains WHY the numbers may disagree and reassures whose values
 * the generated route uses.
 *
 * Pure presentation: the {@link ConsistencyNotice} in, copy out.
 */

"use client";

import { Info } from "lucide-react";
import type { ConsistencyNotice } from "@/hooks/use-create-session";
import { formatDurationMs } from "@/lib/utils/format";

export interface ConsistencyNoteProps {
  notice: ConsistencyNotice;
  /** The duration the user actually entered (for the mismatch copy). */
  enteredDurationMs: number;
}

export function ConsistencyNote({
  notice,
  enteredDurationMs,
}: ConsistencyNoteProps) {
  return (
    <p
      className="flex items-start gap-2 rounded-md border border-signal/40 bg-signal/[0.06] px-3 py-2 text-xs leading-relaxed text-ink"
      data-testid="stats-consistency-notice"
      role="status"
    >
      <Info className="mt-0.5 size-3.5 shrink-0 text-signal" aria-hidden="true" />
      {notice.level === "rounding"
        ? "Your entered statistics differ slightly due to rounding — the route will be generated using your recorded values."
        : `Your time, distance, and pace don't quite agree — distance × pace works out to ${formatDurationMs(
            notice.impliedDurationMs,
          )}, you entered ${formatDurationMs(
            enteredDurationMs,
          )}. Check for typos; the route will be generated using your recorded values.`}
    </p>
  );
}
