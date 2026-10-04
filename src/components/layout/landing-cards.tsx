/**
 * LandingCardsView — the landing's home page (Task 42; Task 56 redesign).
 *
 * The tab switcher's replacement: one tile per tool, each with an
 * illustration of what the tool does. Clicking a tile opens that tool's
 * detail page (SessionIdleView's "tool" branch) — the explanation, the
 * "How it works" trio, and the intake live there, so this page stays a
 * quiet front door: a headline, a promise, and six doors.
 *
 * Task 56 — the compact-tile redesign. The user found the Task 42 cards
 * too large (a 2×3 grid of 16:9 plates ran the page ~1400 px tall) and
 * picked "Variant C — compact tiles" from the Task 55 proposal, asking
 * that the illustrations stay. So the gallery is now a 3-across grid of
 * tiles (2 rows instead of 3): each keeps its illustration on a shorter
 * 2:1 plate (165 px at desktop width, down from 253 px) and pairs it
 * with a compact body — icon chip, kicker, title, and a one-line blurb
 * clamped to two lines. The full two-sentence blurbs were retired here
 * because the tool page already carries the complete teaching copy
 * (HERO_COPY, TOOL_FACTS, the workflow trio); the home only has to
 * answer "which tool?". Same Field Plot language as before: 1.5 px ink
 * borders, card fill, the lift-on-hover shadow, and the signal orange
 * spent on exactly one thing per tile (the "Open" row).
 *
 * Six tiles fill the 3-column grid in two even rows (two columns on
 * small screens, one on phones) — a seventh tool would leave a lone
 * last tile and want the old centering rule back.
 *
 * Pure presentation: intents out (`onOpenTool`), no stores. Focus
 * management is the one behavior it owns — coming BACK from a tool
 * page, the tile that opened it receives focus (the SPA equivalent of
 * a browser's back-focus; see returnFocusTo), so keyboard users never
 * land on the document body after navigating "back".
 */

"use client";

