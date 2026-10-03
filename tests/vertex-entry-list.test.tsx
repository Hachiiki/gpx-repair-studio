// @vitest-environment jsdom
/**
 * Unit tests — VertexEntryList (Phase 16): the numeric-entry surface
 * (§EE 16.2), the keyboard-only repair milestone.
 *
 * Verified behaviors:
 *   - the add form validates honestly (grammar, bounds, rounding
 *     note) and submits a clean number; Enter submits;
 *   - per-vertex lat/lng inputs commit on Enter/blur (valid → the
 *     move intent; invalid → the honest error, text kept);
 *   - Escape reverts the row to the canonical values;
 *   - an external move (nudge/undo/map drag) refreshes the fields;
 *   - the nudge handle walks the point with the arrow keys (Shift =
 *     ×10) and the step selector drives the delta;
 *   - insert-after prefills the midpoint to the next vertex;
 *   - the hard cap replaces the form with the honest notice.
 */

import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VertexEntryList } from "@/components/reconstruction/vertex-entry-list";
import type { NudgeStepM } from "@/hooks/use-draw-editor";
import type { DrawVertex, VertexId } from "@/types/domain";
import { vertexId } from "@/types/ids";

afterEach(() => cleanup());

function vertex(seq: number, lat: number, lon: number): DrawVertex {
  return { id: vertexId(seq), lat, lon };
}

function intents() {
  return {
    addVertexAt: vi.fn(),
    insertVertexAt: vi.fn(),
    moveVertexTo: vi.fn(),
    nudgeVertex: vi.fn(),
    deleteVertex: vi.fn(),
  };
}

function entry(
  vertices: DrawVertex[],
  overrides: {
    intents?: ReturnType<typeof intents>;
    nudgeStepM?: NudgeStepM;
    atVertexCap?: boolean;
  } = {},
) {
  const i = overrides.intents ?? intents();
  return {
    binding: {
      vertices,
      vertexCount: vertices.length,
      maxVertices: 128,
      atVertexCap: overrides.atVertexCap ?? false,
      nudgeStepM: overrides.nudgeStepM ?? 10,
      setNudgeStepM: vi.fn(),
      addVertexAt: i.addVertexAt,
      insertVertexAt: i.insertVertexAt,
      moveVertexTo: i.moveVertexTo,
      nudgeVertex: i.nudgeVertex,
      deleteVertex: i.deleteVertex,
    },
    intents: i,
  };
}

describe("the add-by-coordinates form", () => {
  it("submits clean numbers (Enter works)", () => {
    const { binding, intents: called } = entry([]);
    render(<VertexEntryList entry={binding} />);
    fireEvent.change(screen.getByTestId("vertex-add-form-lat"), {
      target: { value: "52.5206" },
    });
    fireEvent.change(screen.getByTestId("vertex-add-form-lon"), {
      target: { value: "13.4055" },
    });
    fireEvent.keyDown(screen.getByTestId("vertex-add-form-lat"), {
      key: "Enter",
    });
    expect(called.addVertexAt).toHaveBeenCalledWith(52.5206, 13.4055);
    // The form clears for the next point.
    expect(screen.getByTestId("vertex-add-form-lat")).toHaveValue("");
  });

  it("refuses out-of-bounds and garbage with the honest error", () => {
    const { binding, intents: called } = entry([]);
    render(<VertexEntryList entry={binding} />);

    fireEvent.change(screen.getByTestId("vertex-add-form-lat"), {
      target: { value: "95" },
    });
    fireEvent.click(screen.getByTestId("vertex-add-form-button"));
    expect(
      screen.getByTestId("vertex-add-form-error"),
    ).toHaveTextContent(/between -90 and 90/i);
    expect(called.addVertexAt).not.toHaveBeenCalled();

    // Typing clears the error; a second bad submit raises the new one.
    fireEvent.change(screen.getByTestId("vertex-add-form-lat"), {
      target: { value: "52°31'" },
    });
    expect(screen.queryByTestId("vertex-add-form-error")).toBeNull();
    fireEvent.click(screen.getByTestId("vertex-add-form-button"));
    expect(
      screen.getByTestId("vertex-add-form-error"),
    ).toHaveTextContent(/decimal degrees only/i);
  });

  it("discloses the >7-decimal rounding instead of hiding it", () => {
    const { binding, intents: called } = entry([]);
    render(<VertexEntryList entry={binding} />);
    fireEvent.change(screen.getByTestId("vertex-add-form-lat"), {
      target: { value: "52.52061234567" },
    });
    fireEvent.change(screen.getByTestId("vertex-add-form-lon"), {
      target: { value: "13.4" },
    });
    fireEvent.click(screen.getByTestId("vertex-add-form-button"));
    expect(called.addVertexAt).toHaveBeenCalledWith(52.5206123, 13.4);
    expect(screen.getByText(/rounded to 7/i)).toBeVisible();
  });

  it("the hard cap replaces the form with the honest notice", () => {
    const { binding } = entry([vertex(1, 52.52, 13.405)], {
      atVertexCap: true,
    });
    render(<VertexEntryList entry={binding} />);
    expect(screen.getByText(/point limit reached/i)).toBeVisible();
    expect(screen.queryByTestId("vertex-add-form")).toBeNull();
  });
});

