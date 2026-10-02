/**
 * DeepValidationCard (Phase 13) — the find→fix surface of the repair
 * workspace's tools column (§EE 13.3/13.4/13.5).
 *
 * Renders the deep report over the WORKING copy: issues grouped by
 * severity with counts, a Jump button per issue (camera focus; the map
 * stays the original+working composite), the full textual point list
 * behind a disclosure (§C-5 — every map capability has a text
 * equivalent), per-issue one-click fixes and preset bundles — each
 * gated by the FixPreviewDialog before anything is applied — and the
 * confirmed-fix log with per-fix provenance (reason + timestamp) and
 * the undo control (the log IS the undo stack).
 *
 * Pure presentation: the binding from `useDeepValidation` in, intents
 * out (jump, open-preview, confirm, undo) — no domain logic here.
 */

"use client";

import { useState } from "react";
import {
  CircleCheck,
  Crosshair,
  History,
  ListOrdered,
  ScanSearch,
  Undo2,
  Wrench,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  StatusBadge,
  type StatusTone,
} from "@/components/shared/status-badge";
import {
  FixPreviewDialog,
  type PreviewPointInfo,
} from "@/components/gpx/fix-preview-dialog";
import type {
  DeepIssue,
  DeepIssueKind,
  DeepIssueSeverity,
  FixKind,
  FixPlan,
  PointRef,
  PresetId,
  WorkingEdit,
} from "@/types/domain";
import type { DeepValidationBinding } from "@/hooks/use-deep-validation";
import { formatDateTime } from "@/lib/utils/format";

// ---------------------------------------------------------------------------
// Vocabulary (UI labels — presentation-only)
// ---------------------------------------------------------------------------

const KIND_LABELS: Record<DeepIssueKind, string> = {
  "speed-spike": "Speed spikes",
  "duplicate-cluster": "Duplicate points",
  "gps-drift": "GPS drift",
  "elevation-outlier": "Elevation outliers",
  "non-monotonic-time": "Clock runs backwards",
  "missing-elevation": "Missing elevation",
};

const SEVERITY_ORDER: Record<DeepIssueSeverity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

const SEVERITY_TONE: Record<DeepIssueSeverity, StatusTone> = {
  error: "danger",
  warning: "warning",
  info: "neutral",
};

const SEVERITY_NOUN: Record<DeepIssueSeverity, string> = {
  error: "errors",
  warning: "warnings",
  info: "notes",
};

const FIX_LABELS: Record<FixKind, string> = {
  "remove-spikes": "Remove spikes…",
  dedupe: "Dedupe…",
  "sort-by-time": "Sort by time…",
  "smooth-elevations": "Smooth elevations…",
  "remove-drift": "Collapse drift…",
  thin: "Thin recording…",
};

const REASON_LABELS: Record<WorkingEdit["reason"], string> = {
  spike: "spike removal",
  duplicate: "dedupe",
  drift: "drift collapse",
  sort: "time sort",
  elevation: "elevation smoothing",
  thin: "thinning",
};

/** The point list cap per issue — the disclosure lists 12, then counts. */
const POINT_LIST_CAP = 12;

// ---------------------------------------------------------------------------
// The card
// ---------------------------------------------------------------------------

export interface DeepValidationCardProps {
  /** The deep-validation binding (report, plans, intents). */
  deep: DeepValidationBinding;
  /** Jump the map to a point (AppShell resolves + focuses). */
  onJumpToPoint: (ref: PointRef) => void;
  /** Resolve a point id for the textual lists (null = unknown). */
  resolvePoint: (pointId: string) => PreviewPointInfo | null;
}

interface PendingPreview {
  title: string;
  plans: readonly FixPlan[];
}

