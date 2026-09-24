/**
 * ManualRepairsCard — the always-available repair entry point
 * (draw-anywhere).
 *
 * The user's contract: repairing is NEVER gated on detection. Detected
 * gaps are suggestions; this card is where the user declares "I want to
 * redraw this stretch" regardless of what the detector thinks — the exact
 * scenario of a clean-looking file whose route still needs fixing.
 *
 * "New repair span" starts the map's span-pick mode (click two recorded
 * points); the resulting span opens the standard draw editor. Rows list
 * the created spans with their derived repair status, an edit action, and
 * a remove action. Spans whose id currently matches a detected gap are
 * hidden here — the detected-gaps list already owns that boundary.
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
import { Crosshair, PenLine, Trash2, X } from "lucide-react";
import {
  GAP_KIND_LABELS,
  GapStatusBadge,
} from "@/components/shared/gap-vocabulary";
import type { GapRow } from "@/hooks/use-gpx-session";
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
  point: GapRow["before"];
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
  row: GapRow;
  status: GapStatus;
  onOpenEditor: (gapId: GapId) => void;
  onRemoveSpan: (gapId: GapId) => void;
}) {
  const hasVertices = status === "reconstructed" || status === "in-progress";
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
      <BoundaryLine role="From" point={row.before} />
      <BoundaryLine role="To" point={row.after} />
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
          aria-label={`Remove manual repair span from ${row.before.pointId} to ${row.after.pointId}`}
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
  rows: readonly GapRow[];
  /** Ids of spans that are also currently detected — they render in the
   * detected-gaps list instead, so this card hides them. */
  detectedGapIds: readonly string[];
  /** Span-pick mode: the map is currently collecting anchor clicks. */
  pickMode: boolean;
  onBeginPick: () => void;
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
  onBeginPick,
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
          Redraw any stretch yourself — detection is only a helper.
        </CardDescription>
        <CardAction>
          {pickMode ? (
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
          ) : (
            <Button
              type="button"
              size="sm"
              className="h-8 gap-1.5"
              data-testid="begin-pick-button"
              onClick={onBeginPick}
            >
              <Crosshair className="size-3.5" aria-hidden="true" />
              New repair span
            </Button>
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-3">
        {pickMode && (
          <p
            className="rounded-md border border-emerald-600/30 bg-emerald-600/5 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400"
            data-testid="pick-instructions"
            role="status"
          >
            Click two points on the recorded route — the repair will connect
            them. Pan and zoom stay available; Esc cancels.
          </p>
        )}
        {visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No manual repairs yet. Start one anywhere on the route — a
            detour the watch drew straight, a stretch you want corrected —
            even when no gap was detected.
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