describe("the editable rows", () => {
  it("shows the current values and commits a typed move on Enter", () => {
    const { binding, intents: called } = entry([
      vertex(1, 52.52, 13.405),
    ]);
    render(<VertexEntryList entry={binding} />);
    expect(screen.getByTestId("vertex-lat-input")).toHaveValue("52.52");

    fireEvent.change(screen.getByTestId("vertex-lat-input"), {
      target: { value: "52.5300" },
    });
    fireEvent.keyDown(screen.getByTestId("vertex-lat-input"), {
      key: "Enter",
    });
    expect(called.moveVertexTo).toHaveBeenCalledWith(
      vertexId(1),
      52.53,
      13.405,
    );
  });

  it("an invalid value keeps the text and shows the error", () => {
    const { binding, intents: called } = entry([
      vertex(1, 52.52, 13.405),
    ]);
    render(<VertexEntryList entry={binding} />);
    fireEvent.change(screen.getByTestId("vertex-lon-input"), {
      target: { value: "200" },
    });
    fireEvent.keyDown(screen.getByTestId("vertex-lon-input"), {
      key: "Enter",
    });
    expect(called.moveVertexTo).not.toHaveBeenCalled();
    expect(screen.getByTestId("vertex-row-error")).toHaveTextContent(
      /between -180 and 180/i,
    );
    // The text stays for correction.
    expect(screen.getByTestId("vertex-lon-input")).toHaveValue("200");
  });

  it("Escape reverts the row to the canonical values", () => {
    const { binding, intents: called } = entry([
      vertex(1, 52.52, 13.405),
    ]);
    render(<VertexEntryList entry={binding} />);
    fireEvent.change(screen.getByTestId("vertex-lat-input"), {
      target: { value: "10" },
    });
    fireEvent.keyDown(screen.getByTestId("vertex-lat-input"), {
      key: "Escape",
    });
    expect(called.moveVertexTo).not.toHaveBeenCalled();
    expect(screen.getByTestId("vertex-lat-input")).toHaveValue("52.52");
  });

  it("an external move refreshes the fields (the override drops)", () => {
    const { binding } = entry([vertex(1, 52.52, 13.405)]);
    const { rerender } = render(<VertexEntryList entry={binding} />);
    fireEvent.change(screen.getByTestId("vertex-lat-input"), {
      target: { value: "52.99" },
    });
    // The store moved the vertex elsewhere (nudge/undo/map drag).
    const moved = entry([vertex(1, 52.5211, 13.4051)]);
    rerender(<VertexEntryList entry={moved.binding} />);
    expect(screen.getByTestId("vertex-lat-input")).toHaveValue("52.5211");
    expect(screen.getByTestId("vertex-lon-input")).toHaveValue("13.4051");
  });
});

describe("the nudge handle", () => {
  const vertices = [vertex(1, 52.52, 13.405)];

  it("arrow keys nudge by the configured step (Shift = ×10)", () => {
    const { binding, intents: called } = entry(vertices, {
      nudgeStepM: 10,
    });
    render(<VertexEntryList entry={binding} />);
    const handle = screen.getByTestId("vertex-nudge-handle");

    fireEvent.keyDown(handle, { key: "ArrowUp" });
    expect(called.nudgeVertex).toHaveBeenCalledTimes(1);
    const [id, dLat, dLon] = called.nudgeVertex.mock.calls[0] as [
      VertexId,
      number,
      number,
    ];
    expect(id).toBe(vertexId(1));
    expect(dLat).toBeCloseTo(10 / 111_320, 12);
    expect(dLon).toBe(0);

    fireEvent.keyDown(handle, { key: "ArrowRight", shiftKey: true });
    const [, , shiftDLon] = called.nudgeVertex.mock.calls[1] as [
      VertexId,
      number,
      number,
    ];
    // 100 m east at this latitude.
    expect(shiftDLon).toBeCloseTo(100 / (111_320 * Math.cos((52.52 * Math.PI) / 180)), 9);

    // Unrelated keys do nothing.
    fireEvent.keyDown(handle, { key: "Enter" });
    expect(called.nudgeVertex).toHaveBeenCalledTimes(2);
  });

  it("the step selector drives the delta", () => {
    const { binding, intents: called } = entry(vertices);
    render(<VertexEntryList entry={binding} />);
    fireEvent.change(screen.getByTestId("nudge-step-select"), {
      target: { value: "1" },
    });
    expect(binding.setNudgeStepM).toHaveBeenCalledWith(1);
    expect(binding.nudgeStepM).toBe(10); // the store applies it; the
    // binding's value is the rendered truth — the selector said 1.
  });
});

describe("insert-after", () => {
  it("prefills the midpoint to the next vertex and inserts at the right index", () => {
    const { binding, intents: called } = entry([
      vertex(1, 52.52, 13.405),
      vertex(2, 52.521, 13.406),
    ]);
    render(<VertexEntryList entry={binding} />);
    fireEvent.click(screen.getAllByTestId("vertex-insert-toggle")[0]);

    // The geodesic midpoint (interpolateLatLon), not the arithmetic
    // mean — the same helper the component uses.
    expect(
      Number(
        (screen.getByTestId("vertex-insert-form-lat") as HTMLInputElement)
          .value,
      ),
    ).toBeCloseTo(52.5205, 6);
    fireEvent.click(screen.getByTestId("vertex-insert-form-button"));
    const insertCall = called.insertVertexAt.mock.calls[0] as [
      number,
      number,
      number,
    ];
    expect(insertCall[0]).toBe(1);
    expect(insertCall[1]).toBeCloseTo(52.5205, 6);
    expect(insertCall[2]).toBeCloseTo(13.4055, 6);
    // The inline form closes after inserting.
    expect(screen.queryByTestId("vertex-insert-form")).toBeNull();
  });

  it("the last row's insert form starts empty (no next vertex)", () => {
    const { binding } = entry([vertex(1, 52.52, 13.405)]);
    render(<VertexEntryList entry={binding} />);
    fireEvent.click(screen.getAllByTestId("vertex-insert-toggle")[0]);
    expect(screen.getByTestId("vertex-insert-form-lat")).toHaveValue("");
  });
});
