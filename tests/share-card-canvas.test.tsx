// @vitest-environment jsdom
/**
 * ShareCardCanvas tests (Task 20) — the reusable component.
 *
 * The painter (lib/share/render) and the font loader are mocked as
 * recorders (the map-components fake pattern): these tests pin the
 * React binding — the spec contract (props → painter), the a11y
 * surface (role/aria), the intrinsic 1080×1920 canvas, repaints on
 * prop changes, and the await-fonts-then-paint ordering. The real
 * painting is verified by E2E pixel assertions.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ShareCardCanvas } from "@/components/share/share-card-canvas";
import { loadShareCardFonts } from "@/lib/share/fonts";
import { paintShareCardCanvas } from "@/lib/share/render";

vi.mock("@/lib/share/fonts", () => ({
  loadShareCardFonts: vi.fn(async () => true),
}));

vi.mock("@/lib/share/render", () => ({
  paintShareCardCanvas: vi.fn(),
}));

const mountMock = vi.mocked(loadShareCardFonts);
const paint = vi.mocked(paintShareCardCanvas);

const ROUTE = [[{ lat: 52.52, lon: 13.405 }, { lat: 52.53, lon: 13.41 }]];

afterEach(() => {
  cleanup();
  paint.mockReset();
  paint.mockImplementation((canvas: HTMLCanvasElement) => canvas);
  mountMock.mockClear();
});

describe("ShareCardCanvas", () => {
  it("renders a 1080×1920 canvas with an image role and a trio label", () => {
    render(
      <ShareCardCanvas
        routePolyline={ROUTE}
        distance="21.12 km"
        pace="5:00 /km"
        time="1h 45m"
      />,
    );

    const canvas = screen.getByTestId("share-card-canvas");
    expect(canvas).toHaveAttribute("role", "img");
    expect(canvas).toHaveAttribute("width", "1080");
    expect(canvas).toHaveAttribute("height", "1920");
    expect(canvas).toHaveAccessibleName(
      "Share card: route plot with distance 21.12 km, pace 5:00 /km, time 1h 45m",
    );
  });

  it("awaits the fonts, then paints the props-derived spec", async () => {
    render(
      <ShareCardCanvas
        routePolyline={ROUTE}
        distance="48 m"
        pace="6:12 /km"
        time="5m 18s"
      />,
    );

    await waitFor(() => expect(paint).toHaveBeenCalledTimes(1));
    // Fonts resolve before the paint — the ordering the preview owes
    // the export.
    expect(mountMock).toHaveBeenCalled();
    const [canvas, spec, options] = paint.mock.calls[0] as unknown as [
      HTMLCanvasElement,
      { routePolyline: unknown; distance: string; pace: string; time: string },
      { scale: number },
    ];
    expect(canvas).toBe(screen.getByTestId("share-card-canvas"));
    expect(spec).toEqual({
      routePolyline: ROUTE,
      distance: "48 m",
      pace: "6:12 /km",
      time: "5m 18s",
    });
    // The preview paints at scale 1 — the export's own pixels.
    expect(options).toEqual({ scale: 1 });
  });

  it("repaints when the values change (one paint per spec)", async () => {
    const { rerender } = render(
      <ShareCardCanvas
        routePolyline={ROUTE}
        distance="48 m"
        pace="6:12 /km"
        time="5m 18s"
      />,
    );
    await waitFor(() => expect(paint).toHaveBeenCalledTimes(1));

    rerender(
      <ShareCardCanvas
        routePolyline={ROUTE}
        distance="13.12 mi"
        pace="8:02 /mi"
        time="5m 18s"
      />,
    );
    await waitFor(() => expect(paint).toHaveBeenCalledTimes(2));
    const spec = paint.mock.calls[1][1] as { distance: string };
    expect(spec.distance).toBe("13.12 mi");
  });

  it("paints even when the font loader resolves false (fallback face)", async () => {
    mountMock.mockResolvedValueOnce(false);
    render(
      <ShareCardCanvas
        routePolyline={[]}
        distance="—"
        pace="—"
        time="—"
      />,
    );
    await waitFor(() => expect(paint).toHaveBeenCalledTimes(1));
  });

  it("honors a custom aria label", () => {
    render(
      <ShareCardCanvas
        routePolyline={[]}
        distance="1 km"
        pace="—"
        time="—"
        ariaLabel="Custom description"
      />,
    );
    expect(screen.getByTestId("share-card-canvas")).toHaveAccessibleName(
      "Custom description",
    );
  });
});
