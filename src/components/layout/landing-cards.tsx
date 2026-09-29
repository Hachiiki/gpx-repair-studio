/**
 * LandingCardsView — the landing's home page (Task 42).
 *
 * The tab switcher's replacement: one card per tool, each with an
 * illustration of what the tool does. Clicking a card opens that tool's
 * detail page (SessionIdleView's "tool" branch) — the explanation, the
 * "How it works" trio, and the intake live there, so this page stays a
 * quiet front door: a headline, a promise, and five doors.
 *
 * Speaks the Field Plot language of the workflow cards it sits beside:
 * 1.5 px ink borders, card fill, the lift-on-hover shadow, and the
 * signal orange spent on exactly one thing per card (the "Open" row).
 *
 * The 2×2 grid became a 2×N grid with the fifth tool (Task 43): rows
 * pair up the same way, and an odd count's lone last card centers on
 * its own row (span both columns, half width, auto margins) so the
 * gallery ends balanced instead of trailing off left-aligned.
 *
 * Pure presentation: intents out (`onOpenTool`), no stores. Focus
 * management is the one behavior it owns — coming BACK from a tool
 * page, the card that opened it receives focus (the SPA equivalent of
 * a browser's back-focus; see returnFocusTo), so keyboard users never
 * land on the document body after navigating "back".
 */

"use client";

