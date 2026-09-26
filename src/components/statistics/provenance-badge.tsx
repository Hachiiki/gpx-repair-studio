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
  /*
   * Ink & Signal: what the watch recorded needs no color — it is the
   * calm baseline (ink outline). What the app estimated is the brand
   * (signal tint). Mixed carries the signal border but keeps ink text
   * — partly estimated, partly recorded.
   */
  recorded: {
    label: "Recorded",
    className: "border-ink/25 bg-transparent text-ink",
  },
  estimated: {
    label: "Estimated",
    className: "border-signal/40 bg-signal/10 text-signal",
  },
  mixed: {
    label: "Mixed",
    className: "border-signal/40 bg-signal/5 text-ink",
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
