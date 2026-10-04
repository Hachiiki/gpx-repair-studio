/**
 * ValidationReport — the validator's findings, grouped by severity
 * (Phase 2 scope: "see validation report").
 *
 * Presentation-only: sorts/groups the `ValidationIssue[]` that the frozen
 * model already carries (parse warnings + validate findings, merged by
 * `validateGpx`). Severity ordering and label mapping are UI vocabulary.
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CircleCheck } from "lucide-react";
import {
  StatusBadge,
  type StatusTone,
} from "@/components/shared/status-badge";
import { useI18n } from "@/hooks/use-i18n";
import type {
  ValidationIssue,
  ValidationIssueKind,
  ValidationSeverity,
} from "@/types/domain";

const KIND_LABEL_KEYS: Record<ValidationIssueKind, string> = {
  "invalid-coord": "validation.kind.invalidCoord",
  "out-of-range-coord": "validation.kind.outOfRangeCoord",
  "zero-coord": "validation.kind.zeroCoord",
  "invalid-ele": "validation.kind.invalidEle",
  "out-of-range-ele": "validation.kind.outOfRangeEle",
  "unreliable-time": "validation.kind.unreliableTime",
  "undeclared-namespace": "validation.kind.undeclaredNamespace",
  "time-reversed": "validation.kind.timeReversed",
  "speed-spike": "validation.kind.speedSpike",
  "duplicate-point": "validation.kind.duplicatePoint",
  "empty-segment": "validation.kind.emptySegment",
  "single-point-segment": "validation.kind.singlePointSegment",
  "track-without-segments": "validation.kind.trackWithoutSegments",
  "no-timing-data": "validation.kind.noTimingData",
  "reimported-repair": "validation.kind.reimportedRepair",
  "conversion-note": "validation.kind.conversionNote",
};

const SEVERITY_ORDER: Record<ValidationSeverity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

const SEVERITY_TONE: Record<ValidationSeverity, StatusTone> = {
  error: "danger",
  warning: "warning",
  info: "neutral",
};

const SEVERITY_LABEL_KEYS: Record<ValidationSeverity, string> = {
  error: "validation.severity.error",
  warning: "validation.severity.warning",
  info: "validation.severity.info",
};

const SEVERITY_NOUN_KEYS: Record<ValidationSeverity, string> = {
  error: "validation.noun.error",
  warning: "validation.noun.warning",
  info: "validation.noun.info",
};

function SeverityBadge({ severity }: { severity: ValidationSeverity }) {
  const { t } = useI18n();
  return (
    <StatusBadge tone={SEVERITY_TONE[severity]}>
      {t(SEVERITY_LABEL_KEYS[severity])}
    </StatusBadge>
  );
}

export function ValidationReport({
  issues,
}: {
  issues: readonly ValidationIssue[];
}) {
  const { t } = useI18n();
  const counts = { error: 0, warning: 0, info: 0 } as Record<
    ValidationSeverity,
    number
  >;
  for (const issue of issues) counts[issue.severity] += 1;

  const ordered = issues
    .map((issue, index) => ({ issue, index }))
    .sort(
      (a, b) =>
        SEVERITY_ORDER[a.issue.severity] - SEVERITY_ORDER[b.issue.severity] ||
        a.index - b.index,
    )
    .map(({ issue }) => issue);

  const summary = (Object.keys(counts) as ValidationSeverity[])
    .filter((severity) => counts[severity] > 0)
    .map((severity) => `${counts[severity]} ${t(SEVERITY_NOUN_KEYS[severity])}`)
    .join(" · ");

  return (
    <Card data-testid="validation-report">
      <CardHeader>
        <h3 className="flex items-center gap-2 text-[15.5px] font-bold leading-tight">
          <span
            className="size-2 shrink-0 rounded-[1px] bg-signal"
            aria-hidden="true"
          />
          {t("validation.title")}
        </h3>
        <CardDescription>
          {issues.length > 0 ? summary : t("validation.noProblems")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {issues.length === 0 ? (
          <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <CircleCheck
              className="size-4 shrink-0 text-ink"
              aria-hidden="true"
            />
            {t("validation.healthy")}
          </p>
        ) : (
          <ScrollArea className="max-h-96 -mx-2">
            <ul className="grid gap-2 px-2">
              {ordered.map((issue, index) => (
                <li
                  key={`${issue.kind}-${index}`}
                  className="grid min-w-0 gap-1 rounded-lg border border-ink/15 px-3 py-2.5 text-[13px]"
                >
                  <div className="flex items-center gap-2">
                    <SeverityBadge severity={issue.severity} />
                    <span className="font-semibold">
                      {t(KIND_LABEL_KEYS[issue.kind])}
                    </span>
                  </div>
                  {/*
                    Messages can embed long unbreakable tokens (namespace
                    URIs, point ids, file names). `overflow-wrap: anywhere`
                    — not `break-words` — is required: only `anywhere`
                    participates in min-content sizing, so a long token can
                    never blow out the panel grid on narrow viewports.
                  */}
                  <p className="min-w-0 text-[11.5px] leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
                    {issue.message}
                  </p>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
