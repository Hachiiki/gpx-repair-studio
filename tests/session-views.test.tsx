// @vitest-environment jsdom
/**
 * React Testing Library — the extracted session views (AppShell
 * reorganization pass):
 *
 *   - SessionIdleView: the landing hero (heading + upload zone), the
 *     error-retry path (alert above the hero, zone still available),
 *     and the three-step workflow teaching section;
 *   - SessionLoadingView: a polite live region that announces the
 *     parsing state with the file name (the a11y fix of this pass).
 *
 * Pure presentation — props in, no store wiring needed.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  SessionIdleView,
  SessionLoadingView,
} from "@/components/layout/session-views";
import type { SessionError } from "@/state/session-store";

afterEach(() => cleanup());

const error: SessionError = {
  title: "Not a GPX file",
  detail: "The root element was <rss>, not <gpx>.",
};

describe("SessionIdleView", () => {
  it("renders the hero heading and the upload zone", () => {
    render(<SessionIdleView error={null} onFile={() => {}} />);

    expect(
      screen.getByRole("heading", { name: "Repair incomplete GPS recordings" }),
    ).toBeVisible();
    expect(screen.getByTestId("upload-zone")).toBeVisible();
    expect(screen.queryByTestId("session-error")).toBeNull();
  });

  it("surfaces a failed load above the hero, keeping the zone for retry", () => {
    render(<SessionIdleView error={error} onFile={() => {}} />);

    const alert = screen.getByTestId("session-error");
    expect(alert).toHaveTextContent("Not a GPX file");
    // The intake stays available — an error is a retry, not a dead end.
    expect(screen.getByTestId("upload-zone")).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Repair incomplete GPS recordings" }),
    ).toBeVisible();
  });

  it("teaches the three workflow steps under a 'How it works' heading", () => {
    render(<SessionIdleView error={null} onFile={() => {}} />);

    expect(
      screen.getByRole("heading", { name: "How it works" }),
    ).toBeVisible();
    const steps = screen.getByTestId("workflow-steps");
    expect(steps).toHaveTextContent("Inspect");
    expect(steps).toHaveTextContent("Repair");
    expect(steps).toHaveTextContent("Honest by default");
    // Three list items — the pipeline is a list, not a suggestion.
    expect(steps.querySelectorAll("li")).toHaveLength(3);
  });

  it("hands the chosen file to the onFile intent", () => {
    const files: File[] = [];
    render(<SessionIdleView error={null} onFile={(f) => files.push(f)} />);

    const file = new File(["<gpx/>"], "run.gpx", { type: "application/gpx+xml" });
    fireEvent.drop(screen.getByTestId("upload-zone"), {
      dataTransfer: { files: [file] },
    });

    expect(files).toEqual([file]);
  });
});

describe("SessionLoadingView", () => {
  it("politely announces the parsing state with the file name", () => {
    render(<SessionLoadingView fileName="morning-run.gpx" />);

    const status = screen.getByTestId("loading-state");
    // role="status" → polite live region: screen readers announce the
    // transition instead of staying silent through the parse.
    expect(status).toHaveAttribute("role", "status");
    expect(status).toHaveTextContent("Parsing morning-run.gpx");
  });

  it("falls back to a generic label when the name is unknown", () => {
    render(<SessionLoadingView fileName={null} />);

    expect(screen.getByTestId("loading-state")).toHaveTextContent(
      "Parsing your file",
    );
  });
});
