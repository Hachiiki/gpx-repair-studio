/**
 * RevealOnScroll — a subtle entrance for below-the-fold sections
 * (QoL pass): content fades and lifts into place as it scrolls into
 * view.
 *
 * Implemented with CSS scroll-driven animations (`animation-timeline:
 * view()`) guarded by @supports + prefers-reduced-motion — no React
 * state, no IntersectionObserver, and browsers without support (or
 * users with reduced motion) simply see the content immediately.
 *
 * Pure presentation: children in, className out.
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface RevealOnScrollProps {
  children: ReactNode;
  className?: string;
}

export function RevealOnScroll({ children, className }: RevealOnScrollProps) {
  return (
    <div
      data-testid="reveal-on-scroll"
      className={cn("reveal-on-scroll", className)}
    >
      {children}
    </div>
  );
}
