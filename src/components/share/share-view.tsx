/**
 * ShareView — the share-card session state (docs/MASTER_PLAN.md §O,
 * Task 20).
 *
 * The sibling of WorkspaceLayout for `view === "share"`: a dominant
 * dark stage carrying the 9:16 card preview (the canvas is white and
 * orange on transparency — a dark surface is the only honest way to
 * preview it) with a tools column beside it: the trio with its
 * provenance, the unit toggle shared with the statistics panel, the
 * PNG scale, the download action, and the bridge into the repair
 * workspace (the same file, no re-parse).
 *
 * Layout only, in the workspace's design language — slots and props,
 * no data logic (the binding comes from useShareCard; the card itself
 * is the reusable ShareCardCanvas).
 */

"use client";

import { useState } from "react";
import { Download, Info, TriangleAlert, Wrench } from "lucide-react";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  const [scale, setScale] = useState<SharePngScale>(1);
  const content = share.content;
  const spec = share.spec;

  return (
    <section
      id="share"
      aria-label="Share card"
      data-testid="share-section"
      className="scroll-mt-20"
    >
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-xl">
          <h2 className="text-xl font-semibold tracking-tight">
            Share card
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            A Strava-style graphic of{" "}
            <span className="text-foreground">{fileName ?? "this file"}</span>{" "}
            — transparent background, rendered from the values the file
            actually records.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,1fr)_21rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
        {/*
         * The stage: near-black so the card's white artwork and orange
         * route read exactly as they will on a story surface. The
         * canvas keeps its intrinsic 9:16 ratio (h-full, w-auto).
         */}
        <div
          data-testid="share-stage"
          className="relative flex h-[70dvh] min-h-[30rem] min-w-0 items-center justify-center overflow-hidden rounded-xl border bg-zinc-950 p-4 lg:h-[calc(100dvh-13rem)]"
        >
          {spec ? (
            <ShareCardCanvas
              routePolyline={spec.routePolyline}
              distance={spec.distance}
              pace={spec.pace}
              time={spec.time}
            />
          ) : (
            <p className="text-sm text-zinc-400">
              Preparing the card…
            </p>
          )}
          <p className="absolute bottom-3 left-1/2 -translate-x-1/2 text-xs text-zinc-500">
            Transparent background — shown on dark
          </p>
        </div>

        <aside
          className="grid min-w-0 content-start gap-4 [&>*]:min-w-0"
          data-testid="share-tools"
          aria-label="Share card tools"
        >
          <Card data-testid="share-summary-card">
            <CardHeader>
              <h3 className="leading-none font-semibold">On the card</h3>
              <CardDescription>
                Recorded values only — the same numbers the statistics
                panel shows.
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
                  <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Distance
                  </dt>
                  <dd
                    className="mt-1 text-lg font-semibold tabular-nums"
                    data-testid="share-summary-distance"
                  >
                    {content?.distance ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Pace
                  </dt>
                  <dd
                    className="mt-1 text-lg font-semibold tabular-nums"
                    data-testid="share-summary-pace"
                  >
                    {content?.pace ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Time
                  </dt>
                  <dd
                    className="mt-1 text-lg font-semibold tabular-nums"
                    data-testid="share-summary-time"
                  >
                    {content?.time ?? "—"}
                  </dd>
                </div>
              </dl>

              {share.routeEmpty && (
                <p
                  className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                  data-testid="share-route-empty-note"
                >
                  <TriangleAlert
                    className="mt-0.5 size-4 shrink-0"
                    aria-hidden="true"
                  />
                  This file has no drawable route points — the card will
                  show the stats block only.
                </p>
              )}

              <div className="grid gap-2">
                <span className="text-sm font-medium">
                  PNG resolution
                </span>
                <div
                  className="flex overflow-hidden rounded-md border"
                  role="group"
                  aria-label="PNG resolution"
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
                          ? "flex-1 bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                          : "flex-1 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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
                  Download PNG
                </Button>
                <Button
                  variant="outline"
                  className="gap-1.5"
                  data-testid="share-open-repair"
                  onClick={onOpenRepair}
                >
                  <Wrench className="size-4" aria-hidden="true" />
                  Repair this file instead
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="leading-none font-semibold">
                What the numbers mean
              </h3>
              <CardDescription>
                The card promises nothing the file does not contain.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm text-muted-foreground">
              <p className="flex items-start gap-2">
                <Info
                  className="mt-0.5 size-4 shrink-0"
                  aria-hidden="true"
                />
                Distance is the recorded route length; pace divides it by
                the recorded moving time; time is the recorded elapsed
                span. Values the file cannot support show “—”.
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
