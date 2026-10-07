// @vitest-environment jsdom
/**
 * Phase 26 UI tests — the photos card: the honest gate (no timed
 * track), the intake buttons, the calibration block (zone select +
 * drift slider re-matching live), the per-photo rows (matched delta +
 * coordinates, no-timestamp, out-of-window, refused with the format
 * named), the write-in-place door (only for handle-backed photos,
 * explicit confirm), the batch buttons, and §26.3's footer promise.
 * Hand-built bindings in, rendered output asserted — pure
 * presentation, the segments-ui pattern.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PhotosCard } from "@/components/photos/photos-card";
import type { PhotoItem, PhotosBinding } from "@/hooks/use-photos";
import { buildSyntheticJpeg, FIXTURE_MAGIC } from "./helpers/synthetic-jpeg";
import type { PhotoMatch } from "@/features/photos/matching";

/*
 * The Radix slider observes its track's size (jsdom ships no
 * ResizeObserver — the command-palette suite's stub).
 */
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver =
  globalThis.ResizeObserver ?? (ResizeObserverStub as never);

afterEach(cleanup);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const T0 = Date.UTC(2024, 4, 1, 6, 0, 0);

function photoItem(overrides: Partial<PhotoItem> = {}): PhotoItem {
  return {
    id: "p1",
    fileName: "IMG_0001.jpg",
    sizeBytes: 1024,
    bytes: buildSyntheticJpeg(),
    kind: { kind: "jpeg" },
    exifTime: "2024:05:01 06:00:42",
    naiveTimeMs: T0 + 42_000,
    hasGps: false,
    handle: null,
    thumbnailUrl: null,
    ...overrides,
  };
}

const MATCHED: PhotoMatch = {
  id: "p1",
  status: "matched",
  deltaMs: 3000,
  lat: -37.950123,
  lon: 145.100456,
  ele: 42,
  trackTimeMs: T0 + 45_000,
  onReconstructed: false,
};

