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
 * Path-style choices (Tasks 46–47 — what the line does between your
 * clicks, remembered per line). The test ids keep the historic
 * `road-follow-*` names for e2e compatibility.
 */
const PATH_STYLE_CHOICES: readonly {
  value: DrawEditorBinding["pathStyle"];
  label: string;
  hint: string;
}[] = [
  {
    value: "car",
    label: "Roads",
    hint: "The line follows drivable roads between your clicks — click before and after a curve and the bend draws itself.",
  },
  {
    value: "foot",
    label: "Footpaths",
    hint: "Same idea, but for pedestrian ways — trails, footpaths, stairs. Better for runs through parks or along rivers.",
  },
  {
    value: "curve",
    label: "Curves",
    hint: "A smooth spline bends through your points — no snapping, no network, nothing leaves the browser. The curve is baked into the exported file.",
  },
  {
    value: "off",
    label: "Straight lines",
    hint: "No road snapping — the line connects your clicks directly. Nothing leaves the browser in this mode.",
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
  if (!draw.active || !draw.activeGap) return null;
  const gap = draw.activeGap;
  const isManual = gap.kind === "manual" || gap.kind === "manual-insert";
  const openEnded = gap.before === undefined || gap.after === undefined;
  const near = gap.before ?? gap.after;

  return (
    <Card
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

        {/* Path style: what the line does between clicks (per line). */}
        <div
          className="grid gap-2"
          data-testid="road-follow-group"
          role="group"
          aria-label="Path style"
        >
          <p className="flex items-center gap-2 text-xs font-bold tracking-[0.01em]">
            Between clicks, follow
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
                    draw.pathStyle === choice.value
                      ? "h-auto rounded-full border-[1.25px] border-inkplus bg-inkplus px-3 py-[5px] text-[12.5px] font-semibold text-paper hover:bg-inkplus hover:text-paper"
                      : "h-auto rounded-full border-[1.25px] border-ink/25 bg-card px-3 py-[5px] text-[12.5px] font-semibold text-muted-foreground hover:bg-ink/[0.06] hover:text-ink"
                  }
                  aria-pressed={draw.pathStyle === choice.value}
                  data-testid={`road-follow-${choice.value}`}
                  onClick={() => draw.setPathStyle(choice.value)}
                >
                  {choice.label}
                </Button>
              </HintTip>
            ))}
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Click before and after a curve — the line snaps to the road
            between your clicks. Roads/Footpaths send only the points you
            click to a public routing service (OSRM / Valhalla); your GPX
            file never leaves this browser.
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
                  : "Drag any point to adjust it — the road re-finds itself."}
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
              map, double-click to remove
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
