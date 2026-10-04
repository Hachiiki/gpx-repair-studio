/**
 * ManualRepairsCard — the always-available repair entry point
 * (draw-anywhere).
 *
 * The user's contract: repairing is NEVER gated on detection. Detected
 * gaps are suggestions; this card is where the user declares "I want to
 * add or redraw route" regardless of what the detector thinks — the exact
 * scenario of a clean-looking file whose route still needs fixing.
 *
 * Two tools, two interaction shapes:
 *   - "Add missing route" (primary): ONE click on a recorded point, then
 *     every click anywhere on the map extends the drawn path — what you
 *     see while editing is what you get. The click's position derives the
 *     shape (route start → open head; route end → open tail; mid-route →
 *     insert at the [anchor, next] boundary).
 *   - "Redraw a stretch" (secondary): the two-click selection bounding a
 *     recorded stretch to replace.
 *
 * Rows list the created spans with their derived repair status, an edit
 * action, and a remove action. Spans whose id currently matches a detected
 * gap are hidden here — the detected-gaps list already owns that boundary.
 *
 * Pure presentation: props in, intents out — no store, domain, or map
 * imports (ESLint boundaries).
 */

import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { HintTip } from "@/components/shared/hint-tip";
import { useI18n } from "@/hooks/use-i18n";
import { Crosshair, MousePointer2, PenLine, Trash2, X } from "lucide-react";
import {
  GAP_KIND_LABELS,
  GapStatusBadge,
} from "@/components/shared/gap-vocabulary";
import type { RepairRow } from "@/hooks/use-draw-editor";
import type { PickMode } from "@/state/editor-store";
import type { GapStatus } from "@/state/editor-store";
import type { GapId } from "@/types/domain";
import {
  formatDateTime,
  formatDistanceMeters,
  formatLatLon,
} from "@/lib/utils/format";

function BoundaryLine({
  role,
  point,
}: {
  role: string;
  point: NonNullable<RepairRow["before"]>;
}) {
  const { t } = useI18n();
  return (
    <p className="text-[11.5px] leading-relaxed text-muted-foreground">
      <span className="font-semibold text-ink">{role}</span>{" "}
      {point.time !== undefined ? formatDateTime(point.time) : t("manualRepairs.noTime")} ·{" "}
      <span className="font-mono text-[10.5px]">{formatLatLon(point.lat, point.lon)}</span>
    </p>
  );
}

function ManualSpanRow({
  row,
  status,
  onOpenEditor,
  onRemoveSpan,
}: {
  row: RepairRow;
  status: GapStatus;
  onOpenEditor: (gapId: GapId) => void;
  onRemoveSpan: (gapId: GapId) => void;
}) {
  const { t } = useI18n();
  const hasVertices = status === "reconstructed" || status === "in-progress";
  const openEnded = row.before === undefined || row.after === undefined;
  return (
    <li
      className="grid gap-1 rounded-[9px] border-[1.25px] border-ink/15 px-3 py-2.5"
      data-testid="manual-repair-row"
    >
      <span className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-semibold">{GAP_KIND_LABELS[row.kind]}</span>
        <GapStatusBadge status={status} />
        {row.impliedDistanceM !== undefined && (
          <span className="ml-auto text-[12.5px] font-bold tabular-nums">
            {t("manualRepairs.spanMeters", {
              distance: formatDistanceMeters(row.impliedDistanceM),
            })}
          </span>
        )}
      </span>
      {row.before && <BoundaryLine role={t("manualRepairs.from")} point={row.before} />}
      {row.after && <BoundaryLine role={t("manualRepairs.to")} point={row.after} />}
      {openEnded && (
        <p
          className="text-xs italic text-muted-foreground"
          data-testid="open-end-note"
        >
          {t("manualRepairs.openEndNote")}
        </p>
      )}
      <span className="mt-1 flex items-center gap-1">
        <button
          type="button"
          data-testid="open-editor-button-manual"
          className="flex w-fit items-center gap-1.5 rounded-[5px] px-2 py-1 text-[12.5px] font-bold text-signal-ink hover:bg-signal/10 hover:underline hover:underline-offset-[3px] focus-visible:outline-2"
          onClick={() => onOpenEditor(row.id)}
        >
          <PenLine className="size-3.5" aria-hidden="true" />
          {hasVertices ? t("manualRepairs.editRoute") : t("manualRepairs.drawRoute")}
        </button>
        <button
          type="button"
          data-testid="remove-manual-span-button"
          className="flex w-fit items-center gap-1.5 rounded-[5px] px-2 py-1 text-[12.5px] font-semibold text-muted-foreground hover:bg-inkplus hover:text-paper focus-visible:outline-2"
          aria-label={t("manualRepairs.removeAria", { id: row.id })}
          onClick={() => onRemoveSpan(row.id)}
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
          {t("manualRepairs.remove")}
        </button>
      </span>
    </li>
  );
}

