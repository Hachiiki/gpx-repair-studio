/**
 * RevealOnScroll — a subtle entrance for below-the-fold sections
 * (QoL pass): content fades and lifts into place the first time it
 * scrolls into view.
 *
 * Safety contract (why this is not an IntersectionObserver-only gate):
 * the content is ALWAYS in the DOM and rendered — hiding is a visual
 * transition only, applied after mount via state. No-JS, SSR HTML, and
 * environments without IntersectionObserver (jsdom) simply see the
 * content immediately; `prefers-reduced-motion` skips the movement.
 */

"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface RevealOnScrollProps {
  children: ReactNode;
  className?: string;
}

export function RevealOnScroll({ children, className }: RevealOnScrollProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    // After mount the transition may arm; server HTML stays visible.
    setMounted(true);
    const element = ref.current;
    if (!element) {
      setShown(true);
      return;
    }
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            observer.disconnect();
          }
        }
      },
      // Reveal slightly before the section fully enters the viewport so
      // the animation is already running when the user's eye arrives.
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const hidden = mounted && !shown;

  return (
    <div
      ref={ref}
      data-testid="reveal-on-scroll"
      data-shown={shown ? "true" : "false"}
      className={cn(
        "transition-[opacity,translate] duration-500 ease-out motion-reduce:transition-none",
        hidden && "opacity-0 translate-y-3",
        className,
      )}
    >
      {children}
    </div>
  );
}
