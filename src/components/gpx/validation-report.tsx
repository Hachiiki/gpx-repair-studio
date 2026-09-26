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
import type {
  ValidationIssue,
  ValidationIssueKind,
  ValidationSeverity,
} from "@/types/domain";

const KIND_LABELS: Record<ValidationIssueKind, string> = {
  "invalid-coord": "Invalid coordinates",
  "out-of-range-coord": "Out-of-range coordinates",
  "zero-coord": "Zero-coordinate run",
  "invalid-ele": "Invalid elevation",
  "out-of-range-ele": "Out-of-range elevation",
  "unreliable-time": "Unreliable timestamp",
  "undeclared-namespace": "Undeclared namespace prefix",
  "time-reversed": "Reversed timestamps",
  "speed-spike": "Speed spike",
  "duplicate-point": "Duplicate points",
  "empty-segment": "Empty segment",
  "single-point-segment": "Single-point segment",
  "track-without-segments": "Track without segments",
  "no-timing-data": "No timing data",
  "reimported-repair": "Previously repaired",
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

const SEVERITY_NOUN: Record<ValidationSeverity, string> = {
  error: "errors",
  warning: "warnings",
  info: "notes",
};

function SeverityBadge({ severity }: { severity: ValidationSeverity }) {
  return <StatusBadge tone={SEVERITY_TONE[severity]}>{severity}</StatusBadge>;
}

export function ValidationReport({
  issues,
}: {
  issues: readonly ValidationIssue[];
}) {
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
    .map((severity) => `${counts[severity]} ${SEVERITY_NOUN[severity]}`)
    .join(" · ");

  return (
    <Card data-testid="validation-report">
      <CardHeader>
        <h3 className="leading-none font-semibold">Validation report</h3>
        <CardDescription>
          {issues.length > 0 ? summary : "No problems found"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {issues.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CircleCheck
              className="size-4 shrink-0 text-ink"
              aria-hidden="true"
            />
            The recording looks healthy.
          </p>
        ) : (
          <ScrollArea className="max-h-96 -mx-2">
            <ul className="grid gap-3 px-2">
              {ordered.map((issue, index) => (
                <li
                  key={`${issue.kind}-${index}`}
                  className="grid min-w-0 gap-1 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <SeverityBadge severity={issue.severity} />
                    <span className="font-medium">
                      {KIND_LABELS[issue.kind]}
                    </span>
                  </div>
                  {/*
                    Messages can embed long unbreakable tokens (namespace
                    URIs, point ids, file names). `overflow-wrap: anywhere`
                    — not `break-words` — is required: only `anywhere`
                    participates in min-content sizing, so a long token can
                    never blow out the panel grid on narrow viewports.
                  */}
                  <p className="min-w-0 text-muted-foreground [overflow-wrap:anywhere]">
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
