/**
 * ShareView — the share-card session state (docs/MASTER_PLAN.md §O,
 * Task 20; layout per Task 23).
 *
 * The sibling of WorkspaceLayout for `view === "share"`: a dominant
 * dark stage carrying the 9:16 card preview (a solid-black canvas —
 * the hairline ring around it is preview chrome, not card content)
 * with a tools column beside it: the trio with its provenance, the
 * unit toggle shared with the statistics panel, the PNG scale, the
 * download action, and the bridge into the repair workspace (the
 * same file, no re-parse).
 *
 * Layout only, in the workspace's design language — slots and props,
 * no data logic (the binding comes from useShareCard; the card itself
 * is the reusable ShareCardCanvas).
 */

"use client";

import { useState } from "react";
import { Download, Info, TriangleAlert, Wrench } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PaceUnitToggle } from "@/components/shared/pace-unit-toggle";
import { ShareCardCanvas } from "@/components/share/share-card-canvas";
import type {
  ShareCardBinding,
  SharePngScale,
} from "@/hooks/use-share-card";

export interface ShareViewProps {
  /** The loaded file's name (for the summary header). */
  fileName: string | null;
  /** The share-card binding from useShareCard. */
  share: ShareCardBinding;
  /** Switch this file into the repair workspace (no re-parse). */
  onOpenRepair: () => void;
}

const SCALE_OPTIONS: readonly {
  value: SharePngScale;
  label: string;
  detail: string;
}[] = [
  { value: 1, label: "1×", detail: "1080 × 1920" },
  { value: 2, label: "2×", detail: "2160 × 3840" },
];

