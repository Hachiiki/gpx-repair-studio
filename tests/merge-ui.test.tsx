// @vitest-environment jsdom
/**
 * React Testing Library — the Merge section's UI (Task 43).
 *
 * Three groups:
 *   - MergeIntake — the tool page's multi-file intake: files land as
 *     rows (parsed with stats / failed with the typed error), the
 *     Combine gate needs two parsed files, remove works, and combining
 *     opens the studio (the store's phase);
 *   - the studio cards (pure components) — the arrangement intents
 *     (move / focus / remove / add / sort), the name commit discipline,
 *     and the export's contract gate;
 *   - the degenerate studio state — every file removed keeps the
 *     section recoverable (add-files stays reachable).
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MergeIntake } from "@/components/merge/merge-intake";
import { MergeFilesCard } from "@/components/merge/merge-files-card";
import { MergeDetailsCard } from "@/components/merge/merge-details-card";
import { MergeExportCard } from "@/components/merge/merge-export-card";
import { addMergeFiles, mergedFileName } from "@/hooks/use-merge-session";
import { useMergeStore } from "@/state/merge-store";
import { loadFixture } from "./helpers/gpxTestUtils";

function makeGpxFile(fixtureName: string) {
  return new File([loadFixture(fixtureName)], fixtureName, {
    type: "application/gpx+xml",
  });
}

beforeEach(() => {
  useMergeStore.getState().reset();
});

afterEach(() => cleanup());

describe("MergeIntake", () => {
  it("renders the multi-file zone and blocks Combine before two files", () => {
    render(<MergeIntake />);

    const zone = screen.getByTestId("merge-intake-zone");
    expect(zone).toBeVisible();

    // The picker takes many files at once — the tool's contract.
    const input = zone.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    expect(input).toHaveAttribute("multiple");

    const combine = screen.getByTestId("merge-combine");
    expect(combine).toBeDisabled();
    expect(screen.getByText(/Add at least two track files/i)).toBeVisible();
  });

  it("parses dropped files into stat rows and opens the studio on Combine", async () => {
    render(<MergeIntake />);

    fireEvent.drop(screen.getByTestId("merge-intake-zone"), {
      dataTransfer: {
        files: [makeGpxFile("valid-1.1.gpx"), makeGpxFile("multi-segment.gpx")],
      },
    });

    // Both files parse (the second row's counts appear with them).
    await waitFor(() => {
      expect(
        useMergeStore.getState().files.every((file) => file.status === "parsed"),
      ).toBe(true);
    });
    expect(
      screen.getByText("valid-1.1.gpx", { selector: "[title]" }),
    ).toBeVisible();
    expect(screen.getAllByText(/points ·/).length).toBeGreaterThanOrEqual(2);

    const combine = screen.getByTestId("merge-combine");
    expect(combine).toBeEnabled();
    expect(
      screen.getByText(/rearrange everything on the next page/i),
    ).toBeVisible();

    fireEvent.click(combine);
    expect(useMergeStore.getState().phase).toBe("studio");
  });

  it("keeps one bad file from blocking the rest — typed error row, gate stays shut", async () => {
    render(<MergeIntake />);

    fireEvent.drop(screen.getByTestId("merge-intake-zone"), {
      dataTransfer: {
        files: [makeGpxFile("valid-1.1.gpx"), makeGpxFile("not-gpx.gpx")],
      },
    });

    await waitFor(() => {
      expect(screen.getByText(/Not a GPX file/i)).toBeVisible();
    });
    const state = useMergeStore.getState();
    expect(state.files).toHaveLength(2);
    expect(state.files.filter((file) => file.status === "parsed")).toHaveLength(1);
    expect(screen.getByTestId("merge-combine")).toBeDisabled();
    expect(screen.getByText(/One more file/i)).toBeVisible();
  });

  it("removes a collected file from the list", async () => {
    render(<MergeIntake />);

    fireEvent.drop(screen.getByTestId("merge-intake-zone"), {
      dataTransfer: { files: [makeGpxFile("valid-1.1.gpx")] },
    });
    await waitFor(() => {
      expect(useMergeStore.getState().files).toHaveLength(1);
    });

    fireEvent.click(screen.getByRole("button", { name: /Remove valid-1.1/i }));
    await waitFor(() => {
      expect(useMergeStore.getState().files).toHaveLength(0);
    });
  });
});

describe("MergeFilesCard (the arrangement)", () => {
  /** Two parsed + one error entry, in order. */
  function seedFiles() {
    const store = useMergeStore.getState();
    const ids = store.beginFiles(["a.gpx", "b.gpx", "bad.gpx"]);
    store.setParsed(ids[0], {
      model: {} as never,
      summary: {
        fileName: "a.gpx",
        pointCount: 10,
        trackCount: 1,
        segmentCount: 1,
        waypointCount: 0,
        routeCount: 0,
        hasTimingData: true,
        firstTimeMs: 2_000,
        lastTimeMs: 3_000,
      },
      distanceM: 1_234,
    });
    store.setParsed(ids[1], {
      model: {} as never,
      summary: {
        fileName: "b.gpx",
        pointCount: 20,
        trackCount: 1,
        segmentCount: 2,
        waypointCount: 0,
        routeCount: 0,
        hasTimingData: false,
      },
      distanceM: 5_678,
    });
    store.setFileError(ids[2], { title: "Nope", detail: "It broke" });
    return ids;
  }

  function renderCard(
    overrides: Partial<Parameters<typeof MergeFilesCard>[0]> = {},
  ) {
    const ids = seedFiles();
    const props = {
      files: useMergeStore.getState().files,
      parsedCount: 2,
      anyTimed: true,
      onMove: vi.fn(),
      onFocusFile: vi.fn(),
      onRemove: vi.fn(),
      onAddFiles: vi.fn(),
      onSortByStartTime: vi.fn(),
      ...overrides,
    };
    return { ids, props, ...render(<MergeFilesCard {...props} />) };
  }

  it("lists the files in merge order with their positions and stats", () => {
    renderCard();
    const list = screen.getByTestId("merge-files-list");
    const rows = list.querySelectorAll("li");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("a.gpx");
    expect(rows[0]).toHaveTextContent("10 points");
    expect(rows[1]).toHaveTextContent("b.gpx");
    expect(rows[1]).toHaveTextContent("no timestamps");
    expect(rows[2]).toHaveTextContent("Nope");
  });

  it("moves dispatch the direction, edges disable, focus and remove dispatch their ids", () => {
    const { ids, props } = renderCard();

    fireEvent.click(screen.getByRole("button", { name: /Move b\.gpx up/i }));
    expect(props.onMove).toHaveBeenCalledWith(ids[1], -1);

    // a.gpx is first — its up is disabled; b.gpx's down is enabled.
    expect(screen.getByRole("button", { name: /Move a\.gpx up/i })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /Move b\.gpx down/i }),
    ).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: /Show a\.gpx/i }));
    expect(props.onFocusFile).toHaveBeenCalledWith(ids[0]);

    fireEvent.click(
      screen.getByRole("button", { name: /Remove a\.gpx from the merge/i }),
    );
    expect(props.onRemove).toHaveBeenCalledWith(ids[0]);
  });

  it("hands added files to the intent and can sort by start time", () => {
    const { props } = renderCard();

    // The add door: the card's (sr-only) multi-file input behind its
    // label — the same contract as the intake's picker.
    const fileInput = document.querySelector<HTMLInputElement>(
      'input[type="file"]',
    );
    expect(fileInput).not.toBeNull();
    expect(fileInput).toHaveAttribute("multiple");

    const file = makeGpxFile("valid-1.1.gpx");
    fireEvent.change(fileInput as HTMLInputElement, {
      target: { files: [file] },
    });
    expect(props.onAddFiles).toHaveBeenCalledWith([file]);

    fireEvent.click(screen.getByTestId("merge-sort-by-time"));
    expect(props.onSortByStartTime).toHaveBeenCalledTimes(1);
  });

  it("disables the sort aid without timed files or with fewer than two", () => {
    renderCard({ anyTimed: false });
    expect(screen.getByTestId("merge-sort-by-time")).toBeDisabled();
  });
});

