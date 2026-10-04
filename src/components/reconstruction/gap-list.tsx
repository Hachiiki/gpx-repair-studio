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
import { useI18n } from "@/hooks/use-i18n";
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
  const { t } = useI18n();
  return (
    <p className="text-[11.5px] leading-relaxed text-muted-foreground">
      <span className="font-semibold text-ink">{role}</span>{" "}
      {point.time !== undefined ? formatDateTime(point.time) : t("gapList.noTime")} ·{" "}
      <span className="font-mono text-[10.5px]">{formatLatLon(point.lat, point.lon)}</span>{" "}
      <span className="font-mono text-[10.5px] text-ink/70">({point.pointId})</span>
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
  const { t } = useI18n();

  useEffect(() => {
    if (selected && typeof rowRef.current?.scrollIntoView === "function") {
      rowRef.current.scrollIntoView({ block: "nearest" });
    }
  }, [selected]);

  const hasVertices = status === "reconstructed" || status === "in-progress";
  return (
    <div
      data-gap-row-container
      className={`grid gap-1.5 rounded-[9px] border-[1.25px] px-3 py-2.5 text-left transition-colors duration-150 ${
        selected
          ? "border-[1.75px] border-signal bg-signal/[0.08]"
          : "border-ink/15"
      }`}
    >
      <button
        type="button"
        ref={rowRef}
        data-testid="gap-row"
        data-selected={selected}
        aria-pressed={selected}
        aria-label={t("gapList.rowAria", {
          kind: GAP_KIND_LABELS[row.kind],
          severity: row.severity,
          action: selected
            ? t("gapList.deselect")
            : t("gapList.selectFocus"),
        })}
        className={`grid w-full gap-1.5 rounded-[6px] text-left focus-visible:outline-2 ${
          selected ? "" : "hover:bg-ink/[0.04]"
        }`}
        onClick={() => onSelect(selected ? null : row.id)}
      >
        <span className="flex flex-wrap items-center gap-2">
          <GapSeverityBadge severity={row.severity} />
          <span className="text-[13px] font-semibold">
            {GAP_KIND_LABELS[row.kind]}
          </span>
          {status !== "new" && <GapStatusBadge status={status} />}
          <span className="ml-auto text-[12.5px] font-bold tabular-nums">
            {row.elapsedMs !== undefined
              ? t("gapList.elapsed", { duration: formatDurationMs(row.elapsedMs) })
              : t("gapList.elapsedUnknown")}
          </span>
        </span>
        <BoundaryLine role={t("gapList.from")} point={row.before} />
        <BoundaryLine role={t("gapList.to")} point={row.after} />
        <span className="text-[11.5px] leading-relaxed text-muted-foreground">
          {t("gapList.straightLine")}{" "}
          {row.impliedDistanceM !== undefined
            ? formatDistanceMeters(row.impliedDistanceM)
            : "—"}
          {row.impliedSpeed !== undefined && (
            <>
              {" "}
              {t("gapList.impliedSpeed", {
                speed: formatSpeedKmh(row.impliedSpeed * 3.6),
              })}
            </>
          )}
        </span>
      </button>
      {showOpenEditor && onOpenEditor && (
        <button
          type="button"
          data-testid="open-editor-button"
          className="flex w-fit items-center gap-1.5 rounded-[5px] px-2 py-1 text-[12.5px] font-bold text-signal-ink hover:bg-signal/10 hover:underline hover:underline-offset-[3px] focus-visible:outline-2"
          onClick={() => onOpenEditor(row.id)}
        >
          <PenLine className="size-3.5" aria-hidden="true" />
          {hasVertices ? t("gapList.editRoute") : t("gapList.drawRoute")}
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
  /**
   * A draw editor session is open (user pass 36): the cross-link
   * disables alongside the manual-repairs card's tools — one repair
   * at a time.
   */
  editorActive?: boolean;
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
  editorActive = false,
}: GapListProps) {
  const { t } = useI18n();
  return (
    <Card data-testid="gap-list">
      <CardHeader>
        <h3 className="flex items-center gap-2 text-[15.5px] font-bold leading-tight">
          <span className="size-2 shrink-0 rounded-[1px] bg-signal" aria-hidden="true" />
          {t("gapList.title")}
        </h3>
        <CardDescription>
          {rows.length === 1
            ? t("gapList.oneSite")
            : t("gapList.manySites", { count: rows.length })}
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
                className="size-4 shrink-0 text-signal"
                aria-hidden="true"
              />
              {t("gapList.empty")}
            </p>
            {onBeginPick && (
              <button
                type="button"
                data-testid="empty-list-begin-pick"
                className="flex w-fit items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-signal-ink hover:bg-signal/10 focus-visible:outline-2 disabled:pointer-events-none disabled:opacity-50"
                disabled={editorActive}
                title={
                  editorActive ? t("gapList.editorOpenTitle") : undefined
                }
                onClick={onBeginPick}
              >
                <PenLine className="size-3.5" aria-hidden="true" />
                {t("gapList.beginPick")}
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
