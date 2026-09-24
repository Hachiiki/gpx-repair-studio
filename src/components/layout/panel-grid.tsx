/**
 * PanelGrid — the three-column inspection workspace (§F layout).
 *
 * Desktop: inspection column (left) · map slot (center) · findings column
 * (right). Mobile: single column in DOM order. The map slot is occupied
 * by a placeholder until Phase 3. Layout only — no data logic.
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
      <div className="grid min-w-0 gap-4">{inspection}</div>
      <div className="grid min-w-0 gap-4">{map}</div>
      <div className="grid min-w-0 gap-4">{findings}</div>
    </div>
  );
}
