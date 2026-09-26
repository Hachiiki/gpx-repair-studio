/**
 * RecoveryGuideCard — the Gap Recovery section's wizard progress card
 * (Task 26).
 *
 * A compact, always-truthful progress strip: how many missing sections
 * were detected, how many are recovered, and what remains. The counts
 * arrive as props (derived in the composition root from the session and
 * the draw binding); this component renders them and points at the next
 * step — it owns no state and dispatches no intents beyond optional
 * scrolling to the details section.
 *
 * Pure presentation.
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Check, CircleDashed, PenLine, ScanSearch } from "lucide-react";

export interface RecoveryGuideCardProps {
  /** Missing GPS sections detected in the loaded activity. */
  detectedCount: number;
  /** Sections with a committed reconstruction (drawn, editor closed). */
  recoveredCount: number;
  /** A draw editor is currently open. */
  editorOpen: boolean;
}

export function RecoveryGuideCard({
  detectedCount,
  recoveredCount,
  editorOpen,
}: RecoveryGuideCardProps) {
  // "Done" means every DETECTED section is covered (Task 26) or, when
  // nothing was detected, at least one unmeasured section was drawn
  // (Task 28 — drawing without detection is this section's contract).
  const allRecovered =
    detectedCount > 0 ? recoveredCount >= detectedCount : recoveredCount > 0;

  return (
    <Card data-testid="recovery-guide-card">
      <CardHeader>
        <h3 className="leading-none font-semibold">Gap recovery</h3>
        <CardDescription>
          {detectedCount === 0 && recoveredCount === 0
            ? "No missing sections detected — you can still draw the route you lost below."
            : detectedCount === 0
              ? "Nothing was detected — your drawn sections carry the recovery."
              : allRecovered
                ? "Every detected section has a recovered route."
                : editorOpen
                  ? "Drawing — click the map to add the missing route."
                  : "Open a section below and draw where you actually went."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-2 text-sm" data-testid="recovery-guide-steps">
          <li className="flex items-center gap-2">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted">
              {detectedCount > 0 ? (
                <Check
                  className="size-3 text-emerald-600"
                  aria-hidden="true"
                />
              ) : (
                <ScanSearch
                  className="size-3 text-muted-foreground"
                  aria-hidden="true"
                />
              )}
            </span>
            <span className="text-muted-foreground">
              Detect missing sections —{" "}
              <span className="font-medium text-foreground tabular-nums">
                {detectedCount} found
              </span>
            </span>
          </li>
          <li className="flex items-center gap-2">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted">
              {allRecovered ? (
                <Check
                  className="size-3 text-emerald-600"
                  aria-hidden="true"
                />
              ) : editorOpen ? (
                <PenLine
                  className="size-3 text-emerald-600"
                  aria-hidden="true"
                />
              ) : (
                <CircleDashed
                  className="size-3 text-muted-foreground"
                  aria-hidden="true"
                />
              )}
            </span>
            <span className="text-muted-foreground">
              Draw the missing route —{" "}
              <span className="font-medium text-foreground tabular-nums">
                {detectedCount > 0
                  ? `${recoveredCount} of ${detectedCount} recovered`
                  : `${recoveredCount} drawn`}
              </span>
            </span>
          </li>
          <li className="flex items-center gap-2">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted">
              {allRecovered ? (
                <Check
                  className="size-3 text-emerald-600"
                  aria-hidden="true"
                />
              ) : (
                <CircleDashed
                  className="size-3 text-muted-foreground"
                  aria-hidden="true"
                />
              )}
            </span>
            <a
              href="#recovery-details"
              className="text-muted-foreground underline-offset-2 transition-colors hover:text-foreground focus-visible:outline-2"
            >
              Preview the completed route &amp; export
            </a>
          </li>
        </ol>
      </CardContent>
    </Card>
  );
}
