/**
 * RouteDrawPanel — the "create from activity stats" route editor card
 * (Step 2).
 *
 * The create section's counterpart of the repair studio's
 * DrawEditorPanel: the same road-follow chips, live distance + vertex
 * cap, undo/redo bar, resample spacing, and the accessible vertex list —
 * minus the gap vocabulary (there is no gap), the snap toggle (nothing to
 * snap to), and the §J-1 time strategy (the duration comes from the
 * entered statistics, period). Instead it carries the live
 * drawn-vs-recorded distance comparison (the reconciliation's
 * pre-announcement) and the "Finish route" intent that ends the drawing
 * phase.
 *
 * Pure presentation: the {@link CreateDrawBinding} in, intents out.
 */

"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { HintTip } from "@/components/shared/hint-tip";
import { UndoRedoBar } from "@/components/reconstruction/undo-redo-bar";
import { ProvenanceBadge } from "@/components/statistics/provenance-badge";
import { Check, Crosshair, X } from "lucide-react";
import type { CreateDrawBinding } from "@/hooks/use-create-draw";
import type { ActivityStats } from "@/hooks/use-create-session";
import { RECONCILE_NOTICE_RATIO } from "@/hooks/use-create-session";
import type { DrawVertex } from "@/types/domain";
import {
  formatDistanceForUnit,
  formatLatLon,
  type PaceUnit,
} from "@/lib/utils/format";

/** Selectable resample spacings shown in the settings row. */
const SPACING_CHOICES: readonly { value: string; label: string }[] = [
  { value: "off", label: "Off (clicked points only)" },
  { value: "10", label: "Every 10 m" },
  { value: "25", label: "Every 25 m" },
  { value: "50", label: "Every 50 m" },
];

/**
 * Pen choices (user pass 48 — curve is a PEN, not a path style): how
 * the Draw mode captures points.
 */
const PEN_CHOICES: readonly {
  value: CreateDrawBinding["pen"];
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
    hint: "Press and drag to draw a curve freehand — the app smooths your stroke into the route. Works with every path style; a quick tap still places a single point.",
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
  value: Exclude<CreateDrawBinding["pathStyle"], "curve">;
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
    hint: "No road snapping — the line connects your points directly. Nothing leaves the browser. Routes drawn with the Curve pen stay smooth until redrawn.",
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
      data-testid="create-vertex-row"
    >
      <span className="grid size-[18px] shrink-0 place-items-center rounded-[4px] bg-ink/[0.06] text-[10px] font-bold text-shade">
        {index + 1}
      </span>
      <span className="font-mono text-[11px] text-ink/70">
        {formatLatLon(vertex.lat, vertex.lon)}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="ml-auto size-5 shrink-0 rounded-[4px] p-0 text-shade hover:bg-inkplus hover:text-paper"
        aria-label={`Delete point ${index + 1}`}
        data-testid="create-delete-vertex-button"
        onClick={() => onDelete(vertex.id)}
      >
        <X className="size-3.5" aria-hidden="true" />
      </Button>
    </li>
  );
}

export interface RouteDrawPanelProps {
  draw: CreateDrawBinding;
  stats: ActivityStats;
  paceUnit: PaceUnit;
}

export function RouteDrawPanel({ draw, stats, paceUnit }: RouteDrawPanelProps) {
  if (!draw.active) return null;

  // The live drawn-vs-recorded comparison — the reconciliation's
  // pre-announcement (the review phase formalizes it). The same 2% ratio
  // the reconciliation uses, so "matches" live means "matches" at review.
  const drawnM = draw.distanceM ?? 0;
  const differenceM = drawnM - stats.distanceM;
  const comparison =
    draw.distanceM === null
      ? "Click on the map to place your first point."
      : drawnM === 0
        ? "Keep going — one more point makes the first leg."
        : Math.abs(differenceM) / Math.max(stats.distanceM, 1) <=
            RECONCILE_NOTICE_RATIO
          ? "Matches your recorded distance."
          : `${differenceM > 0 ? "Longer" : "Shorter"} than your recorded ${formatDistanceForUnit(
              stats.distanceM,
              paceUnit,
            )} by ${formatDistanceForUnit(Math.abs(differenceM), paceUnit)} — the file will carry what you draw.`;

  return (
    <Card className="border-[1.5px] border-ink" data-testid="route-draw-panel">
      <CardHeader>
        <h3 className="flex items-center gap-2 text-[15.5px] font-bold leading-tight">
          <Crosshair className="size-4 text-signal" aria-hidden="true" />
          Your route
        </h3>
        <CardDescription>
          Click to add points — switch to Move (M) to drag any of them,
          everything undoes.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {/* Pen (user pass 48): HOW the Draw mode captures points. */}
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
            {PEN_CHOICES.map((choice) => (
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
            ))}
          </div>
          {draw.pointerMode === "draw" && draw.pen === "curve" && (
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
                    // A curve-pen route is local like straight — the chip
                    // reads as its home; tapping it flattens the route.
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

        {/* Live stats: drawn distance vs the recorded target. */}
        <div className="grid gap-1">
          <p className="flex flex-wrap items-baseline gap-2.5" data-testid="draw-distance">
            <span className="font-display text-[40px] font-bold leading-none tabular-nums">
              {draw.distanceM === null
                ? "—"
                : formatDistanceForUnit(drawnM, paceUnit)}
            </span>
            <ProvenanceBadge kind="estimated" />
          </p>
          <p
            className="text-[11.5px] leading-snug tabular-nums text-muted-foreground"
            data-testid="drawn-vs-recorded"
          >
            {comparison}
          </p>
          <p
            className="text-[11.5px] tabular-nums text-muted-foreground"
            data-testid="vertex-count"
          >
            {draw.vertexCount} / {draw.maxVertices} points
            {draw.atVertexCap ? " — limit reached" : ""}
          </p>
        </div>

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

        {/* Settings row: the generated track's point spacing. */}
        <label
          className="grid gap-1 text-xs font-semibold"
          data-testid="spacing-select-label"
          title="The track is generated with evenly spaced points at this spacing — some platforms want regular points rather than only your clicks."
        >
          Track point spacing
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

        <div className="border-t border-ink/10 pt-3">
          <Button
            type="button"
            size="sm"
            className="h-9 w-full gap-1.5"
            data-testid="finish-route-button"
            onClick={draw.finishRoute}
            disabled={!draw.canFinish}
            title={
              draw.canFinish
                ? "End the drawing and review the result"
                : "Place at least two points to finish the route"
            }
          >
            <Check className="size-4" aria-hidden="true" />
            Finish route
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