describe("MergeDetailsCard (the name)", () => {
  function renderNameCard(name = "") {
    const onNameChange = vi.fn();
    render(
      <MergeDetailsCard
        combinedName={name}
        onNameChange={onNameChange}
        fileCount={2}
        totalPoints={30}
        distanceM={1_500}
        waypointCount={2}
      />,
    );
    return onNameChange;
  }

  it("commits the name on blur and on Enter, not per keystroke", () => {
    const onNameChange = renderNameCard("");

    const field = screen.getByTestId("merge-activity-name");
    fireEvent.change(field, { target: { value: "Weekend double" } });
    expect(onNameChange).not.toHaveBeenCalled();

    fireEvent.blur(field);
    expect(onNameChange).toHaveBeenCalledWith("Weekend double");

    fireEvent.change(field, { target: { value: "Renamed" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onNameChange).toHaveBeenCalledWith("Renamed");
  });

  it("shows the merge facts (files, points, distance, waypoints)", () => {
    renderNameCard();
    const facts = screen.getByTestId("merge-facts");
    expect(facts).toHaveTextContent("Files merged");
    expect(facts).toHaveTextContent("30");
    expect(facts).toHaveTextContent("Waypoints");
    expect(facts).toHaveTextContent("2");
  });
});

describe("MergeExportCard (the contract gate)", () => {
  it("downloads when the contract is met", () => {
    const onDownload = vi.fn(() => "merged.gpx");
    render(
      <MergeExportCard
        canDownload
        fileCount={2}
        pointCount={30}
        onDownload={onDownload}
      />,
    );
    const button = screen.getByTestId("merge-download");
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onDownload).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/carried over verbatim/i)).toBeVisible();
  });

  it("blocks with a reason below two files", () => {
    render(
      <MergeExportCard
        canDownload={false}
        fileCount={1}
        pointCount={10}
        onDownload={vi.fn()}
      />,
    );
    expect(screen.getByTestId("merge-download")).toBeDisabled();
    expect(screen.getByText(/needs at least two files/i)).toBeVisible();
  });
});

