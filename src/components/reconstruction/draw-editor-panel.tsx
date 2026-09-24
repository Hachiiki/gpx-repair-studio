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
import { Crosshair, Trash2, TriangleAlert, X } from "lucide-react";
import {
  GAP_KIND_LABELS,
  GapSeverityBadge,
  GapStatusBadge,
} from "@/components/shared/gap-vocabulary";
import { UndoRedoBar } from "@/components/reconstruction/undo-redo-bar";
import { ProvenanceBadge } from "@/components/statistics/provenance-badge";
import type { DrawEditorBinding } from "@/hooks/use-draw-editor";
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
      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent"
      data-testid="vertex-row"
    >
      <span className="w-6 shrink-0 text-right font-mono text-muted-foreground">
        {index + 1}.
      </span>
      <span className="font-mono">{formatLatLon(vertex.lat, vertex.lon)}</span>
      {vertex.snappedTo !== undefined && (
        <span
          className="rounded bg-emerald-600/10 px-1 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400"
          title={`Snapped to recorded point ${vertex.snappedTo}`}
        >
          snapped
        </span>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="ml-auto h-6 w-6 shrink-0 p-0 text-muted-foreground hover:text-destructive"
        aria-label={`Delete point ${index + 1}`}
        data-testid="delete-vertex-button"
        onClick={() => onDelete(vertex.id)}
      >
        <X className="size-3.5" aria-hidden="true" />
      </Button>
    </li>
  );
}

export function DrawEditorPanel({ draw }: { draw: DrawEditorBinding }) {
  if (!draw.active || !draw.activeGap) return null;
  const gap = draw.activeGap;
  const isManual = gap.kind === "manual";

  return (
    <Card data-testid="draw-editor-panel">
      <CardHeader>
        <h3 className="flex items-center gap-2 leading-none font-semibold">
          <Crosshair className="size-4 text-emerald-600" aria-hidden="true" />
          Reconstruct route
        </h3>
        <CardDescription className="flex flex-wrap items-center gap-1.5">
          {!isManual && <GapSeverityBadge severity={gap.severity} />}
          <span className="text-sm font-medium">
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
        {/* Boundary context (one compact line each). */}
        <div className="grid gap-0.5 text-xs text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">From</span>{" "}
            <span className="font-mono">
              {formatLatLon(gap.before.lat, gap.before.lon)}
            </span>
          </p>
          <p>
            <span className="font-medium text-foreground">To</span>{" "}
            <span className="font-mono">
              {formatLatLon(gap.after.lat, gap.after.lon)}
            </span>
          </p>
        </div>

        {/* Live stats: distance + vertex cap. */}
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <p className="flex items-baseline gap-1.5" data-testid="draw-distance">
            <span className="text-2xl font-semibold tabular-nums">
              {draw.distanceM === null
                ? "—"
                : formatDistanceMeters(draw.distanceM)}
            </span>
            <ProvenanceBadge kind="estimated" />
          </p>
          <p
            className="text-xs tabular-nums text-muted-foreground"
            data-testid="vertex-count"
          >
            {draw.vertexCount} / {draw.maxVertices} points
            {draw.atVertexCap ? " — limit reached" : ""}
          </p>
        </div>

        {draw.straightLine && draw.vertexCount > 0 && (
          <Alert data-testid="straight-line-warning">
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
          <label className="grid gap-1 text-xs font-medium" data-testid="spacing-select-label">
            Resample spacing
            <select
              className="h-8 rounded-md border border-input bg-transparent px-2 text-xs font-normal"
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
              Drawn points
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

        <div className="flex items-center justify-between gap-2 border-t pt-3">
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