export function ShareView({ fileName, share, onOpenRepair }: ShareViewProps) {
  const { t } = useI18n();
  const [scale, setScale] = useState<SharePngScale>(1);
  const content = share.content;
  const spec = share.spec;
  // Task 35: committed repairs are part of the card — the copy says so.
  const includesRepairs = content?.includesRepairs === true;

  return (
    <section
      id="share"
      aria-label={t("share.sectionA11y")}
      data-testid="share-section"
      className="scroll-mt-20"
    >
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-xl">
          <h2 className="flex items-center gap-2.5 font-display text-[30px] font-bold leading-[1.05] tracking-[0.01em]">
            <span
              className="size-[11px] shrink-0 rounded-[1.5px] bg-signal"
              aria-hidden="true"
            />
            {t("share.title")}
          </h2>
          <p className="mt-1.5 max-w-[62ch] text-sm leading-relaxed text-muted-foreground">
            {t("share.intro")}{" "}
            <span className="font-semibold text-foreground">
              {fileName ?? t("share.introFileFallback")}
            </span>{" "}
            {t("share.introTail")}{" "}
            {includesRepairs
              ? t("share.introRenderedRepairs")
              : t("share.introRenderedRecorded")}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,1fr)_21rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
        {/*
         * The stage: the ink field — solid #222222 with a faint white
         * plotting grid, framed by the 2 px ink equipment border — so
         * the card's white artwork and orange route read exactly as
         * they will on a story surface. The canvas keeps its intrinsic
         * 9:16 ratio (h-full, w-auto); the card graphic itself is the
         * painter's output and is never restyled here.
         */}
        <div
          data-testid="share-stage"
          className="relative flex h-[70dvh] min-h-[30rem] min-w-0 items-center justify-center overflow-hidden rounded-[14px] border-2 border-ink bg-[#222222] p-4 lg:h-[calc(100dvh-13rem)]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        >
          {spec ? (
            <ShareCardCanvas
              routePolyline={spec.routePolyline}
              distance={spec.distance}
              pace={spec.pace}
              time={spec.time}
            />
          ) : (
            /*
             * The card taking shape (user pass 35): a 9:16 skeleton on
             * the same composition anchors the real painter uses (route
             * box, wordmark, stats trio, shoe slot — proportions from
             * lib/share/layout.ts), so the swap from placeholder to
             * painted card is seamless.
             */
            <div
              data-testid="share-card-skeleton"
              role="status"
              aria-label={t("share.preparing")}
              className="relative aspect-[9/16] h-full w-auto max-w-full overflow-hidden rounded-[2px] bg-black ring-1 ring-white/10"
            >
              <div className="absolute inset-x-[5.9%] bottom-[38%] top-[11.4%]">
                <svg
                  className="absolute inset-0 size-full text-white/[0.14]"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <path
                    d="M8 78 C 22 60, 30 82, 44 64 S 62 30, 74 44 S 88 30, 96 18"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <Skeleton className="absolute left-[33.5%] top-[66.7%] h-[2.9%] w-[30.5%] rounded-[2px] bg-white/[0.13]" />
              <div className="absolute inset-x-[5.9%] top-[75.5%] grid grid-cols-3 gap-[6%]">
                <Skeleton className="h-2.5 rounded-[2px] bg-white/[0.13]" />
                <Skeleton className="h-2.5 rounded-[2px] bg-white/[0.13]" />
                <Skeleton className="h-2.5 rounded-[2px] bg-white/[0.13]" />
              </div>
              <Skeleton className="absolute left-[44.9%] top-[83.5%] size-[9.6%] rounded-[3px] bg-white/[0.13]" />
            </div>
          )}
          <p className="absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/55 px-3 py-1 text-[11.5px] text-white/80">
            {t("share.stageNote")}
          </p>
        </div>

        <aside
          className="grid min-w-0 content-start gap-4 [&>*]:min-w-0"
          data-testid="share-tools"
          aria-label={t("share.toolsA11y")}
        >
          <Card data-testid="share-summary-card">
            <CardHeader>
              <h3 className="flex items-center gap-2 text-[15.5px] font-bold leading-tight">
                <span
                  className="size-2 shrink-0 rounded-[1px] bg-signal"
                  aria-hidden="true"
                />
                {t("share.onTheCard")}
              </h3>
              <CardDescription>
                {includesRepairs
                  ? t("share.cardDescRepairs")
                  : t("share.cardDescRecorded")}
              </CardDescription>
              <CardAction>
                <PaceUnitToggle
                  unit={share.paceUnit}
                  onChange={share.setPaceUnit}
                />
              </CardAction>
            </CardHeader>
            <CardContent className="grid gap-4">
              <dl
                className="grid grid-cols-[repeat(3,minmax(0,1fr))] gap-3 text-center"
                data-testid="share-summary-stats"
              >
                <div>
                  <dt className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                    {t("share.colDistance")}
                  </dt>
                  <dd
                    className="mt-0.5 font-display text-[27px] font-bold leading-[1.1] tabular-nums"
                    data-testid="share-summary-distance"
                  >
                    {content?.distance ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                    {t("share.colPace")}
                  </dt>
                  <dd
                    className="mt-0.5 font-display text-[27px] font-bold leading-[1.1] tabular-nums"
                    data-testid="share-summary-pace"
                  >
                    {content?.pace ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                    {t("share.colTime")}
                  </dt>
                  <dd
                    className="mt-0.5 font-display text-[27px] font-bold leading-[1.1] tabular-nums"
                    data-testid="share-summary-time"
                  >
                    {content?.time ?? "—"}
                  </dd>
                </div>
              </dl>

              {share.routeEmpty && (
                <p
                  className="flex items-start gap-2 rounded-lg border-[1.25px] border-inkplus bg-ink/[0.04] px-3 py-2.5 text-[13px] leading-relaxed text-ink"
                  data-testid="share-route-empty-note"
                >
                  <TriangleAlert
                    className="mt-0.5 size-4 shrink-0 text-inkplus"
                    aria-hidden="true"
                  />
                  {t("share.routeEmpty")}
                </p>
              )}

              <div className="grid gap-2">
                <span className="text-sm font-semibold">
                  {t("share.pngResolution")}
                </span>
                <div
                  className="inline-flex w-fit gap-[3px] rounded-[7px] border-[1.25px] border-ink/25 bg-card p-[3px]"
                  role="group"
                  aria-label={t("share.pngResolution")}
                  data-testid="share-scale-toggle"
                >
                  {SCALE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={scale === option.value}
                      data-testid={`share-scale-${option.value}x`}
                      className={
                        scale === option.value
                          ? "rounded-[4px] bg-signal px-3 py-[4.5px] text-[12.5px] font-semibold text-inkplus"
                          : "rounded-[4px] px-3 py-[4.5px] text-[12.5px] font-semibold text-muted-foreground transition-colors hover:bg-ink/[0.06] hover:text-foreground"
                      }
                      onClick={() => setScale(option.value)}
                    >
                      {option.label}
                      <span className="ml-1.5 opacity-75">
                        {option.detail}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-2">
                <Button
                  className="gap-1.5"
                  data-testid="share-download"
                  disabled={!spec}
                  onClick={() => share.downloadPng(scale)}
                >
                  <Download className="size-4" aria-hidden="true" />
                  {t("share.downloadPng")}
                </Button>
                <Button
                  variant="outline"
                  className="gap-1.5"
                  data-testid="share-open-repair"
                  onClick={onOpenRepair}
                >
                  <Wrench className="size-4" aria-hidden="true" />
                  {t("share.openRepair")}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="flex items-center gap-2 text-[15.5px] font-bold leading-tight">
                <span
                  className="size-2 shrink-0 rounded-[1px] bg-signal"
                  aria-hidden="true"
                />
                {t("share.numbersTitle")}
              </h3>
              <CardDescription>
                {t("share.numbersDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm text-muted-foreground">
              <p className="flex items-start gap-2">
                <Info
                  className="mt-0.5 size-4 shrink-0"
                  aria-hidden="true"
                />
                {includesRepairs
                  ? t("share.numbersRepairs")
                  : t("share.numbersRecorded")}
              </p>
              {(content?.notes ?? []).map((note) => (
                <p key={note} className="flex items-start gap-2">
                  <Info
                    className="mt-0.5 size-4 shrink-0"
                    aria-hidden="true"
                  />
                  {note}
                </p>
              ))}
            </CardContent>
          </Card>
        </aside>
      </div>
    </section>
  );
}