export function DeepValidationCard({
  deep,
  onJumpToPoint,
  resolvePoint,
}: DeepValidationCardProps) {
  const [pending, setPending] = useState<PendingPreview | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<DeepIssueKind>>(
    new Set(),
  );

  const issues = [...deep.report.issues].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );

  const counts: Record<DeepIssueSeverity, number> = { error: 0, warning: 0, info: 0 };
  for (const issue of deep.report.issues) counts[issue.severity] += issue.count;

  const summary = (Object.keys(counts) as DeepIssueSeverity[])
    .filter((severity) => counts[severity] > 0)
    .map((severity) => `${counts[severity]} ${SEVERITY_NOUN[severity]}`)
    .join(" · ");

  const openFixPreview = (kind: FixKind) => {
    const plan = deep.planFix(kind);
    if (plan === null) return;
    setPending({ title: plan.label, plans: [plan] });
  };

  const openPresetPreview = (id: PresetId) => {
    const plans = deep.planPreset(id);
    const preset = deep.presets.find((p) => p.id === id);
    if (plans === null || !preset) return;
    setPending({ title: `Preset — ${preset.name}`, plans });
  };

  const confirmPending = () => {
    if (pending === null) return;
    deep.applyPlans(pending.plans);
    setPending(null);
  };

  const toggleExpanded = (kind: DeepIssueKind) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  };

  return (
    <Card data-testid="deep-validation-card">
      <CardHeader>
        <h3 className="flex items-center gap-2 text-[15.5px] font-bold leading-tight">
          <ScanSearch
            className="size-4 shrink-0 text-signal"
            aria-hidden="true"
          />
          Deep validation
        </h3>
        <CardDescription>
          {deep.report.totalCount > 0
            ? `${summary} in the working copy`
            : "No fixable recording damage found"}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {deep.report.totalCount === 0 ? (
          <p className="flex items-start gap-2 text-[13px] leading-relaxed text-muted-foreground">
            <CircleCheck
              className="mt-0.5 size-4 shrink-0 text-ink"
              aria-hidden="true"
            />
            Deep checks hunt teleports, duplicates, drift, clock and
            elevation damage. This working copy is clean.
          </p>
        ) : (
          <ScrollArea className="max-h-[22rem] -mx-2">
            <ul className="grid gap-2 px-2" data-testid="deep-issue-list">
              {issues.map((issue) => (
                <DeepIssueRow
                  key={issue.kind}
                  issue={issue}
                  fixes={deep.fixesForIssue(issue.kind)}
                  expanded={expanded.has(issue.kind)}
                  onToggle={() => toggleExpanded(issue.kind)}
                  onJump={() => issue.points[0] && onJumpToPoint(issue.points[0])}
                  onFix={openFixPreview}
                  resolvePoint={resolvePoint}
                />
              ))}
            </ul>
          </ScrollArea>
        )}

        {/* Preset bundles — detector→fix chains with a compound preview. */}
        <section aria-label="Presets" className="grid gap-2">
          <h4 className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            <History className="size-3.5" aria-hidden="true" />
            Presets
          </h4>
          <div className="grid gap-1.5">
            {deep.presets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                data-testid={`deep-preset-${preset.id}`}
                aria-label={`Preset ${preset.name}. ${preset.description}`}
                className="grid gap-0.5 rounded-[9px] border-[1.25px] border-ink/15 px-3 py-2 text-left transition-colors hover:border-signal hover:bg-signal/[0.05] focus-visible:outline-2"
                onClick={() => openPresetPreview(preset.id)}
              >
                <span className="text-[13px] font-semibold">{preset.name}</span>
                <span className="text-[11.5px] leading-relaxed text-muted-foreground">
                  {preset.description}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* The confirmed-fix log — provenance + undo (log = undo stack). */}
        {deep.edits.length > 0 && (
          <section aria-label="Applied fixes" className="grid gap-2">
            <div className="flex items-center justify-between gap-2">
              <h4 className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                <ListOrdered className="size-3.5" aria-hidden="true" />
                Changes ({deep.edits.length})
              </h4>
              <button
                type="button"
                data-testid="deep-undo-last"
                className="inline-flex items-center gap-1.5 rounded-[5px] px-2 py-1 text-[12.5px] font-bold text-signal-ink transition-colors hover:bg-signal/10 hover:underline hover:underline-offset-[3px] focus-visible:outline-2"
                onClick={deep.undo}
              >
                <Undo2 className="size-3.5" aria-hidden="true" />
                Undo last
              </button>
            </div>
            <ul className="grid gap-1.5" data-testid="deep-change-log">
              {[...deep.edits]
                .reverse()
                .map((edit, index) => (
                  <li
                    key={edit.id}
                    data-testid="deep-change-row"
                    className="grid gap-0.5 rounded-[9px] border-[1.25px] border-ink/15 px-3 py-2"
                  >
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] font-semibold">
                      {edit.label}
                      <span className="rounded-[3px] border-[1.25px] border-ink/25 px-1 py-px font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                        {REASON_LABELS[edit.reason]}
                      </span>
                      {index === 0 && (
                        <span className="text-[11px] font-normal text-muted-foreground">
                          (newest)
                        </span>
                      )}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {formatDateTime(edit.appliedAt)}
                    </span>
                  </li>
                ))}
            </ul>
            <p className="text-[11.5px] leading-relaxed text-muted-foreground">
              Statistics, the map route, and the export recompute from this
              working copy; the original file stays untouched.
            </p>
          </section>
        )}
      </CardContent>

      <FixPreviewDialog
        plans={pending?.plans ?? null}
        title={pending?.title ?? ""}
        resolvePoint={resolvePoint}
        onConfirm={confirmPending}
        onClose={() => setPending(null)}
      />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// One issue row
