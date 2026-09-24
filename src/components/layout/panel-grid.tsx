/**
 * PanelGrid — the three-column inspection workspace (§F layout).
 *
 * Desktop: inspection column (left) · map slot (center) · findings column
 * (right). Mobile: single column in DOM order. The map slot is occupied
 * by a placeholder until Phase 3. Layout only — no data logic.
 *
 * `[&>*]:min-w-0` on each column matters: cards are grid items, and a
 * grid item's default `min-width: auto` (= its min-content) lets any card
 * with wide intrinsic content (e.g. the statistics table, whose "Source"
 * badges cannot wrap) blow the column — and the whole mobile page — out
 * sideways. With `min-w-0`, such content shrinks and scrolls inside its
 * own overflow container instead (the table wrapper's `overflow-x-auto`).
 */

import type { ReactNode } from "react";

export function PanelGrid({
  inspection,
  map,
  findings,
}: {
  inspection: ReactNode;
  map: ReactNode;
  findings: ReactNode;
}) {
  return (
    <div className="grid w-full items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_minmax(0,1fr)]">
      <div className="grid min-w-0 gap-4 [&>*]:min-w-0">{inspection}</div>
      <div className="grid min-w-0 gap-4 [&>*]:min-w-0">{map}</div>
      <div className="grid min-w-0 gap-4 [&>*]:min-w-0">{findings}</div>
    </div>
  );
}
