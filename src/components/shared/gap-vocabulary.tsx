"use client";

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
 *
 * Phase 21 (i18n): the labels resolve through `shared.gapVocab.*` keys.
 * The exported label RECORDS (GAP_KIND_LABELS / GAP_STATUS_LABELS) stay
 * for the reconstruction-domain consumers (gap-list, draw-editor-panel,
 * manual-repairs-card — outside this extraction's file scope); they are
 * anchored to English through `enTranslator`, reading the SAME en
 * dictionary values, and disappear once those call sites migrate to
 * `t(GAP_KIND_LABEL_KEYS[...])` (the coordinator's labelKey pass).
 */

import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import { useI18n, enTranslator } from "@/hooks/use-i18n";
import type { GapKind, GapSeverity } from "@/types/domain";
import type { GapStatus } from "@/state/editor-store";

/** Kind labels as i18n keys (render through a translator). */
export const GAP_KIND_LABEL_KEYS: Record<GapKind, string> = {
  "time-gap": "shared.gapVocab.kindTimeGap",
  "speed-anomaly": "shared.gapVocab.kindSpeedAnomaly",
  "segment-break": "shared.gapVocab.kindSegmentBreak",
  manual: "shared.gapVocab.kindManual",
  "manual-insert": "shared.gapVocab.kindManualInsert",
};

export const GAP_SEVERITY_TONE: Record<GapSeverity, StatusTone> = {
  severe: "danger",
  suspect: "outline",
  info: "neutral",
};

/** Severity labels as i18n keys (the badge renders them). */
const GAP_SEVERITY_LABEL_KEYS: Record<GapSeverity, string> = {
  severe: "shared.gapVocab.severitySevere",
  suspect: "shared.gapVocab.severitySuspect",
  info: "shared.gapVocab.severityInfo",
};

export function GapSeverityBadge({ severity }: { severity: GapSeverity }) {
  const { t } = useI18n();
  return (
    <StatusBadge tone={GAP_SEVERITY_TONE[severity]}>
      {t(GAP_SEVERITY_LABEL_KEYS[severity])}
    </StatusBadge>
  );
}

/** User-facing labels for the derived repair status (editor-store join), as i18n keys. */
export const GAP_STATUS_LABEL_KEYS: Record<GapStatus, string> = {
  new: "shared.gapVocab.statusNew",
  "in-progress": "shared.gapVocab.statusInProgress",
  reconstructed: "shared.gapVocab.statusReconstructed",
  skipped: "shared.gapVocab.statusSkipped",
};

export const GAP_STATUS_TONE: Record<GapStatus, StatusTone> = {
  new: "neutral",
  "in-progress": "info",
  reconstructed: "success",
  skipped: "warning",
};

export function GapStatusBadge({ status }: { status: GapStatus }) {
  const { t } = useI18n();
  return (
    <StatusBadge tone={GAP_STATUS_TONE[status]}>
      {t(GAP_STATUS_LABEL_KEYS[status])}
    </StatusBadge>
  );
}

/**
 * English-anchored label records for consumers not yet on the translator
 * (the reconstruction domain's gap list / draw panel / manual repairs).
 * Values resolve from the en dictionary — the single source of truth —
 * and are byte-identical to the pre-extraction labels.
 */
export const GAP_KIND_LABELS: Record<GapKind, string> = {
  "time-gap": enTranslator(GAP_KIND_LABEL_KEYS["time-gap"]),
  "speed-anomaly": enTranslator(GAP_KIND_LABEL_KEYS["speed-anomaly"]),
  "segment-break": enTranslator(GAP_KIND_LABEL_KEYS["segment-break"]),
  manual: enTranslator(GAP_KIND_LABEL_KEYS.manual),
  "manual-insert": enTranslator(GAP_KIND_LABEL_KEYS["manual-insert"]),
};

export const GAP_STATUS_LABELS: Record<GapStatus, string> = {
  new: enTranslator(GAP_STATUS_LABEL_KEYS.new),
  "in-progress": enTranslator(GAP_STATUS_LABEL_KEYS["in-progress"]),
  reconstructed: enTranslator(GAP_STATUS_LABEL_KEYS.reconstructed),
  skipped: enTranslator(GAP_STATUS_LABEL_KEYS.skipped),
};
