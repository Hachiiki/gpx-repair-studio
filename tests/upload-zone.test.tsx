// @vitest-environment jsdom
/**
 * React Testing Library — UploadZone behavior (§N-2: upload flow with a
 * mocked File).
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UploadZone } from "@/components/gpx/upload-zone";

afterEach(() => cleanup());

function makeFile(name = "run.gpx") {
  return new File(["<gpx></gpx>"], name, { type: "application/gpx+xml" });
}

describe("UploadZone", () => {
  it("exposes a keyboard-accessible file input accepting .gpx/.xml", () => {
    const { container } = render(<UploadZone onFile={vi.fn()} />);
    const fileInput = container.querySelector<HTMLInputElement>(
      'input[type="file"]',
    );
    expect(fileInput).not.toBeNull();
    expect(fileInput).toHaveAttribute("accept", ".gpx,.xml");
    // The visible zone is a <label for=…>: keyboard users reach the native
    // picker by focusing the input itself.
    expect(fileInput).not.toBeDisabled();
  });

  it("hands a dropped file to onFile", () => {
    const onFile = vi.fn();
    render(<UploadZone onFile={onFile} />);

    const file = makeFile("dropped.gpx");
    fireEvent.drop(screen.getByTestId("upload-zone"), {
      dataTransfer: { files: [file] },
    });

    expect(onFile).toHaveBeenCalledTimes(1);
    expect(onFile).toHaveBeenCalledWith(file);
  });

  it("ignores drops that carry no files", () => {
    const onFile = vi.fn();
    render(<UploadZone onFile={onFile} />);

    fireEvent.drop(screen.getByTestId("upload-zone"), {
      dataTransfer: { files: [] },
    });
    fireEvent.drop(screen.getByTestId("upload-zone"), {
      dataTransfer: {},
    });

    expect(onFile).not.toHaveBeenCalled();
  });

  it("highlights while dragging and reverts on leave", () => {
    render(<UploadZone onFile={vi.fn()} />);
    const zone = screen.getByTestId("upload-zone");

    fireEvent.dragOver(zone);
    expect(zone.className).toContain("border-primary");

    fireEvent.dragLeave(zone);
    expect(zone.className).not.toContain("border-primary");
  });

  it("states the local-processing privacy promise", () => {
    render(<UploadZone onFile={vi.fn()} />);
    expect(
      screen.getByText(/never leaves this device/i),
    ).toBeInTheDocument();
  });
});
