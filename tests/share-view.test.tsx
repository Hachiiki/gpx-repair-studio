// @vitest-environment jsdom
/**
 * ShareView tests (Task 20) — the share-card session state.
 *
 * Pure presentation with a fake binding (the export-dialog test
 * pattern): the stage + canvas, the summary trio with its notes, the
 * scale selector, the download intent, and the bridge into the repair
 * workspace. ShareCardCanvas renders for real (its painter is mocked
 * in its own test file; here the real component is harmless under
 * jsdom — no FontFaceSet → fallback path).
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShareView } from "@/components/share/share-view";
import type { ShareCardBinding } from "@/hooks/use-share-card";

afterEach(() => cleanup());

function binding(
  overrides: Partial<ShareCardBinding> = {},
): ShareCardBinding {
  return {
    spec: {
      routePolyline: [[{ lat: 52.52, lon: 13.405 }, { lat: 52.53, lon: 13.41 }]],
      distance: "48 m",
      pace: "6:12 /km",
      time: "5m 18s",
    },
    content: {
      distance: "48 m",
      pace: "6:12 /km",
      time: "5m 18s",
      complete: true,
      notes: [],
      includesReimported: false,
    },
    routeEmpty: false,
    paceUnit: "km",
    setPaceUnit: () => {},
    downloadPng: () => {},
    ...overrides,
  };
}

describe("ShareView", () => {
  it("renders the stage, the card canvas, and the summary trio", () => {
    render(
      <ShareView fileName="morning-run.gpx" share={binding()} onOpenRepair={() => {}} />,
    );

    expect(screen.getByTestId("share-section")).toBeVisible();
    expect(screen.getByTestId("share-stage")).toBeVisible();
    expect(screen.getByTestId("share-card-canvas")).toBeInTheDocument();
    expect(screen.getByTestId("share-summary-distance")).toHaveTextContent("48 m");
    expect(screen.getByTestId("share-summary-pace")).toHaveTextContent("6:12 /km");
    expect(screen.getByTestId("share-summary-time")).toHaveTextContent("5m 18s");
    expect(screen.getByTestId("share-section")).toHaveTextContent("morning-run.gpx");
  });

  it("downloads at the selected scale (1× default, 2× opt-in)", () => {
    const downloads: number[] = [];
    render(
      <ShareView
        fileName="run.gpx"
        share={binding({ downloadPng: (scale) => downloads.push(scale) })}
        onOpenRepair={() => {}}
      />,
    );

    fireEvent.click(screen.getByTestId("share-download"));
    expect(downloads).toEqual([1]);

    fireEvent.click(screen.getByTestId("share-scale-2x"));
    expect(screen.getByTestId("share-scale-2x")).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByTestId("share-download"));
    expect(downloads).toEqual([1, 2]);
  });

  it("hands the repair switch to the intent", () => {
    const opened: string[] = [];
    render(
      <ShareView
        fileName="run.gpx"
        share={binding()}
        onOpenRepair={() => opened.push("repair")}
      />,
    );

    fireEvent.click(screen.getByTestId("share-open-repair"));
    expect(opened).toEqual(["repair"]);
  });

  it("warns when the file has no drawable route", () => {
    render(
      <ShareView
        fileName="empty.gpx"
        share={binding({ routeEmpty: true })}
        onOpenRepair={() => {}}
      />,
    );

    const note = screen.getByTestId("share-route-empty-note");
    expect(note).toHaveTextContent("no drawable route points");
  });

  it("surfaces the honesty notes (no fabricated values)", () => {
    render(
      <ShareView
        fileName="watch.gpx"
        share={binding({
          content: {
            distance: "14 m",
            pace: "—",
            time: "—",
            complete: false,
            notes: ["This file has no usable timestamps — an honest pace and time cannot be derived, so both show “—”."],
            includesReimported: false,
          },
          spec: {
            routePolyline: [],
            distance: "14 m",
            pace: "—",
            time: "—",
          },
        })}
        onOpenRepair={() => {}}
      />,
    );

    expect(screen.getByTestId("share-summary-pace")).toHaveTextContent("—");
    expect(screen.getByTestId("share-summary-time")).toHaveTextContent("—");
    expect(screen.getByTestId("share-section")).toHaveTextContent(
      "no usable timestamps",
    );
  });

  it("dispatches the pace-unit intent through the shared toggle", () => {
    const units: string[] = [];
    render(
      <ShareView
        fileName="run.gpx"
        share={binding({ setPaceUnit: (unit) => units.push(unit) })}
        onOpenRepair={() => {}}
      />,
    );

    fireEvent.click(screen.getByTestId("pace-unit-mi"));
    expect(units).toEqual(["mi"]);
  });
});