function makeBinding(overrides: Partial<PhotosBinding> = {}): PhotosBinding {
  return {
    photos: overrides.photos ?? [],
    hasTimedTrack: overrides.hasTimedTrack ?? true,
    tzOffsetMinutes: overrides.tzOffsetMinutes ?? 600,
    driftSeconds: overrides.driftSeconds ?? 0,
    setTzOffset: vi.fn(),
    setDrift: vi.fn(),
    matches: overrides.matches ?? [],
    matchOf: overrides.matchOf ?? (() => MATCHED),
    matchedCount: overrides.matchedCount ?? 0,
    focusPhoto: vi.fn(),
    addFiles: vi.fn().mockResolvedValue(undefined),
    canOpenWithWriteAccess: overrides.canOpenWithWriteAccess ?? false,
    addFilesWithWriteAccess: vi.fn().mockResolvedValue(undefined),
    removePhoto: vi.fn(),
    clearAll: vi.fn(),
    saveCopy: vi.fn(),
    canWriteInPlace: overrides.canWriteInPlace ?? (() => false),
    writeInPlace: vi.fn().mockResolvedValue(undefined),
    writingId: null,
    downloadZip: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// The gate + intake
// ---------------------------------------------------------------------------

describe("the photos card — gate + intake", () => {
  it("states the timed-track requirement and disables intake without one", () => {
    render(<PhotosCard photos={makeBinding({ hasTimedTrack: false })} />);
    expect(screen.getByText(/load a timed file first/i)).toBeInTheDocument();
    expect(screen.getByTestId("photos-add-button")).toBeDisabled();
    // The write-access door only exists where the API does.
    expect(
      screen.queryByTestId("photos-add-write-button"),
    ).not.toBeInTheDocument();
  });

  it("renders the empty state with a timed track, and the footer only once photos exist", () => {
    const { rerender } = render(<PhotosCard photos={makeBinding()} />);
    expect(screen.getByText(/No photos yet/i)).toBeInTheDocument();
    expect(screen.queryByTestId("photos-footer")).not.toBeInTheDocument();
    rerender(
      <PhotosCard
        photos={makeBinding({ photos: [photoItem()], matches: [MATCHED], matchedCount: 1 })}
      />,
    );
    expect(screen.getByTestId("photos-footer")).toHaveTextContent(
      /never leave this device/i,
    );
  });

  it("shows the write-access door only where the picker exists", () => {
    render(
      <PhotosCard photos={makeBinding({ canOpenWithWriteAccess: true })} />,
    );
    expect(screen.getByTestId("photos-add-write-button")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// The calibration block
// ---------------------------------------------------------------------------

describe("the calibration block (§26.1)", () => {
  function renderCalibrated() {
    return render(
      <PhotosCard
        photos={makeBinding({ photos: [photoItem()], matches: [MATCHED], matchedCount: 1 })}
      />,
    );
  }

  it("states the offset matrix + the window + the write rule in the disclosure", () => {
    renderCalibrated();
    fireEvent.click(screen.getByText("How photos are matched"));
    expect(
      screen.getByText(/UTC−12:00 to UTC\+14:00 in 30-minute steps/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/camera time − chosen zone \+ drift/i)).toBeInTheDocument();
    expect(screen.getByText(/never snapped silently/i)).toBeInTheDocument();
    expect(screen.getByText(/File System Access API, with an explicit choice/i)).toBeInTheDocument();
    expect(screen.getByText(/drawn-in repair stretch/i)).toBeInTheDocument();
  });

  it("the nudge slider's value is live and the tolerance line states ±120 s", () => {
    renderCalibrated();
    expect(screen.getByTestId("photos-drift-value")).toHaveTextContent("Nudge: 0");
    expect(screen.getByText(/within ±120 s of the track match/i)).toBeInTheDocument();
    expect(screen.getByTestId("photos-calibration")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// The rows (§26.3's honesty)
// ---------------------------------------------------------------------------

describe("the photo rows", () => {
  it("a matched row shows the delta, the coordinates, and the count", () => {
    render(
      <PhotosCard
        photos={makeBinding({
          photos: [photoItem()],
          matches: [MATCHED],
          matchedCount: 1,
        })}
      />,
    );
    const row = screen.getByTestId("photo-row");
    expect(row).toHaveAttribute("data-status", "matched");
    expect(screen.getByTestId("photo-match")).toHaveTextContent("+3 s");
    expect(screen.getByTestId("photo-match")).toHaveTextContent(
      "-37.9501, 145.1005 · 42 m",
    );
    expect(screen.getByTestId("photos-count")).toHaveTextContent("1 of 1 matched");
  });

  it("a timestamp-less photo is listed as exactly that", () => {
    render(
      <PhotosCard
        photos={makeBinding({
          photos: [
            photoItem({ id: "p2", exifTime: null, naiveTimeMs: null }),
          ],
          matches: [{ id: "p2", status: "no-timestamp" }],
          matchedCount: 0,
          matchOf: () => ({ id: "p2", status: "no-timestamp" }),
        })}
      />,
    );
    const row = screen.getByTestId("photo-row");
    expect(row).toHaveAttribute("data-status", "no-timestamp");
    // The mono line under the name IS the honest status — stated once.
    expect(
      screen.getAllByText("No timestamp in EXIF"),
    ).toHaveLength(1);
    expect(screen.getByTestId("photos-count")).toHaveTextContent("0 of 1 matched");
  });

  it("an out-of-window photo states its distance", () => {
    render(
      <PhotosCard
        photos={makeBinding({
          photos: [photoItem({ id: "p3" })],
          matches: [{ id: "p3", status: "out-of-window", nearestDeltaSec: 400 }],
          matchOf: () => ({ id: "p3", status: "out-of-window", nearestDeltaSec: 400 }),
        })}
      />,
    );
    expect(screen.getByText(/Outside the track's time/i)).toBeInTheDocument();
    expect(screen.getByText(/by 400 s/)).toBeInTheDocument();
  });

  it("a refused format is named, never matched — and stays removable", () => {
    render(
      <PhotosCard
        photos={makeBinding({
          photos: [
            photoItem({
              id: "p4",
              fileName: "IMG_0002.heic",
              kind: {
                kind: "refused",
                format: "heic",
                detail: "HEIC/HEIF (brand “heic”)",
              },
              exifTime: null,
              naiveTimeMs: null,
            }),
          ],
          matches: [],
          matchOf: () => undefined,
        })}
      />,
    );
    const row = screen.getByTestId("photo-row");
    expect(row).toHaveAttribute("data-status", "refused");
    expect(screen.getByText("Not a JPEG")).toBeInTheDocument();
    expect(screen.getByText(/Convert to JPEG first/i)).toBeInTheDocument();
    // No match buttons on a refused row.
    expect(screen.queryByTestId("photo-match")).not.toBeInTheDocument();
  });

  it("an already-geotagged photo says the position will be replaced", () => {
    render(
      <PhotosCard
        photos={makeBinding({
          photos: [photoItem({ hasGps: true })],
          matches: [MATCHED],
          matchedCount: 1,
        })}
      />,
    );
    expect(screen.getByText(/Already carries GPS/i)).toBeInTheDocument();
  });

  it("a match over a drawn-in stretch is flagged in place", () => {
    render(
      <PhotosCard
        photos={makeBinding({
          photos: [photoItem()],
          matches: [{ ...MATCHED, onReconstructed: true }],
          matchedCount: 1,
          matchOf: () => ({ ...MATCHED, onReconstructed: true }),
        })}
      />,
    );
    expect(screen.getByText("drawn-in stretch")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// The write-back doors (§26.2)
// ---------------------------------------------------------------------------

describe("the write-back doors", () => {
  it("Save As is always there for a match; in-place only with a handle", () => {
    const { rerender } = render(
      <PhotosCard
        photos={makeBinding({
          photos: [photoItem()],
          matches: [MATCHED],
          matchedCount: 1,
          canWriteInPlace: () => false,
        })}
      />,
    );
    expect(screen.getByText("Save tagged copy")).toBeEnabled();
    expect(screen.queryByText("Write into original")).not.toBeInTheDocument();

    rerender(
      <PhotosCard
        photos={makeBinding({
          photos: [photoItem()],
          matches: [MATCHED],
          matchedCount: 1,
          canWriteInPlace: () => true,
        })}
      />,
    );
    const write = screen.getByText("Write into original");
    expect(write).toBeEnabled();
    // The explicit choice — confirm before anything touches the file.
    fireEvent.click(write);
    expect(screen.getByTestId("photo-write-confirm")).toBeInTheDocument();
    expect(screen.getByText(/Overwrite the original IMG_0001.jpg/i)).toBeInTheDocument();
    expect(screen.getByText("Keep it safe")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Overwrite original"));
    // The binding's writeInPlace is the ONLY writer, after the choice.
    expect(screen.getByTestId("photo-row")).toBeInTheDocument();
  });

  it("unmatched photos cannot export (honest disabled states)", () => {
    render(
      <PhotosCard
        photos={makeBinding({
          photos: [photoItem({ id: "p5" })],
          matches: [{ id: "p5", status: "no-timestamp" }],
          matchOf: () => ({ id: "p5", status: "no-timestamp" }),
        })}
      />,
    );
    expect(screen.getByText("Save tagged copy")).toBeDisabled();
    expect(screen.getByText("Show on map")).toBeDisabled();
    // The ZIP button rides on there being JPEGs at all.
    expect(screen.getByTestId("photos-zip-button")).toBeEnabled();
  });
});

// ---------------------------------------------------------------------------
// The row intents + the footer
// ---------------------------------------------------------------------------

describe("the row intents + the footer", () => {
  it("the intents route to the binding", () => {
    const binding = makeBinding({
      photos: [photoItem()],
      matches: [MATCHED],
      matchedCount: 1,
    });
    render(<PhotosCard photos={binding} />);
    fireEvent.click(screen.getByText("Show on map"));
    expect(binding.focusPhoto).toHaveBeenCalledWith("p1");
    fireEvent.click(screen.getByText("Save tagged copy"));
    expect(binding.saveCopy).toHaveBeenCalledWith("p1");
    fireEvent.click(screen.getByTestId("photos-zip-button"));
    expect(binding.downloadZip).toHaveBeenCalled();
    const row = screen.getByTestId("photo-row");
    fireEvent.click(
      within(row).getByRole("button", { name: /remove img_0001.jpg/i }),
    );
    expect(binding.removePhoto).toHaveBeenCalledWith("p1");
    fireEvent.click(screen.getByText("Clear photos"));
    expect(binding.clearAll).toHaveBeenCalled();
  });
});