// ---------------------------------------------------------------------------

function DeepIssueRow({
  issue,
  fixes,
  expanded,
  onToggle,
  onJump,
  onFix,
  resolvePoint,
}: {
  issue: DeepIssue;
  fixes: readonly FixKind[];
  expanded: boolean;
  onToggle: () => void;
  onJump: () => void;
  onFix: (kind: FixKind) => void;
  resolvePoint: (pointId: string) => PreviewPointInfo | null;
}) {
  const shown = issue.points.slice(0, POINT_LIST_CAP);
  return (
    <li
      data-testid="deep-issue-row"
      data-kind={issue.kind}
      className="grid gap-1.5 rounded-lg border-[1.25px] border-ink/15 px-3 py-2.5 text-[13px]"
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={SEVERITY_TONE[issue.severity]}>
          {issue.severity}
        </StatusBadge>
        <span className="font-semibold">{KIND_LABELS[issue.kind]}</span>
        <span className="ml-auto font-bold tabular-nums text-muted-foreground">
          ×{issue.count}
        </span>
      </div>
      <p className="min-w-0 text-[11.5px] leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
        {issue.message}
      </p>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {issue.points.length > 0 && (
          <button
            type="button"
            data-testid="deep-issue-jump"
            className="inline-flex items-center gap-1.5 rounded-[5px] px-2 py-1 text-[12.5px] font-bold text-signal-ink transition-colors hover:bg-signal/10 hover:underline hover:underline-offset-[3px] focus-visible:outline-2"
            aria-label={`Jump the map to the ${KIND_LABELS[issue.kind]} location`}
            onClick={onJump}
          >
            <Crosshair className="size-3.5" aria-hidden="true" />
            Jump to map
          </button>
        )}
        {fixes.map((kind) => (
          <button
            key={kind}
            type="button"
            data-testid={`deep-issue-fix-${kind}`}
            className="inline-flex items-center gap-1.5 rounded-[5px] px-2 py-1 text-[12.5px] font-bold text-signal-ink transition-colors hover:bg-signal/10 hover:underline hover:underline-offset-[3px] focus-visible:outline-2"
            aria-label={`${FIX_LABELS[kind]} Preview what would change, then confirm.`}
            onClick={() => onFix(kind)}
          >
            <Wrench className="size-3.5" aria-hidden="true" />
            {FIX_LABELS[kind]}
          </button>
        ))}
        {issue.points.length > 0 && (
          <button
            type="button"
            data-testid="deep-issue-list-toggle"
            aria-expanded={expanded}
            className="ml-auto rounded-[5px] px-2 py-1 text-[12px] font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2"
            onClick={onToggle}
          >
            {expanded ? "Hide points" : `List ${issue.points.length} points`}
          </button>
        )}
      </div>

      {/* The textual equivalent of the map (§C-5). */}
      {expanded && (
        <ul className="grid gap-1 rounded-lg border-[1.25px] border-ink/10 bg-shade/40 px-3 py-2">
          {shown.map((ref) => {
            const info = resolvePoint(ref.pointId);
            return (
              <li
                key={ref.pointId}
                className="text-[11px] leading-relaxed text-muted-foreground"
              >
                <span className="font-mono text-[10px] text-ink">
                  {ref.pointId}
                </span>
                {info ? (
                  <>
                    {" · "}
                    <span className="font-mono text-[10px]">
                      {info.lat.toFixed(5)}, {info.lon.toFixed(5)}
                    </span>
                    {info.ele !== undefined ? ` · ${Math.round(info.ele)} m` : ""}
                    {info.time !== undefined
                      ? ` · ${formatDateTime(info.time)}`
                      : ""}
                  </>
                ) : (
                  " · unknown position"
                )}
              </li>
            );
          })}
          {issue.points.length > shown.length && (
            <li className="text-[11px] text-muted-foreground">
              …and {issue.points.length - shown.length} more
            </li>
          )}
        </ul>
      )}
    </li>
  );
}
