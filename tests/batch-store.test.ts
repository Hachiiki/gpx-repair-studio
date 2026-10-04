// @vitest-environment jsdom
/**
 * Unit tests — the batch queue store (state/batch-store.ts, Phase 18).
 *
 * The §EE 18.1 "queue state-machine tests": enqueue → the cap's honest
 * refusal split → beginParse → setParsed/setFailed → applyEdits →
 * undoLastEdit → removeItem → enterStudio's gate → reset. Plus the
 * invariants that keep the queue honest: ids never reused, the
 * exported flag never blocks a re-export, failed items carry their
 * typed error and lose their model.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  MAX_BATCH_FILES,
  useBatchStore,
  type BatchItem,
} from "@/state/batch-store";
import { parseFixture } from "./helpers/gpxTestUtils";

/** A minimal File stand-in (the store only carries it). */
function fakeFile(name: string): File {
  return new File(["<gpx/>"], name, { type: "application/gpx+xml" });
}

/** Fresh store per test — the sections' own convention. */
beforeEach(() => {
  useBatchStore.getState().reset();
});

describe("batch store — the queue state machine", () => {
  it("enqueues files as queued placeholders with never-reused ids", () => {
    const { accepted } = useBatchStore
      .getState()
      .enqueue([fakeFile("a.gpx"), fakeFile("a.gpx")]);
    expect(accepted.map((a) => a.id)).toEqual(["b1", "b2"]);
    const items = useBatchStore.getState().items;
    expect(items.map((i) => i.status)).toEqual(["queued", "queued"]);
    expect(items.every((i) => i.edits.length === 0 && !i.exported)).toBe(true);

    // ids keep counting even after removals.
    useBatchStore.getState().removeItem("b1");
    const second = useBatchStore.getState().enqueue([fakeFile("c.gpx")]);
    expect(second.accepted[0]!.id).toBe("b3");
  });

  it("refuses files past the cap with the honest split (nothing dropped silently)", () => {
    const files = Array.from({ length: MAX_BATCH_FILES + 3 }, (_, i) =>
      fakeFile(`f${i}.gpx`),
    );
    const { accepted, refused } = useBatchStore.getState().enqueue(files);
    expect(accepted).toHaveLength(MAX_BATCH_FILES);
    expect(refused).toHaveLength(3);
    expect(useBatchStore.getState().items).toHaveLength(MAX_BATCH_FILES);

    // Room frees up as items are removed.
    useBatchStore.getState().removeItem("b1");
    const next = useBatchStore.getState().enqueue([refused[0]!]);
    expect(next.accepted).toHaveLength(1);
    expect(next.refused).toHaveLength(0);
  });

  it("walks queued → parsing → parsed, carrying the model and report inputs", () => {
    useBatchStore.getState().enqueue([fakeFile("deep-defects.gpx")]);
    useBatchStore.getState().beginParse("b1");
    expect(
      useBatchStore.getState().items[0]!.status,
    ).toBe("parsing");

    const data = parseFixture("deep-defects.gpx");
    useBatchStore.getState().setParsed("b1", {
      data,
      gaps: [],
      issues: data.issues,
    });
    const item = useBatchStore.getState().items[0]!;
    expect(item.status).toBe("parsed");
    expect(item.data).toBe(data);
    expect(item.error).toBeNull();
  });

  it("failed items keep their typed error and lose the model", () => {
    useBatchStore.getState().enqueue([fakeFile("bad.gpx")]);
    useBatchStore.getState().beginParse("b1");
    useBatchStore.getState().setFailed("b1", {
      title: "Not a GPX file",
      detail: "Expected a <gpx> root.",
    });
    const item = useBatchStore.getState().items[0]!;
    expect(item.status).toBe("failed");
    expect(item.error?.title).toBe("Not a GPX file");
    expect(item.data).toBeNull();
  });

  it("beginParse only moves queued items (a finished file never rewinds)", () => {
    useBatchStore.getState().enqueue([fakeFile("a.gpx")]);
    useBatchStore.getState().beginParse("b1");
    useBatchStore.getState().setParsed("b1", {
      data: parseFixture("valid-1.1.gpx"),
      gaps: [],
      issues: [],
    });
    useBatchStore.getState().beginParse("b1");
    expect(useBatchStore.getState().items[0]!.status).toBe("parsed");
  });
});

