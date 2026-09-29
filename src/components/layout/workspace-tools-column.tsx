/**
 * WorkspaceToolsColumn — one component, two tools layouts (Phase 8).
 *
 * Desktop (lg+) renders the classic sticky aside exactly as every
 * studio had it: pinned under the header, scrolling internally when
 * its cards outgrow the map.
 *
 * Mobile renders the SAME cards inside a viewport-pinned bottom
 * sheet — the MASTER_PLAN §P Phase 8 "responsive bottom-sheet panel
 * system": on a phone the tools used to live below the fold under a
 * 65 dvh map, so every pen/mode change meant scrolling away from the
 * drawing. The sheet keeps the map and the tools on one screen:
 *
 *   - collapsed: a 9.5 rem peek (scrollable — the first cards stay
 *     readable, and a swipe inside the peek browses without opening);
 *   - expanded: 35 dvh (the map keeps the drawing area
 *     visible above it — the sheet never covers the working canvas),
 *     its own scroll container;
 *   - the grab-handle bar toggles (tap, Enter/Space, or a ≥28 px
 *     drag), sized as a 44 px touch target with an honest
 *     `aria-expanded`;
 *   - it lives only while its SECTION is on screen — an
 *     IntersectionObserver hides it once the user scrolls into the
 *     details section, so the statistics below are never covered;
 *   - `gpxr:tools-reveal` (dispatched by the draw editor's reveal
 *     effect, Task 49's mobile twin) expands the sheet — opening an
 *     editor brings the Pen chips to the user's thumb.
 *
 * The sheet's scroll container carries the SAME testid + label the
 * desktop aside uses: the Task-49 reveal effect scrolls
 * `[data-testid$="tools-panel"]`, which matches exactly one element
 * per viewport, whichever tree rendered.
 *
 * Layout only — the cards are the caller's (§F layout rule).
 */

"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { SHELL_CONTAINER } from "@/components/layout/shell-container";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

/** The desktop/mobile breakpoint (Tailwind `lg`). */
const DESKTOP_QUERY = "(min-width: 1024px)";

/** The window event that asks the sheet to open (Task 49's twin). */
export const TOOLS_REVEAL_EVENT = "gpxr:tools-reveal";

/** Drag travel that commits a toggle (px). */
const DRAG_TOGGLE_PX = 28;

export interface WorkspaceToolsColumnProps {
  /** The tools column's testid — shared by the aside and the sheet. */
  testid: string;
  /** The column's accessible name (also the sheet's bar label). */
  label: string;
  /** Mobile: start expanded (studios whose whole purpose is drawing). */
  defaultExpanded?: boolean;
  children: ReactNode;
}

export function WorkspaceToolsColumn({
  testid,
  label,
  defaultExpanded = false,
  children,
}: WorkspaceToolsColumnProps) {
  const isDesktop = useMediaQuery(DESKTOP_QUERY, true);

  if (isDesktop) {
    return (
      <aside
        className="grid min-w-0 content-start gap-4 [&>*]:min-w-0 lg:sticky lg:top-[4.75rem] lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:overscroll-contain lg:pr-1"
        data-testid={testid}
        aria-label={label}
      >
        {children}
      </aside>
    );
  }
  return (
    <MobileToolsSheet
      testid={testid}
      label={label}
      defaultExpanded={defaultExpanded}
    >
      {children}
    </MobileToolsSheet>
  );
}

function MobileToolsSheet({
  testid,
  label,
  defaultExpanded,
  children,
}: WorkspaceToolsColumnProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [inView, setInView] = useState(true);
  const contentId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  // A drag that already toggled must not double-toggle through the
  // trailing click the browser fires on the bar button.
  const dragConsumedClick = useRef(false);
  const dragStartY = useRef<number | null>(null);

  // Hide while the section is off screen (the sheet never covers the
  // statistics section). The section is the map's own <section> —
  // the sheet renders inside it, so closest() finds it.
  useEffect(() => {
    const section = rootRef.current?.closest("section");
    if (!section || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          // Below a quarter visible the map is no longer the working
          // surface — the details section owns the viewport.
          setInView(entry.intersectionRatio > 0.25);
        }
      },
      { threshold: [0, 0.25, 0.6] },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  // An editor opening (Task 49's reveal) brings the tools to the
  // user's thumb — the Pen group leads the expanded sheet.
  useEffect(() => {
    const onReveal = () => setExpanded(true);
    window.addEventListener(TOOLS_REVEAL_EVENT, onReveal);
    return () => window.removeEventListener(TOOLS_REVEAL_EVENT, onReveal);
  }, []);

  const toggle = useCallback(() => setExpanded((open) => !open), []);

  const onBarPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    // Only the finger/pen drags the bar; secondary buttons don't.
    if (e.pointerType === "mouse" && e.button !== 0) return;
    dragStartY.current = e.clientY;
    dragConsumedClick.current = false;
  };
  const onBarPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const start = dragStartY.current;
    if (start === null) return;
    const dy = e.clientY - start;
    if (Math.abs(dy) >= DRAG_TOGGLE_PX) {
      dragStartY.current = null;
      dragConsumedClick.current = true;
      setExpanded(dy < 0);
    }
  };
  const onBarPointerUp = () => {
    dragStartY.current = null;
  };
  const onBarClick = () => {
    if (dragConsumedClick.current) {
      dragConsumedClick.current = false;
      return;
    }
    toggle();
  };

  return (
    <div
      ref={rootRef}
      className="fixed inset-x-0 bottom-0 z-40 lg:hidden"
      data-testid="mobile-tools-sheet"
      data-expanded={expanded}
      {...(inView ? {} : { hidden: true })}
    >
      <div className={cn(SHELL_CONTAINER, "pb-[env(safe-area-inset-bottom)]")}>
        <div className="overflow-hidden rounded-t-2xl border-[1.5px] border-b-0 border-ink bg-card shadow-float">
          <button
            type="button"
            data-testid="mobile-tools-toggle"
            aria-expanded={expanded}
            aria-controls={contentId}
            onClick={onBarClick}
            onPointerDown={onBarPointerDown}
            onPointerMove={onBarPointerMove}
            onPointerUp={onBarPointerUp}
            onPointerCancel={onBarPointerUp}
            className="flex min-h-11 w-full touch-none items-center gap-2.5 px-4 py-2 transition-colors hover:bg-ink/[0.04] focus-visible:outline-2"
          >
            <span
              className="mx-auto h-1 w-10 shrink-0 rounded-full bg-ink/25"
              aria-hidden="true"
            />
            <span className="flex-1 truncate text-left text-[13px] font-semibold text-muted-foreground">
              {label}
            </span>
            {expanded ? (
              <ChevronDown className="size-4 shrink-0" aria-hidden="true" />
            ) : (
              <ChevronUp className="size-4 shrink-0" aria-hidden="true" />
            )}
          </button>
          <div
            id={contentId}
            role="region"
            aria-label={label}
            data-testid={testid}
            tabIndex={0}
            className={cn(
              "overscroll-contain transition-[max-height] duration-300 motion-reduce:transition-none",
              expanded
                ? "max-h-[35dvh] overflow-y-auto"
                : "max-h-[9.5rem] overflow-y-auto",
            )}
          >
            <div className="grid gap-4 px-4 pb-4 pt-1 [&>*]:min-w-0">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
