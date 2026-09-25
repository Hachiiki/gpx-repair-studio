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
    <p className="text-xs text-muted-foreground">
      <span className="font-medium text-foreground">{role}</span>{" "}
      {point.time !== undefined ? formatDateTime(point.time) : "no time"} ·{" "}
      <span className="font-mono">{formatLatLon(point.lat, point.lon)}</span>
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
      className="grid gap-1 rounded-lg border px-3 py-2.5"
      data-testid="manual-repair-row"
    >
      <span className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{GAP_KIND_LABELS[row.kind]}</span>
        <GapStatusBadge status={status} />
        {row.impliedDistanceM !== undefined && (
          <span className="ml-auto text-sm tabular-nums">
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
          className="flex w-fit items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-600/10 focus-visible:outline-2 dark:text-emerald-400"
          onClick={() => onOpenEditor(row.id)}
        >
          <PenLine className="size-3.5" aria-hidden="true" />
          {hasVertices ? "Edit route" : "Draw route"}
        </button>
        <button
          type="button"
          data-testid="remove-manual-span-button"
          className="flex w-fit items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-destructive focus-visible:outline-2"
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
  onBeginPickAnchor: () => void;
  onBeginPickPair: () => void;
  onCancelPick: () => void;
  onOpenEditor: (gapId: GapId) => void;
  onRemoveSpan: (gapId: GapId) => void;
  /** Derived repair status per gap id (same join as the gap list). */
  statusById?: Readonly<Record<string, GapStatus>>;
}

export function ManualRepairsCard({
  rows,
  detectedGapIds,
  pickMode,
  onBeginPickAnchor,
  onBeginPickPair,
  onCancelPick,
  onOpenEditor,
  onRemoveSpan,
  statusById,
}: ManualRepairsCardProps) {
  const detected = new Set(detectedGapIds);
  const visible = rows.filter((row) => !detected.has(row.id));

  return (
    <Card data-testid="manual-repairs-card">
      <CardHeader>
        <h3 className="leading-none font-semibold">Manual repairs</h3>
        <CardDescription>
          Add or redraw route yourself — detection is only a helper.
        </CardDescription>
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
            one click to start adding, two clicks to bound a redraw. */}
        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            type="button"
            size="sm"
            className="h-9 gap-1.5"
            data-testid="begin-pick-anchor-button"
            disabled={pickMode !== null}
            onClick={onBeginPickAnchor}
          >
            <PenLine className="size-3.5" aria-hidden="true" />
            Add missing route
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 gap-1.5"
            data-testid="begin-pick-pair-button"
            disabled={pickMode !== null}
            onClick={onBeginPickPair}
          >
            <MousePointer2 className="size-3.5" aria-hidden="true" />
            Redraw a stretch
          </Button>
        </div>
        {pickMode === "anchor" && (
          <p
            className="rounded-md border border-emerald-600/30 bg-emerald-600/5 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400"
            data-testid="pick-instructions"
            role="status"
          >
            Click ONE point on the recorded route to attach your repair —
            then draw freely anywhere on the map. Route start/end extends
            into the open; a middle point inserts after it. Esc cancels.
          </p>
        )}
        {pickMode === "pair" && (
          <p
            className="rounded-md border border-emerald-600/30 bg-emerald-600/5 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400"
            data-testid="pick-instructions"
            role="status"
          >
            Click two points on the recorded route — the stretch between
            them is what you replace. Pan and zoom stay available; Esc
            cancels.
          </p>
        )}
        {visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No manual repairs yet. Start one anywhere on the route — a
            detour the watch drew straight, a missing head or tail — even
            when no gap was detected.
          </p>
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
