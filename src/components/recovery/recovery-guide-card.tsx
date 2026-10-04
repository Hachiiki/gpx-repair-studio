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
import { useI18n } from "@/hooks/use-i18n";

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
  const { t } = useI18n();
  // "Done" means every DETECTED section is covered (Task 26) or, when
  // nothing was detected, at least one unmeasured section was drawn
  // (Task 28 — drawing without detection is this section's contract).
  const allRecovered =
    detectedCount > 0 ? recoveredCount >= detectedCount : recoveredCount > 0;

  return (
    <Card data-testid="recovery-guide-card">
      <CardHeader>
        <h3 className="flex items-center gap-2 text-[15.5px] font-bold leading-tight">
          <span
            className="size-2 shrink-0 rounded-[1px] bg-signal"
            aria-hidden="true"
          />
          {t("recovery.guide.title")}
        </h3>
        <CardDescription>
          {detectedCount === 0 && recoveredCount === 0
            ? t("recovery.guide.status.empty")
            : detectedCount === 0
              ? t("recovery.guide.status.onlyDrawn")
              : allRecovered
                ? t("recovery.guide.status.allRecovered")
                : editorOpen
                  ? t("recovery.guide.status.drawing")
                  : t("recovery.guide.status.invite")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-2 text-sm" data-testid="recovery-guide-steps">
          <li className="flex items-center gap-2">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted">
              {detectedCount > 0 ? (
                <Check
                  className="size-3 text-signal"
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
              {t("recovery.guide.step.detect")}{" "}
              <span className="font-medium text-foreground tabular-nums">
                {t("recovery.guide.step.found", { count: detectedCount })}
              </span>
            </span>
          </li>
          <li className="flex items-center gap-2">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted">
              {allRecovered ? (
                <Check
                  className="size-3 text-signal"
                  aria-hidden="true"
                />
              ) : editorOpen ? (
                <PenLine
                  className="size-3 text-signal"
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
              {t("recovery.guide.step.draw")}{" "}
              <span className="font-medium text-foreground tabular-nums">
                {detectedCount > 0
                  ? t("recovery.guide.step.recovered", {
                      recovered: recoveredCount,
                      detected: detectedCount,
                    })
                  : t("recovery.guide.step.drawn", { count: recoveredCount })}
              </span>
            </span>
          </li>
          <li className="flex items-center gap-2">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted">
              {allRecovered ? (
                <Check
                  className="size-3 text-signal"
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
              {t("recovery.guide.step.preview")}
            </a>
          </li>
        </ol>
      </CardContent>
    </Card>
  );
}
