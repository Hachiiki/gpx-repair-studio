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
  return (
    <p className="text-[11.5px] leading-relaxed text-muted-foreground">
      <span className="font-semibold text-ink">{role}</span>{" "}
      {point.time !== undefined ? formatDateTime(point.time) : "no time"} ·{" "}
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
            {formatDistanceMeters(row.impliedDistanceM)} span
          </span>
        )}
      </span>
      {row.before && <BoundaryLine role="From" point={row.before} />}
      {row.after && <BoundaryLine role="To" point={row.after} />}
      {openEnded && (
        <p
          className="text-xs italic text-muted-foreground"
          data-testid="open-end-note"
        >
          Open end — the drawn route extends into the unrecorded part; it
          connects nowhere else.
        </p>
      )}
      <span className="mt-1 flex items-center gap-1">
        <button
          type="button"
          data-testid="open-editor-button-manual"
          className="flex w-fit items-center gap-1.5 rounded-[5px] px-2 py-1 text-[12.5px] font-bold text-signal hover:bg-signal/10 hover:underline hover:underline-offset-[3px] focus-visible:outline-2"
          onClick={() => onOpenEditor(row.id)}
        >
          <PenLine className="size-3.5" aria-hidden="true" />
          {hasVertices ? "Edit route" : "Draw route"}
        </button>
        <button
          type="button"
          data-testid="remove-manual-span-button"
          className="flex w-fit items-center gap-1.5 rounded-[5px] px-2 py-1 text-[12.5px] font-semibold text-muted-foreground hover:bg-inkplus hover:text-paper focus-visible:outline-2"
          aria-label={`Remove manual repair span ${row.id}`}
          onClick={() => onRemoveSpan(row.id)}
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
          Remove
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
  const detected = new Set(detectedGapIds);
  const visible = rows.filter((row) => !detected.has(row.id));
  const title = copy?.title ?? "Manual repairs";
  const description =
    copy?.description ?? "Add or redraw route yourself — detection is only a helper.";
  const anchorLabel = copy?.anchorLabel ?? "Add missing route";
  const anchorHint =
    copy?.anchorHint ??
    "One click anywhere on the map — the repair attaches to the recorded route's nearest end and your clicks draw the missing route outward from there, following the roads between them. Use it for a missing head or tail the watch never recorded.";
  const pairLabel = copy?.pairLabel ?? "Redraw a stretch";
  const pairHint =
    copy?.pairHint ??
    "Click two points on the recorded route — what's between them gets replaced by your drawing. Use it when the watch drew a straight line over a detour you actually ran.";
  const empty =
    copy?.empty ??
    "No manual repairs yet. Start one anywhere on the route — a detour the watch drew straight, a missing head or tail — even when no gap was detected.";
  const anchorInstructions =
    copy?.anchorInstructions ??
    "Click anywhere on the map near where the missing route goes — the repair anchors to the recorded route's nearest end and every click after that draws outward from it. Esc cancels.";
  const pairInstructions =
    copy?.pairInstructions ??
    "Click two points on the recorded route — the stretch between them is what you replace. Pan and zoom stay available; Esc cancels.";

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
              Cancel picking
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
            A repair editor is open — finish or close it before starting
            another repair.
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