export interface ManualRepairsCardProps {
  /** Manual spans joined into rows (resolved against the model). */
  rows: readonly RepairRow[];
  /** Ids of spans that are also currently detected — they render in the
   * detected-gaps list instead, so this card hides them. */
  detectedGapIds: readonly string[];
  /** Span-pick mode: which tool is collecting map clicks (null = off). */
  pickMode: PickMode | null;
  /**
   * A draw editor session is open (user pass 36): starting another
   * pick while one editor is mid-flight would bury the open session —
   * the two tools disable until it is closed. Default false (tests and
   * standalone renders keep the old contract).
   */
  editorActive?: boolean;
  onBeginPickAnchor: () => void;
  onBeginPickPair: () => void;
  onCancelPick: () => void;
  onOpenEditor: (gapId: GapId) => void;
  onRemoveSpan: (gapId: GapId) => void;
  /** Derived repair status per gap id (same join as the gap list). */
  statusById?: Readonly<Record<string, GapStatus>>;
  /**
   * Per-section voice (Task 28): the recovery section reuses this card
   * for its "unmeasured sections" with its own copy. Every string is
   * optional and defaults to the repair studio's exact wording — the
   * repair flow renders byte-identically when none is given.
   */
  copy?: {
    title?: string;
    description?: string;
    anchorLabel?: string;
    anchorHint?: string;
    pairLabel?: string;
    pairHint?: string;
    empty?: string;
    anchorInstructions?: string;
    pairInstructions?: string;
  };
}

export function ManualRepairsCard({
  rows,
  detectedGapIds,
  pickMode,
  editorActive = false,
  onBeginPickAnchor,
  onBeginPickPair,
  onCancelPick,
  onOpenEditor,
  onRemoveSpan,
  statusById,
  copy,
}: ManualRepairsCardProps) {
  const { t } = useI18n();
  const detected = new Set(detectedGapIds);
  const visible = rows.filter((row) => !detected.has(row.id));
  /*
   * Per-section voice (Task 28): every string stays overridable — the
   * recovery section passes its own copy; the repair studio's exact
   * wording now lives in the i18n dictionary as the default.
   */
  const title = copy?.title ?? t("manualRepairs.title");
  const description =
    copy?.description ?? t("manualRepairs.description");
  const anchorLabel = copy?.anchorLabel ?? t("manualRepairs.anchorLabel");
  const anchorHint = copy?.anchorHint ?? t("manualRepairs.anchorHint");
  const pairLabel = copy?.pairLabel ?? t("manualRepairs.pairLabel");
  const pairHint = copy?.pairHint ?? t("manualRepairs.pairHint");
  const empty = copy?.empty ?? t("manualRepairs.empty");
  const anchorInstructions =
    copy?.anchorInstructions ?? t("manualRepairs.anchorInstructions");
  const pairInstructions =
    copy?.pairInstructions ?? t("manualRepairs.pairInstructions");

  return (
    <Card data-testid="manual-repairs-card">
      <CardHeader>
        <h3 className="flex items-center gap-2 text-[15.5px] font-bold leading-tight">
          <span
            className="size-2 shrink-0 rounded-[1px] bg-signal"
            aria-hidden="true"
          />
          {title}
        </h3>
        <CardDescription>{description}</CardDescription>
        <CardAction>
          {pickMode && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5"
              data-testid="cancel-pick-button"
              onClick={onCancelPick}
            >
              <X className="size-3.5" aria-hidden="true" />
              {t("manualRepairs.cancelPicking")}
            </Button>
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-3">
        {/* The two repair tools. Exactly one interaction shape each —
            one click to start adding, two clicks to bound a redraw.
            Stacked: the 336–384 px rail is too narrow for two labelled
            buttons side by side (the mockup's rail rule). While a draw
            editor is open they disable — a second pick would bury the
            session mid-flight (user pass 36). */}
        <div className="grid gap-2">
          <HintTip side="left" title={anchorLabel} description={anchorHint}>
            <Button
              type="button"
              size="sm"
              className="h-9 w-full gap-1.5"
              data-testid="begin-pick-anchor-button"
              disabled={pickMode !== null || editorActive}
              onClick={onBeginPickAnchor}
            >
              <PenLine className="size-3.5" aria-hidden="true" />
              {anchorLabel}
            </Button>
          </HintTip>
          <HintTip side="left" title={pairLabel} description={pairHint}>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 w-full gap-1.5"
              data-testid="begin-pick-pair-button"
              disabled={pickMode !== null || editorActive}
              onClick={onBeginPickPair}
            >
              <MousePointer2 className="size-3.5" aria-hidden="true" />
              {pairLabel}
            </Button>
          </HintTip>
        </div>
        {editorActive && !pickMode && (
          <p
            className="rounded-md border-[1.25px] border-ink/15 bg-ink/[0.03] px-3 py-2 text-xs leading-relaxed text-muted-foreground"
            data-testid="tools-locked-note"
          >
            {t("manualRepairs.toolsLocked")}
          </p>
        )}
        {pickMode === "anchor" && (
          <p
            className="rounded-lg border-[1.25px] border-signal bg-signal/[0.08] px-3 py-2.5 text-xs leading-relaxed text-ink"
            data-testid="pick-instructions"
            role="status"
          >
            {anchorInstructions}
          </p>
        )}
        {pickMode === "pair" && (
          <p
            className="rounded-lg border-[1.25px] border-signal bg-signal/[0.08] px-3 py-2.5 text-xs leading-relaxed text-ink"
            data-testid="pick-instructions"
            role="status"
          >
            {pairInstructions}
          </p>
        )}
        {visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="grid gap-3">
            {visible.map((row) => (
              <ManualSpanRow
                key={row.id}
                row={row}
                status={statusById?.[row.id] ?? "new"}
                onOpenEditor={onOpenEditor}
                onRemoveSpan={onRemoveSpan}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
