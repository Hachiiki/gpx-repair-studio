/**
 * DrawEditorPanel — the reconstruction editor card (Phase 4 scope:
 * "DrawEditorPanel + UndoRedoBar", gap status transitions, straight-line
 * warning).
 *
 * Everything flows in as props from the `DrawEditorBinding` (the hook owns
 * all state): gap context, live distance, vertex list with per-row delete
 * (the keyboard/screen-reader path for the map's drag/double-click edits),
 * resample spacing (a setting, not a command — §D-3.5), the snap toggle,
 * and the skip/close intents.
 *
 * Pure presentation: props in, intents out — no store, domain, or map
 * imports (ESLint boundaries).
 */

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useEffect, useRef } from "react";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { HintTip } from "@/components/shared/hint-tip";
import { Crosshair, Trash2, TriangleAlert, X } from "lucide-react";
import { TOOLS_REVEAL_EVENT } from "@/components/layout/workspace-tools-column";
import {
  GAP_KIND_LABELS,
  GapSeverityBadge,
  GapStatusBadge,
} from "@/components/shared/gap-vocabulary";
import { UndoRedoBar } from "@/components/reconstruction/undo-redo-bar";
import { TimeStrategyControls } from "@/components/reconstruction/time-strategy-controls";
import { ElevationControls } from "@/components/reconstruction/elevation-controls";
import { ProvenanceBadge } from "@/components/statistics/provenance-badge";
import type { DrawEditorBinding } from "@/hooks/use-draw-editor";
import type { ElevationControlsBinding } from "@/hooks/use-elevation";
import type { DrawVertex } from "@/types/domain";
import {
  formatDistanceMeters,
  formatLatLon,
} from "@/lib/utils/format";

/** Selectable resample spacings shown in the settings row. */
const SPACING_CHOICES: readonly { value: string; label: string }[] = [
  { value: "off", label: "Off (points only)" },
  { value: "10", label: "Every 10 m" },
  { value: "25", label: "Every 25 m" },
  { value: "50", label: "Every 50 m" },
];

/**
 * Pen choices (user pass 48 — curve is a PEN, not a path style): how
 * the Draw mode captures points. The test ids follow the pointer-mode
 * family (`pen-mode-*`).
 */
const PEN_CHOICES: readonly {
  value: DrawEditorBinding["pen"];
  label: string;
  hint: string;
}[] = [
  {
    value: "default",
    label: "Default pen",
    hint: "The classic pencil: click to place points one by one — click before and after a bend and the line follows.",
  },
  {
    value: "curve",
    label: "Curve pen",
    hint: "Press and drag to draw a curve freehand — the app smooths your stroke into the line. Works with every path style; a quick tap still places a single point.",
  },
];

/**
 * Path-style choices (Tasks 46–47 — what the line does between your
 * points, remembered per line). User pass 48: Curves left the group —
 * it is the Curve pen's doing now, so the choices are Roads /
 * Footpaths / Straight. The test ids keep the historic `road-follow-*`
 * names for e2e compatibility.
 */
const PATH_STYLE_CHOICES: readonly {
  value: Exclude<DrawEditorBinding["pathStyle"], "curve">;
  label: string;
  hint: string;
}[] = [
  {
    value: "car",
    label: "Roads",
    hint: "The line follows drivable roads between your points — click before and after a curve and the bend draws itself.",
  },
  {
    value: "foot",
    label: "Footpaths",
    hint: "Same idea, but for pedestrian ways — trails, footpaths, stairs. Better for runs through parks or along rivers.",
  },
  {
    value: "off",
    label: "Straight lines",
    hint: "No road snapping — the line connects your points directly. Nothing leaves the browser. Lines drawn with the Curve pen stay smooth until redrawn.",
  },
];

