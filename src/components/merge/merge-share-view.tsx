/**
 * MergeShareView — the share-card view of the Merge section.
 *
 * The merge counterpart of the create section's CreateShareView: the
 * SAME dominant dark stage, the SAME reusable ShareCardCanvas (one
 * painter, so the preview is the PNG), and the same tools column —
 * pace unit toggle, PNG resolution, download, and the bridge back to
 * the arrangement. Only the copy differs, because the source of the
 * numbers differs: the route is a combination of N recordings and the
 * trio is the merged file's own arithmetic (distance, pace, and time
 * over every carried-over point).
 *
 * Layout only, in the workspace's design language — the binding comes
 * from `useMergeShare`; the card itself is the reusable component.
 *
 * Task 44 — Merge section share flow. Client component.
 */

"use client";

import { useState } from "react";
import { ArrowLeft, Download, Info } from "lucide-react";
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
  MergeShareBinding,
  MergeSharePngScale,
} from "@/hooks/use-merge-share";

export interface MergeShareViewProps {
  /** The merge share binding from useMergeShare. */
  share: MergeShareBinding;
  /** Leave the share view → back to the arrangement (same merge). */
  onBackToArrangement: () => void;
}

const SCALE_OPTIONS: readonly {
  value: MergeSharePngScale;
  label: string;
  detail: string;
}[] = [
  { value: 1, label: "1×", detail: "1080 × 1920" },
  { value: 2, label: "2×", detail: "2160 × 3840" },
];

export function MergeShareView({
  share,
  onBackToArrangement,
}: MergeShareViewProps) {
  const [scale, setScale] = useState<MergeSharePngScale>(1);
  const content = share.content;
  const spec = share.spec;

  return (
    <section
      id="merge-share"
      aria-label="Share card"
      data-testid="merge-share-section"
      className="scroll-mt-20"
    >
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-xl">
          <h2 className="flex items-center gap-2.5 font-display text-[30px] font-bold leading-[1.05] tracking-[0.01em]">
            <span
              className="size-[11px] shrink-0 rounded-[1.5px] bg-signal"
              aria-hidden="true"
            />
            Share card
          </h2>
          <p className="mt-1.5 max-w-[62ch] text-sm leading-relaxed text-muted-foreground">
            A Strava-style graphic of your merged recording — transparent
            background, rendered from the combined route and the time it
            carries.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,1fr)_21rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
        {/*
         * The stage: the ink field — solid #222222 with a faint white
         * plotting grid, framed by the 2 px ink equipment border — so
         * the card's white artwork and orange route read exactly as
         * they will on a story surface (the same stage the other
         * sections' share views use).
         */}
        <div
          data-testid="merge-share-stage"
          className="relative flex h-[70dvh] min-h-[30rem] min-w-0 items-center justify-center overflow-hidden rounded-[14px] border-2 border-ink bg-[#222222] p-4 lg:h-[calc(100dvh-13rem)]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        >
          <ShareCardCanvas
            routePolyline={spec.routePolyline}
            distance={spec.distance}
            pace={spec.pace}
            time={spec.time}
          />
          <p className="absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/55 px-3 py-1 text-[11.5px] text-white/80">
            Transparent background — shown on dark
          </p>
        </div>

        <aside
          className="grid min-w-0 content-start gap-4 [&>*]:min-w-0"
          data-testid="merge-share-tools"
          aria-label="Share card tools"
        >
          <Card data-testid="merge-share-summary-card">
            <CardHeader>
              <h3 className="flex items-center gap-2 text-[15.5px] font-bold leading-tight">
                <span
                  className="size-2 shrink-0 rounded-[1px] bg-signal"
                  aria-hidden="true"
                />
                On the card
              </h3>
              <CardDescription>
                The same numbers the statistics panel shows — what the
                merged file carries.
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
                data-testid="merge-share-summary-stats"
              >
                <div>
                  <dt className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                    Distance
                  </dt>
                  <dd
                    className="mt-0.5 font-display text-[27px] font-bold leading-[1.1] tabular-nums"
                    data-testid="merge-share-summary-distance"
                  >
                    {content.distance}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                    Pace
                  </dt>
                  <dd
                    className="mt-0.5 font-display text-[27px] font-bold leading-[1.1] tabular-nums"
                    data-testid="merge-share-summary-pace"
                  >
                    {content.pace}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                    Time
                  </dt>
                  <dd
                    className="mt-0.5 font-display text-[27px] font-bold leading-[1.1] tabular-nums"
                    data-testid="merge-share-summary-time"
                  >
                    {content.time}
                  </dd>
                </div>
              </dl>

              <div className="grid gap-2">
                <span className="text-sm font-semibold">
                  PNG resolution
                </span>
                <div
                  className="inline-flex w-fit gap-[3px] rounded-[7px] border-[1.25px] border-ink/25 bg-card p-[3px]"
                  role="group"
                  aria-label="PNG resolution"
                  data-testid="merge-share-scale-toggle"
                >
                  {SCALE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={scale === option.value}
                      data-testid={`merge-share-scale-${option.value}x`}
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
                  data-testid="merge-share-download"
                  onClick={() => share.downloadPng(scale)}
                >
                  <Download className="size-4" aria-hidden="true" />
                  Download PNG
                </Button>
                <Button
                  variant="outline"
                  className="gap-1.5"
                  data-testid="merge-share-back"
                  onClick={onBackToArrangement}
                >
                  <ArrowLeft className="size-4" aria-hidden="true" />
                  Back to arrangement
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
                What the numbers mean
              </h3>
              <CardDescription>
                A merged recording, honestly labeled.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm text-muted-foreground">
              {content.notes.map((note) => (
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
