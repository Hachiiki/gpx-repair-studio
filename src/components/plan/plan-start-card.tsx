/**
 * PlanStartCard — the "plan a route" tool page's intake (Task 50).
 *
 * Every other tool's intake is an upload zone, a statistics form, or a
 * multi-file picker — the planner's input is just the map itself, so
 * the intake is one honest card: what this scratchpad does (draw, read
 * the estimates, enter a time for the pace), what it deliberately does
 * NOT do (no export, no share — the user's explicit contract for this
 * feature), and the single "Start planning" intent that enters the
 * studio.
 *
 * Pure presentation: intents out (`onBegin`), no stores.
 */

"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { PencilRuler, Ruler, ShieldOff } from "lucide-react";

export interface PlanStartCardProps {
  /** Enter the planning studio (the landing page's tool intent). */
  onBegin: () => void;
}

export function PlanStartCard({ onBegin }: PlanStartCardProps) {
  return (
    <Card
      className="w-full border-[1.5px] border-ink"
      data-testid="plan-start-card"
    >
      <CardHeader>
        <h3 className="flex items-center gap-2 text-[15.5px] font-bold leading-tight">
          <PencilRuler className="size-4 text-signal" aria-hidden="true" />
          Nothing to upload
        </h3>
        <CardDescription>
          The map is the input — sketch a route and read its numbers.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <ul className="grid gap-1.5 text-[13px] leading-relaxed text-muted-foreground">
          <li className="flex items-start gap-2">
            <Ruler
              className="mt-0.5 size-3.5 shrink-0 text-shade"
              aria-hidden="true"
            />
            <span>
              Estimate distance and elevation for roads and paths you
              draw — live, as the line takes shape.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <ShieldOff
              className="mt-0.5 size-3.5 shrink-0 text-shade"
              aria-hidden="true"
            />
            <span>
              Enter a time and see the pace it implies — a scratchpad for
              planning, with <strong>no export and no share</strong>:
              nothing leaves this page.
            </span>
          </li>
        </ul>
        <Button
          type="button"
          size="sm"
          className="h-9 w-full gap-1.5"
          data-testid="plan-start-button"
          onClick={onBegin}
        >
          <PencilRuler className="size-4" aria-hidden="true" />
          Start planning
        </Button>
      </CardContent>
    </Card>
  );
}