function VertexRow({
  vertex,
  index,
  onDelete,
}: {
  vertex: DrawVertex;
  index: number;
  onDelete: (vertexId: DrawVertex["id"]) => void;
}) {
  return (
    <li
      className="flex items-center gap-2 rounded-[6px] border border-ink/10 bg-card px-2 py-1.5 text-xs transition-colors hover:bg-ink/[0.04]"
      data-testid="vertex-row"
    >
      <span className="grid size-[18px] shrink-0 place-items-center rounded-[4px] bg-ink/[0.06] text-[10px] font-bold text-shade">
        {index + 1}
      </span>
      <span className="font-mono text-[11px] text-ink/70">
        {formatLatLon(vertex.lat, vertex.lon)}
      </span>
      {vertex.snappedTo !== undefined && (
        <span
          className="rounded-[3px] border-[1.25px] border-signal bg-signal/10 px-1.5 py-px text-[10px] font-semibold text-ink"
          title={`Snapped to recorded point ${vertex.snappedTo}`}
        >
          snapped
        </span>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="ml-auto size-5 shrink-0 rounded-[4px] p-0 text-shade hover:bg-inkplus hover:text-paper"
        aria-label={`Delete point ${index + 1}`}
        data-testid="delete-vertex-button"
        onClick={() => onDelete(vertex.id)}
      >
        <X className="size-3.5" aria-hidden="true" />
      </Button>
    </li>
  );
}

export function DrawEditorPanel({
  draw,
  elevation = null,
}: {
  draw: DrawEditorBinding;
  /** Phase 6: the active gap's elevation controls (null → hidden). */
  elevation?: ElevationControlsBinding | null;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const gapId = draw.activeGap?.id ?? null;
  // User pass 52: the pen only lives in Draw mode — Move drags points,
  // Pan navigates. Outside Draw the pen group renders inert.
  const penLive = draw.pointerMode === "draw";

  /*
   * User pass 49 — the editor must be SEEN when it opens. In the repair
   * studio the panel inserts at the TOP of the tools column (above the
   * gap list the "Reconstruct" click lives in), which left the Pen and
   * path chips off-screen above the column's scroll position; in the
   * recovery studio it opened below the fold. When the editor opens or
   * switches to another gap, scroll the tools column to the panel's top
   * so the Pen group leads the view.
   *
   * The scroll targets the COLUMN only — at lg+ it is its own scroll
   * container (the sticky aside), so the map never moves out from under
   * the user's pointer. On smaller viewports the column doesn't scroll
   * (scrollHeight ≈ clientHeight) and nothing happens. Keyed on the gap
   * identity alone: drawing (vertex churn) never re-scrolls — the same
   * discipline the GapList row selection follows.
   *
   * The scroll is deferred one rAF: opening an editor also SELECTS the
   * gap, and the GapList row's selection effect scrolls itself into
   * view ("nearest") in this same effect flush. Both want the column,
   * and the editor is the destination the user asked for — so this
   * scroll goes last (still before the next paint: no visible flicker).
   */
  useEffect(() => {
    if (!gapId) return;
    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      if (cancelled) return;
      const el = cardRef.current;
      if (!el) return;
      const column = el.closest<HTMLElement>('[data-testid$="tools-panel"]');
      if (!column) return;
      if (column.scrollHeight <= column.clientHeight + 1) return;
      if (typeof column.scrollTo !== "function") return;
      const delta =
        el.getBoundingClientRect().top - column.getBoundingClientRect().top;
      column.scrollTo({
        top: Math.max(0, column.scrollTop + delta),
        behavior: "smooth",
      });
    });
    /*
     * Phase 8 — on touch-width viewports the "column" is the mobile
     * tools sheet's scroll container, and scrolling a COLLAPSED sheet
     * still hides the panel below its peek. The same reveal therefore
     * also asks the sheet to expand (the mobile twin of this scroll):
     * the Pen group must reach the user's thumb when an editor opens.
     */
    window.dispatchEvent(new CustomEvent(TOOLS_REVEAL_EVENT));
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [gapId]);

  if (!draw.active || !draw.activeGap) return null;
  const gap = draw.activeGap;
  const isManual = gap.kind === "manual" || gap.kind === "manual-insert";
  const openEnded = gap.before === undefined || gap.after === undefined;
  const near = gap.before ?? gap.after;

  return (
    <Card
      ref={cardRef}
      className="border-[1.5px] border-ink"
      data-testid="draw-editor-panel"
    >
      <CardHeader>
        <h3 className="flex items-center gap-2 text-[15.5px] font-bold leading-tight">
          <Crosshair className="size-4 text-signal" aria-hidden="true" />
          Reconstruct route
        </h3>
        <CardDescription className="flex flex-wrap items-center gap-1.5">
          {!isManual && <GapSeverityBadge severity={gap.severity} />}
          <span className="text-sm font-semibold">
            {GAP_KIND_LABELS[gap.kind]}
          </span>
          <GapStatusBadge status={draw.statusById[gap.id] ?? "in-progress"} />
        </CardDescription>
        <CardAction>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            aria-label="Close editor (keeps the drawn route)"
            data-testid="close-editor-button"
            onClick={draw.closeEditor}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        {/* Boundary context (one compact line each; open ends say so) —
            the Field Plot boundary box: quiet ink-tinted field. */}
        <div className="grid gap-[3px] rounded-lg border border-ink/15 bg-ink/[0.03] px-2.5 py-2 text-xs text-muted-foreground">
          <p>
            <span className="font-semibold text-ink">From</span>{" "}
            {gap.before ? (
              <span className="font-mono text-[11px]">
                {formatLatLon(gap.before.lat, gap.before.lon)}
              </span>
            ) : (
              <span className="italic">route start (open)</span>
            )}
          </p>
          <p>
            <span className="font-semibold text-ink">To</span>{" "}
            {gap.after ? (
              <span className="font-mono text-[11px]">
                {formatLatLon(gap.after.lat, gap.after.lon)}
              </span>
            ) : (
              <span className="italic">open — your clicks extend the route</span>
            )}
          </p>
        </div>

        {openEnded && near && (
          <p
            className="rounded-md border border-signal/40 bg-signal/5 px-3 py-2 text-xs text-ink"
            data-testid="open-end-instructions"
            role="status"
          >
            Click anywhere on the map to add the missing route — each click
            extends the line from {formatLatLon(near.lat, near.lon)}. What you
            see is exactly what the repair will be; nothing connects on its
            own.
          </p>
        )}

        {/* Pen (user pass 48): HOW the Draw mode captures points — the
            curve pen is freehand, the default pen is click-by-click.
            User pass 52: outside Draw mode the group is honestly INERT
            (chips dim and disable) — a chip that still looks "on" while
            the pointer is in Move or Pan reads as "drawing is active",
            and the pencil never drags, the dragger never draws. */}
        <div
          className="grid gap-2"
          data-testid="pen-mode-group"
          role="group"
          aria-label="Pen"
        >
          <p className="flex items-center gap-2 text-xs font-bold tracking-[0.01em]">
            Pen
            <span className="h-px flex-1 bg-ink/10" aria-hidden="true" />
          </p>
          <div className="flex flex-wrap gap-1.5">
            {PEN_CHOICES.map((choice) =>
              penLive ? (
                <HintTip
                  key={choice.value}
                  side="left"
                  title={choice.label}
                  description={choice.hint}
                >
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className={
                      draw.pen === choice.value
                        ? "h-auto rounded-full border-[1.25px] border-inkplus bg-inkplus px-3 py-[5px] text-[12.5px] font-semibold text-paper hover:bg-inkplus hover:text-paper"
                        : "h-auto rounded-full border-[1.25px] border-ink/25 bg-card px-3 py-[5px] text-[12.5px] font-semibold text-muted-foreground hover:bg-ink/[0.06] hover:text-ink"
                    }
                    aria-pressed={draw.pen === choice.value}
                    data-testid={`pen-mode-${choice.value}`}
                    onClick={() => draw.setPenMode(choice.value)}
                  >
                    {choice.label}
                  </Button>
                </HintTip>
              ) : (
                <span
                  key={choice.value}
                  className="inline-flex cursor-not-allowed"
                >
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled
                    className={
                      draw.pen === choice.value
                        ? "h-auto rounded-full border-[1.25px] border-inkplus bg-inkplus px-3 py-[5px] text-[12.5px] font-semibold text-paper"
                        : "h-auto rounded-full border-[1.25px] border-ink/25 bg-card px-3 py-[5px] text-[12.5px] font-semibold text-muted-foreground"
                    }
                    aria-pressed={draw.pen === choice.value}
                    data-testid={`pen-mode-${choice.value}`}
                  >
                    {choice.label}
                  </Button>
                </span>
              ),
            )}
          </div>
          {penLive && draw.pen === "curve" && (
            <p
              className="text-[11px] leading-snug text-muted-foreground"
              data-testid="pen-curve-hint"
              role="status"
            >
              Drag on the map to draw your curve — release to place it. A
              quick tap still adds a single point. (C toggles pens, D/M/P
              switch modes.)
            </p>
          )}
          {!penLive && (
            <p
              className="text-[11px] leading-snug text-muted-foreground"
              data-testid="pen-inactive-note"
              role="status"
            >
              The pen works in Draw mode only — press D (or the pencil tool)
              to draw. Right now the pointer {draw.pointerMode === "move"
                ? "drags your points"
                : "navigates the map"}
              .
            </p>
          )}
        </div>

        {/* Path style: what the line does between your points (per line). */}
        <div
          className="grid gap-2"
          data-testid="road-follow-group"
          role="group"
          aria-label="Path style"
        >
          <p className="flex items-center gap-2 text-xs font-bold tracking-[0.01em]">
            Between points, follow
            <span className="h-px flex-1 bg-ink/10" aria-hidden="true" />
          </p>
          <div className="flex flex-wrap gap-1.5">
            {PATH_STYLE_CHOICES.map((choice) => (
              <HintTip
                key={choice.value}
                side="left"
                title={choice.label}
                description={choice.hint}
              >
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className={
                    draw.pathStyle === choice.value ||
                    // A curve-pen line is local like straight — the chip
                    // reads as its home; tapping it flattens the line.
                    (choice.value === "off" && draw.pathStyle === "curve")
                      ? "h-auto rounded-full border-[1.25px] border-inkplus bg-inkplus px-3 py-[5px] text-[12.5px] font-semibold text-paper hover:bg-inkplus hover:text-paper"
                      : "h-auto rounded-full border-[1.25px] border-ink/25 bg-card px-3 py-[5px] text-[12.5px] font-semibold text-muted-foreground hover:bg-ink/[0.06] hover:text-ink"
                  }
                  aria-pressed={
                    draw.pathStyle === choice.value ||
                    (choice.value === "off" && draw.pathStyle === "curve")
                  }
                  data-testid={`road-follow-${choice.value}`}
                  onClick={() => draw.setPathStyle(choice.value)}
                >
                  {choice.label}
                </Button>
              </HintTip>
            ))}
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Click or drag before and after a curve — the line snaps to the
            road between your points. Roads/Footpaths send only the points
            you place to a public routing service (OSRM / Valhalla); your
            GPX file never leaves this browser. The Curve pen and Straight
            lines are fully local.
          </p>
          {(draw.pathStyle === "car" || draw.pathStyle === "foot") && (
            <p
              className="text-[11px] text-muted-foreground"
              data-testid="road-follow-status"
              role="status"
            >
              {draw.routingPending
                ? "Finding the road…"
                : draw.routingFailed
                  ? "Road follow unavailable right now — straight lines until it recovers."
                  : draw.pointerMode === "move"
                    ? "Drag any point to adjust it — the road re-finds itself."
                    : "Switch to Move (M) to drag a point — the road re-finds itself."}
            </p>
          )}
        </div>

        {/* Phase 5: the §J-1 time plan for this gap (strategy, duration,
            estimated pace, Case-4 discrepancy). Task 28: the recovery
            section's file pace (when present) adds the "From your pace"
            strategy — the repair studio never provides one, so its chips
            are unchanged. */}
        {draw.timePlan && (
          <TimeStrategyControls
            plan={draw.timePlan}
            distanceM={draw.distanceM}
            vertexCount={draw.vertexCount}
            setTimeStrategy={draw.setTimeStrategy}
            paceAvailable={(draw.fileTiming.recordedSpeedMps ?? 0) > 0}
          />
        )}

        {/* Phase 6: opt-in elevation estimation for this gap (disclosure
            first, staleness + partials honestly labeled). */}
        {elevation && <ElevationControls elevation={elevation} />}

        {/* Live stats: distance + vertex cap — the big stenciled
            numeral (mockup .bigstat). */}
        <div className="grid gap-1">
          <p className="flex flex-wrap items-baseline gap-2.5" data-testid="draw-distance">
            <span className="font-display text-[40px] font-bold leading-none tabular-nums">
              {draw.distanceM === null
                ? "—"
                : formatDistanceMeters(draw.distanceM)}
            </span>
            <ProvenanceBadge kind="estimated" />
          </p>
          <p
            className="text-[11.5px] tabular-nums text-muted-foreground"
            data-testid="vertex-count"
          >
            {draw.vertexCount} / {draw.maxVertices} points
            {draw.atVertexCap ? " — limit reached" : ""}
          </p>
        </div>

        {draw.straightLine && draw.vertexCount > 0 && (
          <Alert
            className="rounded-lg border-signal bg-signal/[0.08]"
            data-testid="straight-line-warning"
          >
            <TriangleAlert className="size-4" aria-hidden="true" />
            <AlertTitle>Nearly a straight line</AlertTitle>
            <AlertDescription>
              Every point sits almost exactly between the two anchors. That
              is fine if you ran straight — otherwise trace the actual route
              on the map so the repair stays honest.
            </AlertDescription>
          </Alert>
        )}

        <UndoRedoBar
          canUndo={draw.canUndo}
          canRedo={draw.canRedo}
          undoCount={draw.undoCount}
          redoCount={draw.redoCount}
          canClear={draw.vertexCount > 0}
          onUndo={draw.undo}
          onRedo={draw.redo}
          onClear={draw.clearVertices}
        />

        {/* Settings row: spacing + snap. */}
        <div className="grid gap-2 sm:grid-cols-2">
          <label
            className="grid gap-1 text-xs font-semibold"
            data-testid="spacing-select-label"
            title="After you finish, the app densifies your drawing into evenly spaced points with this spacing — some platforms want regular points."
          >
            Resample spacing
            <select
              className="h-8 rounded-[5px] border-[1.25px] border-ink/25 bg-card px-2.5 text-xs font-normal transition-colors hover:border-ink/45 focus-visible:border-signal focus-visible:outline-none"
              data-testid="spacing-select"
              value={String(draw.resampleSpacing)}
              onChange={(event) => {
                const raw = event.target.value;
                draw.setResampleSpacing(raw === "off" ? "off" : Number(raw));
              }}
            >
              {SPACING_CHOICES.map((choice) => (
                <option key={choice.value} value={choice.value}>
                  {choice.label}
                </option>
              ))}
            </select>
          </label>
          <label
            className="flex items-center gap-2 self-end text-xs font-medium"
            data-testid="snap-toggle-label"
            title="Clicks near a recorded point land exactly on it — handy when tying your repair into the original route."
          >
            <Checkbox
              checked={draw.snapEnabled}
              onCheckedChange={(checked) => draw.setSnapEnabled(checked === true)}
              aria-label="Snap drawn points to recorded route points"
              data-testid="snap-toggle"
            />
            Snap to recorded points
          </label>
        </div>

        {/* Vertex list: the accessible delete path. */}
        {draw.vertexCount > 0 && (
          <div className="grid gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              Drawn points — switch to Move (M) and drag any of them on the
              map, double-click to remove. Drawing (D) adds points only —
              the pencil never drags.
            </p>
            <ScrollArea className="max-h-40 -mx-2">
              <ul className="grid gap-0.5 px-2">
                {draw.vertices.map((vertex, index) => (
                  <VertexRow
                    key={vertex.id}
                    vertex={vertex}
                    index={index}
                    onDelete={draw.deleteVertex}
                  />
                ))}
              </ul>
            </ScrollArea>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-ink/10 pt-3">
          {isManual ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 text-muted-foreground hover:text-destructive"
              data-testid="remove-span-button"
              onClick={() => draw.removeManualSpan(gap.id)}
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              Remove repair span
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 text-muted-foreground hover:text-foreground"
              data-testid="skip-gap-button"
              onClick={draw.toggleSkip}
            >
              Mark as skipped
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            className="h-8"
            data-testid="done-editing-button"
            onClick={draw.closeEditor}
          >
            Done
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
