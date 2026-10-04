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
import { Crosshair, Milestone, Trash2, TriangleAlert, X } from "lucide-react";
import { TOOLS_REVEAL_EVENT } from "@/components/layout/workspace-tools-column";
import {
  GAP_KIND_LABELS,
  GapSeverityBadge,
  GapStatusBadge,
} from "@/components/shared/gap-vocabulary";
import { UndoRedoBar } from "@/components/reconstruction/undo-redo-bar";
import { TimeStrategyControls } from "@/components/reconstruction/time-strategy-controls";
import { ElevationControls } from "@/components/reconstruction/elevation-controls";
import { VertexEntryList } from "@/components/reconstruction/vertex-entry-list";
import { ProvenanceBadge } from "@/components/statistics/provenance-badge";
import type { DrawEditorBinding } from "@/hooks/use-draw-editor";
import type { ElevationControlsBinding } from "@/hooks/use-elevation";
import type { DrawVertex } from "@/types/domain";
import {
  formatDistanceMeters,
  formatLatLon,
} from "@/lib/utils/format";
import { useI18n, type TranslatorArg } from "@/hooks/use-i18n";

/** A signed, compact delta ("+630 m" / "−12 m" / "±0 m"). */
function formatDeltaMeters(meters: number): string {
  if (!Number.isFinite(meters)) return "—";
  const rounded = Math.round(meters);
  if (rounded === 0) return "±0 m";
  return `${rounded > 0 ? "+" : "−"}${formatDistanceMeters(Math.abs(rounded))}`;
}

/** Selectable resample spacings shown in the settings row. */
function getSpacingChoices(
  t: TranslatorArg,
): readonly { value: string; label: string }[] {
  return [
    { value: "off", label: t("drawEditor.spacing.off") },
    { value: "10", label: t("drawEditor.spacing.every", { meters: 10 }) },
    { value: "25", label: t("drawEditor.spacing.every", { meters: 25 }) },
    { value: "50", label: t("drawEditor.spacing.every", { meters: 50 }) },
  ];
}

/**
 * Pen choices (user pass 48 — curve is a PEN, not a path style): how
 * the Draw mode captures points. The test ids follow the pointer-mode
 * family (`pen-mode-*`).
 */
function getPenChoices(
  t: TranslatorArg,
): readonly {
  value: DrawEditorBinding["pen"];
  label: string;
  hint: string;
}[] {
  return [
    {
      value: "default",
      label: t("drawEditor.pen.default"),
      hint: t("drawEditor.pen.defaultHint"),
    },
    {
      value: "curve",
      label: t("drawEditor.pen.curve"),
      hint: t("drawEditor.pen.curveHint"),
    },
  ];
}

/**
 * Path-style choices (Tasks 46–47 — what the line does between your
 * points, remembered per line). User pass 48: Curves left the group —
 * it is the Curve pen's doing now, so the choices are Roads /
 * Footpaths / Straight. The test ids keep the historic `road-follow-*`
 * names for e2e compatibility.
 */
function getPathStyleChoices(
  t: TranslatorArg,
): readonly {
  value: Exclude<DrawEditorBinding["pathStyle"], "curve">;
  label: string;
  hint: string;
}[] {
  return [
    {
      value: "car",
      label: t("drawEditor.pathStyle.roads"),
      hint: t("drawEditor.pathStyle.roadsHint"),
    },
    {
      value: "foot",
      label: t("drawEditor.pathStyle.footpaths"),
      hint: t("drawEditor.pathStyle.footpathsHint"),
    },
    {
      value: "off",
      label: t("drawEditor.pathStyle.straight"),
      hint: t("drawEditor.pathStyle.straightHint"),
    },
  ];
}

