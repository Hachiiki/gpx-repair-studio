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

/*
 * Field Plot provenance chips lead with a 7 px color square — the
 * legend-of-the-bench signature. Recorded carries the quiet ink square,
 * Estimated the signal square on a signal-tinted field, and Mixed a
 * square split diagonally half-signal/half-ink (partly measured,
 * partly the app's work).
 */
const PROVENANCE_STYLES: Record<
  ProvenanceKind,
  { label: string; square: string; className: string }
> = {
  recorded: {
    label: "Recorded",
    square: "bg-ink",
    className: "border-ink/35 bg-transparent text-ink",
  },
  estimated: {
    label: "Estimated",
    square: "bg-signal",
    className: "border-signal bg-signal/10 text-ink",
  },
  mixed: {
    label: "Mixed",
    square: "bg-[linear-gradient(135deg,#FC4C02_0_50%,#222222_50%_100%)]",
    className: "border-ink bg-card text-ink",
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
      <span
        className={cn("size-[7px] shrink-0 rounded-[1px]", style.square)}
        aria-hidden="true"
      />
      {style.label}
    </Badge>
  );
}
