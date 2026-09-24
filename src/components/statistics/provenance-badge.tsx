/**
 * ProvenanceBadge — the sanctioned render path for statistic provenance
 * (docs/MASTER_PLAN.md §L-2: "Any statistic that depends on estimated
 * inputs is badged … the provenance column is mandatory in the stats
 * table").
 *
 * One component, one vocabulary (Recorded / Estimated / Mixed). Phase 2
 * renders only "recorded" (original-only statistics); the estimated and
 * mixed variants arrive with reconstruction statistics (Phase 5). Keeping
 * the vocabulary here from the start prevents ad-hoc badges later.
 *
 * Phase 2 — Upload & Inspection UI. Pure presentation.
 */

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type ProvenanceKind = "recorded" | "estimated" | "mixed";

const PROVENANCE_STYLES: Record<ProvenanceKind, { label: string; className: string }> = {
  recorded: {
    label: "Recorded",
    className:
      "border-emerald-600/30 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400",
  },
  estimated: {
    label: "Estimated",
    className:
      "border-amber-600/40 bg-amber-600/10 text-amber-700 dark:text-amber-400",
  },
  mixed: {
    label: "Mixed",
    className:
      "border-orange-600/40 bg-orange-600/10 text-orange-700 dark:text-orange-400",
  },
};

export function ProvenanceBadge({
  kind,
  className,
}: {
  kind: ProvenanceKind;
  className?: string;
}) {
  const style = PROVENANCE_STYLES[kind];
  return (
    <Badge variant="outline" className={cn(style.className, className)}>
      {style.label}
    </Badge>
  );
}