export function DrawEditorPanel({
  draw,
  elevation = null,
}: {
  draw: DrawEditorBinding;
  /** Phase 6: the active gap's elevation controls (null → hidden). */
  elevation?: ElevationControlsBinding | null;
}) {
  const { t } = useI18n();
  const penChoices = getPenChoices(t);
  const pathStyleChoices = getPathStyleChoices(t);
  const spacingChoices = getSpacingChoices(t);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const gapId = draw.activeGap?.id ?? null;
  // User pass 52: the pen only lives in Draw mode — Move drags points,
  // Pan navigates. Outside Draw the pen group renders inert.
  const penLive = draw.pointerMode === "draw";
  /*
   * §EE 17.3 (the VLM probe's confirmed claim): when the snap preview
   * lands, its Apply/Cancel row must reach the user — on mobile the
   * tools sheet may hold it below the fold. The same discipline the
   * editor's own opening follows (VLM-measured: applyBottom 870 > 844):
   * reveal the sheet, then scroll the preview box into the column.
   */
  const previewLive = draw.snapState === "preview";
  useEffect(() => {
    if (!previewLive) return;
    window.dispatchEvent(new CustomEvent(TOOLS_REVEAL_EVENT));
    const box = document.querySelector<HTMLElement>(
      "[data-testid='snap-preview-box']",
    );
    if (box && typeof box.scrollIntoView === "function") {
      box.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [previewLive]);

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
          {t("drawEditor.title")}
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
            aria-label={t("drawEditor.closeAria")}
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
            <span className="font-semibold text-ink">{t("drawEditor.from")}</span>{" "}
            {gap.before ? (
              <span className="font-mono text-[11px]">
                {formatLatLon(gap.before.lat, gap.before.lon)}
              </span>
            ) : (
              <span className="italic">{t("drawEditor.fromOpen")}</span>
            )}
          </p>
          <p>
            <span className="font-semibold text-ink">{t("drawEditor.to")}</span>{" "}
            {gap.after ? (
              <span className="font-mono text-[11px]">
                {formatLatLon(gap.after.lat, gap.after.lon)}
              </span>
            ) : (
              <span className="italic">{t("drawEditor.toOpen")}</span>
            )}
          </p>
        </div>

        {openEnded && near && (
          <p
            className="rounded-md border border-signal/40 bg-signal/5 px-3 py-2 text-xs text-ink"
            data-testid="open-end-instructions"
            role="status"
          >
            {t("drawEditor.openEndInstructions", {
              coords: formatLatLon(near.lat, near.lon),
            })}
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
          aria-label={t("drawEditor.pen.groupAria")}
        >
          <p className="flex items-center gap-2 text-xs font-bold tracking-[0.01em]">
            {t("drawEditor.pen.label")}
            <span className="h-px flex-1 bg-ink/10" aria-hidden="true" />
          </p>
          <div className="flex flex-wrap gap-1.5">
            {penChoices.map((choice) =>
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
              {t("drawEditor.pen.curveActiveHint")}
            </p>
          )}
          {!penLive && (
            <p
              className="text-[11px] leading-snug text-muted-foreground"
              data-testid="pen-inactive-note"
              role="status"
            >
              {t("drawEditor.pen.inactiveNote", {
                action:
                  draw.pointerMode === "move"
                    ? t("drawEditor.pen.actionDrag")
                    : t("drawEditor.pen.actionNavigate"),
              })}
            </p>
          )}
        </div>

        {/* Path style: how the NEXT segment is drawn. Placed segments keep
            the style they were drawn with (per-segment modes). */}
        <div
          className="grid gap-2"
          data-testid="road-follow-group"
          role="group"
          aria-label={t("drawEditor.pathStyle.groupAria")}
        >
          <p className="flex items-center gap-2 text-xs font-bold tracking-[0.01em]">
            {t("drawEditor.pathStyle.label")}
            <span className="h-px flex-1 bg-ink/10" aria-hidden="true" />
          </p>
          <p className="text-[11px] leading-snug text-muted-foreground">
            {t("drawEditor.pathStyle.perSegmentNote")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {pathStyleChoices.map((choice) => (
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
            {t("drawEditor.pathStyle.privacyNote")}
          </p>
          {(draw.pathStyle === "car" ||
            draw.pathStyle === "foot" ||
            draw.routingPending ||
            draw.routingFailed) && (
            <p
              className="text-[11px] text-muted-foreground"
              data-testid="road-follow-status"
              role="status"
            >
              {draw.routingPending
                ? t("drawEditor.roadStatus.finding")
                : draw.routingFailed
                  ? t("drawEditor.roadStatus.unavailable")
                  : draw.pointerMode === "move"
                    ? t("drawEditor.roadStatus.dragHint")
                    : t("drawEditor.roadStatus.switchToMove")}
            </p>
          )}
          {/*
           * §EE 17.2 — the consent gate's face in the draw tools: a
           * routable style is on but this session has not said yes.
           * Straight lines draw meanwhile (the cached legs a restore
           * brought back still render), and the enable button opens
           * the plain-notice dialog — never a silent request.
           */}
          {draw.routingNeedsConsent && (
            <div
              className="grid gap-1.5 rounded-md border border-signal/40 bg-signal/[0.05] px-2.5 py-2"
              data-testid="road-consent-notice"
            >
              <p className="text-[11.5px] leading-snug text-ink">
                {t("drawEditor.consent.notice")}
              </p>
              <Button
                type="button"
                size="sm"
                className="h-7 w-fit text-[12px]"
                data-testid="road-consent-enable"
                onClick={draw.requestRoadConsent}
              >
                {t("drawEditor.consent.enable")}
              </Button>
            </div>
          )}
          {(draw.pathStyle === "car" || draw.pathStyle === "foot") &&
            draw.routerConsent === "granted" && (
              <p
                className="text-[11px] leading-snug text-muted-foreground"
                data-testid="road-consent-on-note"
              >
                {t("drawEditor.consent.onForSession")}{" "}
                <button
                  type="button"
                  className="font-semibold text-foreground underline decoration-ink/25 underline-offset-2 hover:decoration-ink"
                  onClick={draw.requestRoadConsent}
                >
                  {t("drawEditor.consent.turnItOff")}
                </button>{" "}
                {t("drawEditor.consent.anyTime")}
              </p>
            )}
          {/*
           * §EE 17.3 — the one-shot whole-line snap. The preview
           * rides the same line the map renders (the road path IS the
           * preview); this box carries the honest numbers and the
           * apply/cancel intents — one undo step either way.
           * §EE 17.4: offline the control disables WITH an
           * explanation; freehand drawing never stops.
           */}
          <div
            className="grid gap-1.5"
            data-testid="road-snap-control"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 border-[1.25px] text-[12px]"
                data-testid="snap-to-road-button"
                disabled={
                  !draw.online ||
                  !draw.snapCanRun ||
                  draw.snapState === "pending" ||
                  draw.snapState === "preview"
                }
                onClick={() => draw.startRoadSnap()}
              >
                <Milestone className="size-3.5" aria-hidden="true" />
                {t("drawEditor.snap.button")}
              </Button>
              <p
                className="text-[11px] leading-snug text-muted-foreground"
                role="status"
                data-testid="snap-status"
              >
                {!draw.online
                  ? t("drawEditor.snap.offline")
                  : !draw.snapCanRun
                    ? t("drawEditor.snap.needPoints")
                    : draw.snapState === "pending"
                      ? t("drawEditor.roadStatus.finding")
                      : draw.snapState === "failed"
                        ? t("drawEditor.snap.failed")
                        : t("drawEditor.snap.idle")}
              </p>
            </div>
            {draw.snapState === "preview" && draw.snapPreviewNumbers && (
              <div
                className="grid gap-2 rounded-md border-[1.5px] border-signal/50 bg-signal/[0.06] px-3 py-2.5"
                data-testid="snap-preview-box"
              >
                <p className="text-[12px] font-bold text-ink">
                  {t("drawEditor.snap.previewTitle")}
                </p>
                <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-0.5 text-[12px] tabular-nums">
                  <dt className="text-muted-foreground">
                    {t("drawEditor.snap.yourLine")}
                  </dt>
                  <dd className="font-semibold">
                    {formatDistanceMeters(
                      draw.snapPreviewNumbers.drawnDistanceM,
                    )}
                  </dd>
                  <dt className="text-muted-foreground">
                    {t("drawEditor.snap.onTheRoad")}
                  </dt>
                  <dd className="font-semibold">
                    {formatDistanceMeters(
                      draw.snapPreviewNumbers.routedDistanceM,
                    )}{" "}
                    <span
                      className={
                        draw.snapPreviewNumbers.deltaM >= 0
                          ? "font-normal text-muted-foreground"
                          : "font-normal text-muted-foreground"
                      }
                    >
                      ({formatDeltaMeters(draw.snapPreviewNumbers.deltaM)})
                    </span>
                  </dd>
                </dl>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="h-7"
                    data-testid="snap-apply-button"
                    onClick={draw.applyRoadSnap}
                  >
                    {t("drawEditor.snap.apply")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 text-muted-foreground"
                    data-testid="snap-cancel-button"
                    onClick={draw.cancelRoadSnap}
                  >
                    {t("drawEditor.snap.keepDrawing")}
                  </Button>
                </div>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  {t("drawEditor.snap.previewNote")}
                </p>
              </div>
            )}
          </div>
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
            {draw.atVertexCap
              ? t("drawEditor.vertexCountLimit", {
                  count: draw.vertexCount,
                  max: draw.maxVertices,
                })
              : t("drawEditor.vertexCount", {
                  count: draw.vertexCount,
                  max: draw.maxVertices,
                })}
          </p>
        </div>

        {draw.straightLine && draw.vertexCount > 0 && (
          <Alert
            className="rounded-lg border-signal bg-signal/[0.08]"
            data-testid="straight-line-warning"
          >
            <TriangleAlert className="size-4" aria-hidden="true" />
            <AlertTitle>{t("drawEditor.straightWarning.title")}</AlertTitle>
            <AlertDescription>
              {t("drawEditor.straightWarning.body")}
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
            title={t("drawEditor.spacing.title")}
          >
            {t("drawEditor.spacing.label")}
            <select
              className="h-8 rounded-[5px] border-[1.25px] border-ink/25 bg-card px-2.5 text-xs font-normal transition-colors hover:border-ink/45 focus-visible:border-signal focus-visible:outline-none"
              data-testid="spacing-select"
              value={String(draw.resampleSpacing)}
              onChange={(event) => {
                const raw = event.target.value;
                draw.setResampleSpacing(raw === "off" ? "off" : Number(raw));
              }}
            >
              {spacingChoices.map((choice) => (
                <option key={choice.value} value={choice.value}>
                  {choice.label}
                </option>
              ))}
            </select>
          </label>
          <label
            className="flex items-center gap-2 self-end text-xs font-medium"
            data-testid="snap-toggle-label"
            title={t("drawEditor.snapToggle.title")}
          >
            <Checkbox
              checked={draw.snapEnabled}
              onCheckedChange={(checked) => draw.setSnapEnabled(checked === true)}
              aria-label={t("drawEditor.snapToggle.ariaLabel")}
              data-testid="snap-toggle"
            />
            {t("drawEditor.snapToggle.label")}
          </label>
        </div>

        {/*
         * Vertex list (Phase 16 — §EE 16.2): the numeric-entry surface.
         * Every canvas edit's keyboard twin, in rows you can tab into:
         * typed lat/lng, insert-after with a midpoint prefill, and
         * arrow-key nudge at a configurable step. The append form
         * shows even with zero points — the first point can be typed;
         * the component itself swaps in the honest cap notice.
         */}
        <VertexEntryList entry={draw} />

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
              {t("drawEditor.removeSpan")}
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
              {t("drawEditor.markSkipped")}
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            className="h-8"
            data-testid="done-editing-button"
            onClick={draw.closeEditor}
          >
            {t("drawEditor.done")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
