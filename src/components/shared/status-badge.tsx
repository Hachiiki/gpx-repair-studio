/**
 * StatusBadge — one shared renderer for semantic status/severity chips
 * (warning/danger/success/neutral tones).
 *
 * Created in the Phase 2 duplication review: the validation report, the
 * gap list, and the segment list each inline-mapped their severity
 * vocabularies to the same amber/destructive style strings. The
 * vocabularies stay local to their components (they are different
 * domains — `ValidationSeverity` vs `GapSeverity` vs flags); only the
 * *rendering* of a tone is shared here.
 *
 * Provenance labeling (Recorded/Estimated/Mixed) deliberately uses its
 * own component — see components/statistics/provenance-badge.tsx.
 */

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type StatusTone = "danger" | "warning" | "success" | "neutral";

const TONE_CLASS: Record<StatusTone, string | null> = {
  danger: "border-transparent bg-destructive text-white",
  warning:
    "border-amber-600/30 bg-amber-600/10 text-amber-700 dark:text-amber-400",
  success:
    "border-emerald-600/30 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400",
  neutral: null, // plain secondary variant
};

export function StatusBadge({
  tone,
  className,
  children,
  ...props
}: {
  tone: StatusTone;
  className?: string;
  children: React.ReactNode;
} & Omit<React.ComponentProps<"span">, "children" | "className">) {
  const toneClass = TONE_CLASS[tone];
  return (
    <Badge
      variant="outline"
      className={cn(toneClass, className)}
      {...props}
    >
      {children}
    </Badge>
  );
}