import { useEffect, useRef, type ReactNode } from "react";
import {
  ArrowRight,
  CircleHelp,
  Combine,
  FolderOpen,
  History,
  ImageUp,
  Layers,
  PencilRuler,
  Watch,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { LandingMode } from "@/state/ui-store";

/** One tool tile: everything the home page knows about a destination. */
export interface LandingTool {
  mode: LandingMode;
  /** Small mono category label above the title (scannability). */
  kicker: string;
  /** The tile's title — the same label the old tab carried. */
  title: string;
  /**
   * One line of intent, clamped to two rendered lines. The full
   * explanation lives on the tool's detail page (Task 56: the home
   * answers "which tool?", the tool page answers "how?").
   */
  blurb: string;
  /** Alt text for the tile's illustration. */
  imageAlt: string;
  icon: LucideIcon;
}

/**
 * The seven destinations, in the order users already know (repair first —
 * the app's core flow and the default remembered intent; batch last —
 * Phase 18's bulk door). Seven tiles in the 3-column grid leave a lone
 * last tile on row three, so the grid centers it there (a deliberate
 * full stop under the six — see the className note below).
 */
export const LANDING_TOOLS: readonly LandingTool[] = [
  {
    mode: "repair",
    kicker: "Repair",
    title: "Repair a recording",
    blurb:
      "Inspect a GPX with gaps or damage, then draw the missing route yourself.",
    imageAlt:
      "Illustration of a map route with a missing section being redrawn in orange",
    icon: Wrench,
  },
  {
    mode: "share",
    kicker: "Share",
    title: "Create a share card",
    blurb:
      "Turn any activity into a Strava-style share graphic — a transparent PNG.",
    imageAlt:
      "Illustration of a phone displaying a share card with a route and stats",
    icon: ImageUp,
  },
  {
    mode: "recovery",
    kicker: "Recovery",
    title: "Recover a GPS gap",
    blurb:
      "The clock kept running while GPS dropped out — draw what went missing.",
    imageAlt:
      "Illustration of a GPS watch and a route with a dotted missing segment between two pins",
    icon: History,
  },
  {
    mode: "create",
    kicker: "Create",
    title: "Create from stats",
    blurb:
      "Your watch recorded the numbers but no map — enter them, draw the route.",
    imageAlt:
      "Illustration of a sports watch beside a pencil drawing a brand-new route",
    icon: Watch,
  },
  {
    mode: "merge",
    kicker: "Merge",
    title: "Combine recordings",
    blurb: "Two or more GPX files become one route — every point preserved.",
    imageAlt:
      "Illustration of two separate map routes converging into one continuous line",
    icon: Combine,
  },
  {
    mode: "plan",
    kicker: "Plan",
    title: "Plan a route",
    blurb:
      "Sketch a route on the map and read its distance, elevation, and pace.",
    imageAlt:
      "Illustration of a winding route being measured with ruler ticks and a drafting compass",
    icon: PencilRuler,
  },
  {
    mode: "batch",
    kicker: "Batch",
    title: "Clean up many files",
    blurb:
      "Queue dozens of recordings, run one fix preset across them, export a ZIP.",
    imageAlt:
      "Illustration of a stack of file cards with route lines, one being stamped with a checkmark",
    icon: Layers,
  },
];

export interface LandingCardsViewProps {
  /** Open a tool's detail page — also becomes the remembered intent. */
  onOpenTool: (mode: LandingMode) => void;
  /**
   * The tool whose tile should receive focus on mount (returning from
   * that tool's page); `null` on a fresh visit — focus stays natural.
   */
  returnFocusTo: LandingMode | null;
  /**
   * Phase 10 — the session-recovery prompt, rendered above the hero
   * exactly when IndexedDB holds restorable work (a node, so the shell
   * owns the controller and this view stays pure presentation).
   */
  restorePrompt?: ReactNode;
  /**
   * Phase 11 — replay the onboarding tour (the shell owns the tour
   * controller). Optional so tests can render the tiles bare.
   */
  onStartTour?: () => void;
  /**
   * Phase 18 — open the sessions manager (the named-session shelf +
   * the open-a-session-file door). Optional so tests render the tiles
   * bare.
   */
  onOpenSessions?: () => void;
}

export function LandingCardsView({
  onOpenTool,
  returnFocusTo,
  restorePrompt,
  onStartTour,
  onOpenSessions,
}: LandingCardsViewProps) {
  // Tile refs keyed by mode — the focus-return target (see header).
  const cardRefs = useRef<
    Partial<Record<LandingMode, HTMLButtonElement | null>>
  >({});

  useEffect(() => {
    if (returnFocusTo) cardRefs.current[returnFocusTo]?.focus();
    // Runs on mount (the return trip) — returnFocusTo is fixed for a
    // given mount of this view, so an empty dep list is honest.
  }, []);

  return (
    <div className="hero-entrance mx-auto my-auto flex w-full max-w-5xl flex-col gap-6 py-8">
      {restorePrompt}
      <div className="space-y-2 text-center">
        <h2 className="font-display text-[clamp(2.25rem,5vw,3.25rem)] font-extrabold leading-[1.02] tracking-[0.012em] text-balance">
          What would you like to do?
        </h2>
        <p className="mx-auto max-w-[56ch] text-balance text-[15.5px] leading-relaxed text-muted-foreground">
          Six tools, one workbench — pick one to see how it works and
          start. Everything runs in this browser, and your files never
          leave this device.
        </p>
        {onStartTour && (
          <button
            type="button"
            data-testid="landing-start-tour"
            onClick={onStartTour}
            className="mx-auto mt-1 inline-flex items-center gap-1.5 rounded-[5px] px-2.5 py-1.5 text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-ink/[0.06] hover:text-foreground focus-visible:outline-2"
          >
            <CircleHelp className="size-3.5" aria-hidden="true" />
            New here? Take the tour
          </button>
        )}
        {onOpenSessions && (
          <button
            type="button"
            data-testid="landing-open-session"
            onClick={onOpenSessions}
            className="mx-auto mt-1 inline-flex items-center gap-1.5 rounded-[5px] px-2.5 py-1.5 text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-ink/[0.06] hover:text-foreground focus-visible:outline-2"
          >
            <FolderOpen className="size-3.5" aria-hidden="true" />
            Continue a saved session — or open a session file
          </button>
        )}
      </div>

      {/*
       * The tool tiles. The testid keeps its historical "toggle" name:
       * e2e specs address the picker through it (it was the tab group's
       * container; then the card list; now the tile grid — still the
       * landing's single mode picker, so the contract carries over).
       *
       * Density (Task 56): three columns from tablet up, two on small
       * screens, one on phones. Seven tiles (Phase 18) leave a lone
       * seventh on the desktop grid's third row — the
       * `[&>li:last-child]:md:col-start-2` rule centers it there so the
       * row reads as a deliberate full stop, not a gap. The blurb clamps
       * to three rendered lines so the narrowest three-column tiles never
       * overflow.
       */}
      <ul
        role="list"
        data-testid="landing-mode-toggle"
        className="grid grid-cols-[minmax(0,1fr)] gap-3.5 sm:grid-cols-[repeat(2,minmax(0,1fr))] md:grid-cols-[repeat(3,minmax(0,1fr))] md:[&>li:last-child]:col-start-2"
      >
        {LANDING_TOOLS.map((tool) => {
          return (
            <li key={tool.mode}>
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
                {/* The illustration plate: the image the tile is about,
                    full-bleed to the tile's top, framed below by the
                    same 1.5 px ink rule that frames the tile. Task 56:
                    a 2:1 plate — shorter than the old 16:9, the
                    artwork kept at tile scale. */}
                <span className="block aspect-[2/1] w-full overflow-hidden border-b-[1.5px] border-ink bg-muted">
                  <img
                    src={`/cards/${tool.mode}.webp`}
                    alt={tool.imageAlt}
                    width={896}
                    height={512}
                    decoding="async"
                    className="size-full object-cover"
                  />
                </span>
                <span className="flex flex-1 flex-col p-3.5">
                  <span className="flex items-center gap-2">
                    <span className="inline-flex shrink-0 rounded-[7px] border-[1.5px] border-signal bg-signal/10 p-[5px]">
                      <tool.icon
                        className="size-4 text-signal"
                        aria-hidden="true"
                      />
                    </span>
                    <span className="font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-shade">
                      {tool.kicker}
                    </span>
                  </span>
                  <span className="mt-2 text-[15px] font-bold tracking-tight">
                    {tool.title}
                  </span>
                  <span className="mt-1 line-clamp-3 text-pretty text-[12.5px] leading-[1.5] text-muted-foreground">
                    {tool.blurb}
                  </span>
                  {/* The affordance row — pinned to the tile's floor so
                      all the tiles align, the orange spent once. */}
                  <span className="mt-auto inline-flex items-center gap-1.5 pt-2 text-[12.5px] font-semibold text-signal-ink">
                    Open
                    <ArrowRight
                      className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5"
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