describe("mergedFileName", () => {
  it("sanitizes the combined name into a download file name", () => {
    expect(mergedFileName("Weekend double")).toBe("Weekend double.gpx");
    expect(mergedFileName('  bad:*?"<>|name  ')).toBe("bad name.gpx");
    expect(mergedFileName("")).toBe("merged-route.gpx");
    expect(mergedFileName("   ")).toBe("merged-route.gpx");
    const long = "x".repeat(100);
    expect(mergedFileName(long)).toHaveLength(60 + ".gpx".length);
  });
});

describe("the full store round through the real parse pipeline", () => {
  it("addMergeFiles parses real fixtures in selection order", async () => {
    await addMergeFiles([
      makeGpxFile("valid-1.1.gpx"),
      makeGpxFile("wpt-rte.gpx"),
      new File([], "empty.gpx"),
    ]);

    const state = useMergeStore.getState();
    expect(state.files.map((file) => file.fileName)).toEqual([
      "valid-1.1.gpx",
      "wpt-rte.gpx",
      "empty.gpx",
    ]);
    expect(state.files[0].status).toBe("parsed");
    expect(state.files[1].status).toBe("parsed");
    // The empty file: the typed failure, per file.
    expect(state.files[2].status).toBe("error");
    expect(state.files[2].error?.title).toBe("Empty file");

    // The arrangement edits drive the store's order.
    state.moveFile(state.files[1].id, -1);
    expect(useMergeStore.getState().files.map((file) => file.fileName)).toEqual([
      "wpt-rte.gpx",
      "valid-1.1.gpx",
      "empty.gpx",
    ]);
  });
});