describe("batch store — the edit log", () => {
  function parsedItem(): BatchItem {
    useBatchStore.getState().enqueue([fakeFile("a.gpx")]);
    useBatchStore.getState().beginParse("b1");
    useBatchStore.getState().setParsed("b1", {
      data: parseFixture("valid-1.1.gpx"),
      gaps: [],
      issues: [],
    });
    return useBatchStore.getState().items[0]!;
  }

  it("applyEdits appends the confirmed chain; undoLastEdit pops one step", () => {
    parsedItem();
    const edit = {
      id: "fix/1",
      label: "Test",
      reason: "spike",
      appliedAt: 1,
      entries: [],
    } as unknown as BatchItem["edits"][number];
    const edit2 = {
      id: "fix/2",
      label: "Test 2",
      reason: "dedupe",
      appliedAt: 2,
      entries: [],
    } as unknown as BatchItem["edits"][number];

    useBatchStore.getState().applyEdits("b1", [edit]);
    useBatchStore.getState().applyEdits("b1", [edit2]);
    expect(useBatchStore.getState().items[0]!.edits).toHaveLength(2);

    expect(useBatchStore.getState().undoLastEdit("b1")).toBe(true);
    expect(useBatchStore.getState().items[0]!.edits).toHaveLength(1);
    // The log IS the undo stack: the remaining entry is the first.
    expect(useBatchStore.getState().items[0]!.edits[0]!.id).toBe("fix/1");

    expect(useBatchStore.getState().undoLastEdit("b1")).toBe(true);
    expect(useBatchStore.getState().items[0]!.edits).toHaveLength(0);
    // Undo on empty is an honest no-op.
    expect(useBatchStore.getState().undoLastEdit("b1")).toBe(false);
  });

  it("applyEdits with an empty list is a no-op", () => {
    parsedItem();
    useBatchStore.getState().applyEdits("b1", []);
    expect(useBatchStore.getState().items[0]!.edits).toHaveLength(0);
  });
});

describe("batch store — the studio gate + reset", () => {
  it("enterStudio needs at least one parsed file; the queue survives backToIntake", () => {
    expect(useBatchStore.getState().enterStudio()).toBe(false);

    useBatchStore.getState().enqueue([fakeFile("a.gpx")]);
    useBatchStore.getState().beginParse("b1");
    useBatchStore.getState().setFailed("b1", {
      title: "Bad",
      detail: "Bad",
    });
    expect(useBatchStore.getState().enterStudio()).toBe(false);

    useBatchStore.getState().enqueue([fakeFile("b.gpx")]);
    useBatchStore.getState().beginParse("b2");
    useBatchStore.getState().setParsed("b2", {
      data: parseFixture("valid-1.1.gpx"),
      gaps: [],
      issues: [],
    });
    expect(useBatchStore.getState().enterStudio()).toBe(true);
    expect(useBatchStore.getState().phase).toBe("studio");

    // Back to the intake keeps the queue (add-more flow).
    useBatchStore.getState().backToIntake();
    expect(useBatchStore.getState().phase).toBe("intake");
    expect(useBatchStore.getState().items).toHaveLength(2);
  });

  it("reset clears everything including the id sequence", () => {
    useBatchStore.getState().enqueue([fakeFile("a.gpx")]);
    useBatchStore.getState().reset();
    expect(useBatchStore.getState().items).toHaveLength(0);
    expect(useBatchStore.getState().phase).toBe("intake");
    const next = useBatchStore.getState().enqueue([fakeFile("b.gpx")]);
    expect(next.accepted[0]!.id).toBe("b1");
  });
});
