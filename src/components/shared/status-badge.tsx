/**
 * StatusBadge — one shared renderer for semantic status/severity chips
 * (warning/danger/success/info/neutral tones).
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

export type StatusTone =
  | "danger"
  | "warning"
  | "success"
  | "info"
  | "neutral"
  | "outline";

/*
 * Field Plot chip semantics (mockup styles.css): danger is the hardest
 * thing on the paper — solid ink+ with white text. Warning is the hot
 * outline (signal border, signal-tinted field, ink text). "outline" is
 * the quiet equipment chip — a full ink border with ink text (the
 * severity-suspect look). Success and info stay calm: ink and shade
 * borders on the neutral field.
 */
const TONE_CLASS: Record<StatusTone, string | null> = {
  danger: "border-transparent bg-inkplus text-white",
  warning: "border-signal bg-signal/[0.08] text-ink",
  success: "border-ink/35 bg-transparent text-ink",
  info: "border-ink/15 bg-ink/[0.04] text-shade",
  outline: "border-ink bg-transparent text-ink",
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
