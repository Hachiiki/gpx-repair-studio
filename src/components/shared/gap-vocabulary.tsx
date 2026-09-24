/**
 * Gap presentation vocabulary, shared by the gap list, the map's highlight
 * chip, and future editor panels (Phase 4+).
 *
 * Extracted in Phase 3 from `components/reconstruction/gap-list.tsx`
 * (duplicated vocabulary would otherwise spread with the map's
 * GapHighlightOverlay — user rule: one authoritative implementation per
 * domain concept). Labels are presentation text; the domain kinds and
 * severities live in `types/domain.ts`.
 */

import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import type { GapKind, GapSeverity } from "@/types/domain";

export const GAP_KIND_LABELS: Record<GapKind, string> = {
  "time-gap": "Time gap",
  "speed-anomaly": "Speed anomaly",
  "segment-break": "Segment break",
};

export const GAP_SEVERITY_TONE: Record<GapSeverity, StatusTone> = {
  severe: "danger",
  suspect: "warning",
  info: "neutral",
};

export function GapSeverityBadge({ severity }: { severity: GapSeverity }) {
  return <StatusBadge tone={GAP_SEVERITY_TONE[severity]}>{severity}</StatusBadge>;
}
