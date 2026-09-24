/**
 * Gap presentation vocabulary, shared by the gap list, the map's highlight
 * chip, and the draw editor panel (Phase 4).
 *
 * Extracted in Phase 3 from `components/reconstruction/gap-list.tsx`
 * (duplicated vocabulary would otherwise spread with the map's
 * GapHighlightOverlay — user rule: one authoritative implementation per
 * domain concept). Labels are presentation text; the domain kinds and
 * severities live in `types/domain.ts`, the derived repair status in
 * `state/editor-store.ts`.
 */

import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import type { GapKind, GapSeverity } from "@/types/domain";
import type { GapStatus } from "@/state/editor-store";

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

/** User-facing labels for the derived repair status (editor-store join). */
export const GAP_STATUS_LABELS: Record<GapStatus, string> = {
  new: "Not repaired",
  "in-progress": "Editing",
  reconstructed: "Reconstructed",
  skipped: "Skipped",
};

export const GAP_STATUS_TONE: Record<GapStatus, StatusTone> = {
  new: "neutral",
  "in-progress": "info",
  reconstructed: "success",
  skipped: "warning",
};

export function GapStatusBadge({ status }: { status: GapStatus }) {
  return <StatusBadge tone={GAP_STATUS_TONE[status]}>{GAP_STATUS_LABELS[status]}</StatusBadge>;
}