import { useEffect, useRef } from "react";
import {
  ArrowRight,
  Combine,
  History,
  ImageUp,
  PencilRuler,
  Watch,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { LandingMode } from "@/state/ui-store";

/** One tool card: everything the home page knows about a destination. */
export interface LandingTool {
  mode: LandingMode;
  /** Small mono category label above the title (scannability). */
  kicker: string;
  /** The card's title — the same label the old tab carried. */
  title: string;
  /** One or two sentences: what this tool does for you. */
  blurb: string;
  /** Alt text for the card's illustration. */
  imageAlt: string;
  icon: LucideIcon;
}

/**
 * The six destinations, in the order users already know (repair first —
 * the app's core flow and the default remembered intent; plan last —
 * the newest tool, Task 50). Six cards fill the 2-column grid evenly.
 */
export const LANDING_TOOLS: readonly LandingTool[] = [
  {
    mode: "repair",
    kicker: "Repair",
    title: "Repair a recording",
    blurb:
      "Inspect a GPX with gaps or damage, then draw the missing route yourself — with a clear line between recorded and reconstructed data.",
    imageAlt:
      "Illustration of a map route with a missing section being redrawn in orange",
    icon: Wrench,
  },
  {
    mode: "share",
    kicker: "Share",
    title: "Create a share card",
    blurb:
      "Turn any activity into a Strava-style share graphic — your route with the distance, pace, and time the file records, as a transparent PNG.",
    imageAlt:
      "Illustration of a phone displaying a share card with a route and stats",
    icon: ImageUp,
  },
  {
    mode: "recovery",
    kicker: "Recovery",
    title: "Recover a GPS gap",
    blurb:
      "The clock kept running while GPS dropped out mid-workout. Draw the section that went missing and export a corrected file.",
    imageAlt:
      "Illustration of a GPS watch and a route with a dotted missing segment between two pins",
    icon: History,
  },
  {
    mode: "create",
    kicker: "Create",
    title: "Create from stats",
    blurb:
      "Your watch recorded the numbers but no map. Enter the statistics, draw the route, and download a GPX ready for Strava.",
    imageAlt:
      "Illustration of a sports watch beside a pencil drawing a brand-new route",
    icon: Watch,
  },
  {
    mode: "merge",
    kicker: "Merge",
    title: "Combine recordings",
    blurb:
      "Two or more GPX files become one route — every point, elevation, and waypoint preserved. Set the order, name the result, download one file.",
    imageAlt:
      "Illustration of two separate map routes converging into one continuous line",
    icon: Combine,
  },
  {
    mode: "plan",
    kicker: "Plan",
    title: "Plan a route",
    blurb:
      "Sketch a route on the map and read its numbers — distance, elevation, and the pace a time you enter implies. A scratchpad: nothing is exported or shared.",
    imageAlt:
      "Illustration of a winding route being measured with ruler ticks and a drafting compass",
    icon: PencilRuler,
  },
];

export interface LandingCardsViewProps {
  /** Open a tool's detail page — also becomes the remembered intent. */
  onOpenTool: (mode: LandingMode) => void;
  /**
   * The tool whose card should receive focus on mount (returning from
   * that tool's page); `null` on a fresh visit — focus stays natural.
   */
  returnFocusTo: LandingMode | null;
}

export function LandingCardsView({
  onOpenTool,
  returnFocusTo,
}: LandingCardsViewProps) {
  // Card refs keyed by mode — the focus-return target (see header).
  const cardRefs = useRef<
    Partial<Record<LandingMode, HTMLButtonElement | null>>
  >({});

  useEffect(() => {
    if (returnFocusTo) cardRefs.current[returnFocusTo]?.focus();
    // Runs on mount (the return trip) — returnFocusTo is fixed for a
    // given mount of this view, so an empty dep list is honest.
  }, []);

  return (
    <div className="hero-entrance mx-auto my-auto flex w-full max-w-4xl flex-col py-8">
      <div className="space-y-2 text-center">
        <h2 className="font-display text-[clamp(2.25rem,5vw,3.25rem)] font-extrabold leading-[1.02] tracking-[0.012em] text-balance">
          What would you like to do?
        </h2>
        <p className="mx-auto max-w-[56ch] text-balance text-[15.5px] leading-relaxed text-muted-foreground">
          Six tools, one workbench — pick one to see how it works and
          start. Everything runs in this browser, and your files never
          leave this device.
        </p>
      </div>

      {/*
       * The tool cards. The testid keeps its historical "toggle" name:
       * e2e specs address the picker through it (it was the tab group's
       * container; now it is the card list — still the landing's single
       * mode picker, so the contract carries over unchanged).
       */}
      <ul
        role="list"
        data-testid="landing-mode-toggle"
        className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-[repeat(2,minmax(0,1fr))]"
      >
        {LANDING_TOOLS.map((tool, index) => {
          // An odd count's lone last card centers on its own row (see
          // header) — the gallery ends balanced, not trailing off.
          const loneLast =
            LANDING_TOOLS.length % 2 === 1 &&
            index === LANDING_TOOLS.length - 1;
          return (
            <li
              key={tool.mode}
              className={
                loneLast
                  ? "sm:col-span-2 sm:mx-auto sm:w-[calc(50%-0.5rem)]"
                  : undefined
              }
            >
              <button
                type="button"
                ref={(node) => {
                  cardRefs.current[tool.mode] = node;
                }}
                data-testid={`landing-mode-${tool.mode}`}
                aria-label={`${tool.title} — open this tool`}
                onClick={() => onOpenTool(tool.mode)}
                className="group flex h-full w-full flex-col overflow-hidden rounded-[10px] border-[1.5px] border-ink bg-card text-left transition-[translate,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline-2"
              >
                {/* The illustration plate: the image the card is about,
                    full-bleed to the card's top, framed below by the same
                    1.5 px ink rule that frames the card. */}
                <span className="block aspect-[16/9] w-full overflow-hidden border-b-[1.5px] border-ink bg-muted">
                  <img
                    src={`/cards/${tool.mode}.webp`}
                    alt={tool.imageAlt}
                    width={896}
                    height={512}
                    decoding="async"
                    className="size-full object-cover"
                  />
                </span>
                <span className="flex flex-1 flex-col p-[18px]">
                  <span className="flex items-center gap-2.5">
                    <span className="inline-flex shrink-0 rounded-[10px] border-[1.5px] border-signal bg-signal/10 p-2">
                      <tool.icon
                        className="size-[18px] text-signal"
                        aria-hidden="true"
                      />
                    </span>
                    <span className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-shade">
                      {tool.kicker}
                    </span>
                  </span>
                  <span className="mt-2.5 text-[17px] font-bold tracking-tight">
                    {tool.title}
                  </span>
                  <span className="mt-1.5 text-pretty text-[13px] leading-relaxed text-muted-foreground">
                    {tool.blurb}
                  </span>
                  {/* The affordance row — pinned to the card's floor so
                      all the cards align, the orange spent once. */}
                  <span className="mt-auto inline-flex items-center gap-1.5 pt-3 text-[13.5px] font-semibold text-signal">
                    Open
                    <ArrowRight
                      className="size-4 transition-transform duration-150 group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
