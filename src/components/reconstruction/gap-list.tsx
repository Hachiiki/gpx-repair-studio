/**
 * GapList — textual listing of detected repair sites (Phase 2) with
 * selection sync (Phase 3) and repair status + editor actions (Phase 4).
 *
 * Rows show kind, severity, elapsed time, straight-line diagnostics, and
 * the boundary points' coordinates and timestamps. Selecting a row
 * highlights the gap on the map and focuses it; the per-row action button
 * opens the draw editor (selecting the gap in the process). The derived
 * repair status (new / editing / reconstructed / skipped) arrives via the
 * `statusById` join from the draw-editor binding.
 */

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CircleCheck, PenLine } from "lucide-react";
import { useEffect, useRef } from "react";
import { GapThresholdSettings } from "@/components/gpx/gap-threshold-settings";
import {
  GAP_KIND_LABELS,
  GapSeverityBadge,
  GapStatusBadge,
} from "@/components/shared/gap-vocabulary";
import type { GapRow, GapThresholds } from "@/hooks/use-gpx-session";
import type { GapStatus } from "@/state/editor-store";
import type { GapId } from "@/types/domain";
import {
  formatDateTime,
  formatDistanceMeters,
  formatDurationMs,
  formatLatLon,
  formatSpeedKmh,
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
      <span className="font-mono">{formatLatLon(point.lat, point.lon)}</span>{" "}
      <span className="font-mono text-[11px]">({point.pointId})</span>
    </p>
  );
}

/**
 * One selectable gap row. `scrollIntoView` fires only on the
 * false→true selection *transition* (a `useEffect` on `selected`) — the
 * previous inline-ref variant re-scrolled on every list re-render, which
 * mid-drawing scrolled the page (and the map canvas) out from under the
 * user's pointer whenever the editor panel changed shape.
 */
function GapRowItem({
  row,
  selected,
  status,
  onSelect,
  onOpenEditor,
  showOpenEditor,
}: {
  row: GapRow;
  selected: boolean;
  status: GapStatus;
  onSelect: (gapId: GapId | null) => void;
  onOpenEditor?: (gapId: GapId) => void;
  showOpenEditor: boolean;
}) {
  const rowRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (selected && typeof rowRef.current?.scrollIntoView === "function") {
      rowRef.current.scrollIntoView({ block: "nearest" });
    }
  }, [selected]);

  const hasVertices = status === "reconstructed" || status === "in-progress";
  return (
    <div
      data-gap-row-container
      className={`grid gap-1 rounded-lg border px-3 py-2.5 text-left transition-colors ${
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary/40"
          : ""
      }`}
    >
      <button
        type="button"
        ref={rowRef}
        data-testid="gap-row"
        data-selected={selected}
        aria-pressed={selected}
        aria-label={`Gap ${GAP_KIND_LABELS[row.kind]}, ${row.severity}. ${selected ? "Deselect" : "Select and focus on map"}.`}
        className={`grid w-full gap-1.5 rounded-md text-left focus-visible:outline-2 ${
          selected ? "" : "hover:bg-accent"
        }`}
        onClick={() => onSelect(selected ? null : row.id)}
      >
        <span className="flex flex-wrap items-center gap-2">
          <GapSeverityBadge severity={row.severity} />
          <span className="text-sm font-medium">
            {GAP_KIND_LABELS[row.kind]}
          </span>
          {status !== "new" && <GapStatusBadge status={status} />}
          <span className="ml-auto text-sm tabular-nums">
            {row.elapsedMs !== undefined
              ? `${formatDurationMs(row.elapsedMs)} elapsed`
              : "elapsed unknown"}
          </span>
        </span>
        <BoundaryLine role="From" point={row.before} />
        <BoundaryLine role="To" point={row.after} />
        <span className="text-xs text-muted-foreground">
          Straight-line:{" "}
          {row.impliedDistanceM !== undefined
            ? formatDistanceMeters(row.impliedDistanceM)
            : "—"}
          {row.impliedSpeed !== undefined && (
            <>
              {" "}
              · implied speed {formatSpeedKmh(row.impliedSpeed * 3.6)}
            </>
          )}
        </span>
      </button>
      {showOpenEditor && onOpenEditor && (
        <button
          type="button"
          data-testid="open-editor-button"
          className="flex w-fit items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-600/10 focus-visible:outline-2 dark:text-emerald-400"
          onClick={() => onOpenEditor(row.id)}
        >
          <PenLine className="size-3.5" aria-hidden="true" />
          {hasVertices ? "Edit route" : "Draw route"}
        </button>
      )}
    </div>
  );
}

export interface GapListProps {
  rows: readonly GapRow[];
  thresholds: GapThresholds;
  onThresholdsChange: (patch: Partial<GapThresholds>) => void;
  onThresholdsReset: () => void;
  /** The gap currently highlighted on the map (shared selection). */
  selectedGapId: GapId | null;
  /** Select (or, when already selected, deselect) a gap. */
  onSelectGap: (gapId: GapId | null) => void;
  /** Derived repair status per gap id (Phase 4; omitted = all "new"). */
  statusById?: Readonly<Record<string, GapStatus>>;
  /** Open the draw editor for a gap (Phase 4; omitted hides the buttons). */
  onOpenEditor?: (gapId: GapId) => void;
  /**
   * Start a manual repair span (draw-anywhere). Offered exactly where it
   * matters most: the empty state of a clean-looking file.
   */
  onBeginPick?: () => void;
}

export function GapList({
  rows,
  thresholds,
  onThresholdsChange,
  onThresholdsReset,
  selectedGapId,
  onSelectGap,
  statusById,
  onOpenEditor,
  onBeginPick,
}: GapListProps) {
  return (
    <Card data-testid="gap-list">
      <CardHeader>
        <h3 className="leading-none font-semibold">Detected gaps</h3>
        <CardDescription>
          {rows.length === 1
            ? "1 candidate repair site"
            : `${rows.length} candidate repair sites`}
        </CardDescription>
        <CardAction>
          <GapThresholdSettings
            thresholds={thresholds}
            onThresholdsChange={onThresholdsChange}
            onReset={onThresholdsReset}
          />
        </CardAction>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="grid gap-2">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CircleCheck
                className="size-4 shrink-0 text-emerald-600"
                aria-hidden="true"
              />
              No gaps detected with the current thresholds.
            </p>
            {onBeginPick && (
              <button
                type="button"
                data-testid="empty-list-begin-pick"
                className="flex w-fit items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-600/10 focus-visible:outline-2 dark:text-emerald-400"
                onClick={onBeginPick}
              >
                <PenLine className="size-3.5" aria-hidden="true" />
                Something still looks wrong? Draw a repair manually
              </button>
            )}
          </div>
        ) : (
          <ScrollArea className="max-h-96 -mx-2">
            <ul className="grid gap-3 px-2">
              {rows.map((row) => (
                <li key={row.id}>
                  <GapRowItem
                    row={row}
                    selected={row.id === selectedGapId}
                    status={statusById?.[row.id] ?? "new"}
                    onSelect={onSelectGap}
                    onOpenEditor={onOpenEditor}
                    showOpenEditor={onOpenEditor !== undefined}
                  />
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
