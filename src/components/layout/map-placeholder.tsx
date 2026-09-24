/**
 * MapPlaceholder — the center panel stand-in for the interactive map
 * (Phase 3 per the phased plan; Phase 2 non-goal: "map rendering").
 *
 * Keeps the map's grid slot occupied and honest: it shows the recorded
 * extent (bounding box of usable points) as text, which also serves as
 * the non-visual equivalent required by the accessibility strategy (§C-5)
 * until the real map + ARIA layer lands.
 */

import { Card, CardContent } from "@/components/ui/card";
import { MapIcon } from "lucide-react";
import type { BBox } from "@/lib/geo/bbox";

export function MapPlaceholder({ extent }: { extent: BBox | null }) {
  return (
    <Card className="min-h-64" data-testid="map-placeholder">
      <CardContent className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <span className="rounded-full bg-muted p-3">
          <MapIcon className="size-6 text-muted-foreground" aria-hidden="true" />
        </span>
        <div className="space-y-1">
          <h3 className="font-semibold">Interactive map arrives next</h3>
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">
            The recorded route will be drawn on an interactive map in the
            next development phase. For now, inspect the activity with the
            textual panels.
          </p>
        </div>
        {extent && (
          <p className="rounded-lg border bg-muted/40 px-3 py-2 font-mono text-xs text-muted-foreground">
            Recorded extent: lat {extent.minLat.toFixed(5)} …{" "}
            {extent.maxLat.toFixed(5)}, lon {extent.minLon.toFixed(5)} …{" "}
            {extent.maxLon.toFixed(5)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
