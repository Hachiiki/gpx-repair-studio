// @vitest-environment jsdom
/**
 * Library UI tests (Phase 24): the sessions manager grown into the
 * training library — the cards (§24.1), sort/filter/multi-select, the
 * records tab (§24.2/24.5), and the trends tab (§24.3) with the
 * elevation/metrics chart discipline's textual twins. Hand-built
 * bindings in, rendered output asserted — pure presentation.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionsManagerDialog } from "@/components/shared/sessions-manager";
import { LibraryRecords } from "@/components/library/library-records";
import { LibraryTrends } from "@/components/library/library-trends";
import { lifetimeRecords } from "@/features/library/records";
import type { SavedSessionsBinding } from "@/hooks/use-saved-sessions";
import type { LibraryBinding, LibraryCardRow } from "@/hooks/use-library";

afterEach(cleanup);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const INDEXED: NonNullable<LibraryCardRow["index"]> = {
  schemaVersion: 1,
  hasTimingData: true,
  hasHrData: true,
  hasCadData: true,
  hasPowerData: true,
  activityStartMs: Date.parse("2024-05-01T06:00:00Z"),
  distanceM: 11_446,
  movingTimeMs: 24_000,
  gainM: 42,
  avgHrBpm: 145.2,
  elevationCoverage: 1,
  recordedDistanceM: 11_000,
  recordedMovingTimeMs: 23_000,
  recordedGainM: 40,
  reconstructedDistanceM: 0,
  trackCount: 1,
  efforts: [
    { distanceM: 1000, timeMs: 4_800, startInterpolated: true, endInterpolated: false },
    { distanceM: 5000, timeMs: 26_000, startInterpolated: false, endInterpolated: true },
  ],
};

function card(
  id: string,
  name: string,
  status: LibraryCardRow["status"],
  index: LibraryCardRow["index"],
  updatedAt = 1_700_000_000_000,
): LibraryCardRow {
  return {
    id,
    name,
    section: "repair",
    updatedAt,
    status,
    index,
  };
}

function makeLibrary(overrides: Partial<LibraryBinding> = {}): LibraryBinding {
  const cards = overrides.cards ?? [
    card("a", "Morning ride", "indexed", INDEXED),
    card("b", "Evening run", "planned", null),
  ];
  const recordsRows = cards
    .filter((c) => c.status === "indexed" && c.index !== null)
    .map((c) => ({ id: c.id, name: c.name, index: c.index! }));
  return {
    cards,
    records: lifetimeRecords(recordsRows),
    volumeWeek: overrides.volumeWeek ?? [],
    volumeMonth: overrides.volumeMonth ?? [],
    fitness: overrides.fitness ?? null,
    backfilling: overrides.backfilling ?? false,
    pendingCount: overrides.pendingCount ?? 0,
    failedCount: overrides.failedCount ?? 0,
    ensureIndexes: vi.fn(),
    exportCsv: vi.fn(),
  };
}

function makeSessions(
  rows: { id: string; name: string }[] = [],
): SavedSessionsBinding {
  return {
    rows: rows.map((row, i) => ({
      id: row.id,
      name: row.name,
      createdAt: i,
      updatedAt: i,
      section: "repair" as const,
      record: {},
    })),
    hasScanned: true,
    available: true,
    saveCurrent: vi.fn().mockResolvedValue(true),
    exportCurrent: vi.fn().mockResolvedValue(true),
    renameRow: vi.fn().mockResolvedValue(undefined),
    deleteRow: vi.fn().mockResolvedValue(undefined),
    deleteRows: vi.fn().mockResolvedValue(true),
    exportRows: vi.fn().mockResolvedValue(true),
    exportRow: vi.fn().mockResolvedValue(undefined),
    openRow: vi.fn().mockResolvedValue(true),
    importPortableFile: vi.fn(),
    refresh: vi.fn().mockResolvedValue(undefined),
  };
}

function renderManager(
  library: LibraryBinding = makeLibrary(),
  sessions: SavedSessionsBinding = makeSessions([
    { id: "a", name: "Morning ride" },
    { id: "b", name: "Evening run" },
  ]),
) {
  const onOpenChange = vi.fn();
  render(
    <SessionsManagerDialog
      open
      onOpenChange={onOpenChange}
      sessions={sessions}
      library={library}
    />,
  );
  return { onOpenChange, sessions, library };
}

// ---------------------------------------------------------------------------
// The sessions tab — cards, sort/filter, selection (§24.1)
// ---------------------------------------------------------------------------

describe("the library cards (§24.1)", () => {
  it("renders an indexed session's numbers: distance, time, pace, gain, avg HR", () => {
    renderManager();
    const stats = screen.getByTestId("library-card-stats");
    expect(stats).toHaveTextContent("11.45 km");
    expect(stats).toHaveTextContent("0:24");
    expect(stats.textContent).toMatch(/\/km/);
    expect(stats).toHaveTextContent("42");
    expect(stats).toHaveTextContent("145");
    expect(stats).toHaveTextContent("May 1, 2024");
  });

  it("labels planned routes as not recordings (never joins records)", () => {
    renderManager();
    const rows = screen.getAllByTestId("sessions-row");
    const planned = within(rows[1]!).getByText(/Planned route/i);
    expect(planned).toBeInTheDocument();
  });

  it("shows pending and failed states with their plain sentences", () => {
    renderManager(
      makeLibrary({
        cards: [
          card("a", "Waiting", "pending", null),
          card("b", "Broken", "failed", null),
        ],
      }),
    );
    expect(screen.getByText("Indexing…")).toBeInTheDocument();
    expect(
      screen.getByText(/Couldn't re-read this file/i),
    ).toBeInTheDocument();
  });

  it("discloses drawn-in repair meters on the card", () => {
    renderManager(
      makeLibrary({
        cards: [
          card("a", "Repaired", "indexed", {
            ...INDEXED,
            reconstructedDistanceM: 446,
          }),
        ],
      }),
    );
    expect(screen.getByTestId("library-card-stats")).toHaveTextContent(
      /includes 446 m of drawn-in repair/i,
    );
  });
});

describe("filter, sort, and multi-select (§24.1)", () => {
  const three = makeLibrary({
    cards: [
      card("a", "Alpha ride", "indexed", { ...INDEXED, distanceM: 5_000 }),
      card("b", "Beta ride", "indexed", { ...INDEXED, distanceM: 20_000 }),
      card("c", "Gamma run", "planned", null),
    ],
  });

  it("the filter narrows by name", () => {
    renderManager(three);
    expect(screen.getAllByTestId("sessions-row")).toHaveLength(3);
    fireEvent.change(screen.getByTestId("library-filter"), {
      target: { value: "beta" },
    });
    expect(screen.getAllByTestId("sessions-row")).toHaveLength(1);
    expect(screen.getAllByTestId("sessions-row")[0]).toHaveTextContent(
      "Beta ride",
    );
  });

  it("distance sort reorders the shelf", () => {
    renderManager(three);
    fireEvent.change(screen.getByTestId("library-sort"), {
      target: { value: "distance" },
    });
    const names = screen
      .getAllByTestId("sessions-row")
      .map((row) => row.textContent ?? "");
    expect(names.findIndex((n) => n.includes("Beta ride"))).toBeLessThan(
      names.findIndex((n) => n.includes("Alpha ride")),
    );
  });

  it("selection drives the bulk bar; delete asks, then dispatches", () => {
    const library = makeLibrary({
      cards: [
        card("a", "Alpha ride", "indexed", INDEXED),
        card("b", "Beta ride", "indexed", INDEXED),
      ],
    });
    const sessions = makeSessions([
      { id: "a", name: "Alpha ride" },
      { id: "b", name: "Beta ride" },
    ]);
    renderManager(library, sessions);

    fireEvent.click(screen.getAllByTestId("library-card-select")[0]!);
    const bar = screen.getByTestId("library-bulk-bar");
    expect(within(bar).getByText(/1 selected/i)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("library-bulk-delete"));
    expect(
      within(screen.getByTestId("library-bulk-bar")).getByText(
        /Delete 1 sessions\?/i,
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("library-bulk-delete-confirm"));
    expect(sessions.deleteRows).toHaveBeenCalledWith(["a"]);
  });

  it("select-all selects every visible card; export dispatches the ids", () => {
    const sessions = makeSessions([
      { id: "a", name: "Alpha ride" },
      { id: "b", name: "Beta ride" },
    ]);
    renderManager(three, sessions);
    fireEvent.click(
      within(screen.getByTestId("library-select-all")).getByRole("checkbox"),
    );
    expect(screen.getByTestId("library-bulk-bar")).toHaveTextContent(
      /3 selected/i,
    );
    fireEvent.click(screen.getByTestId("library-bulk-export"));
    expect(sessions.exportRows).toHaveBeenCalledWith(["a", "b", "c"]);
  });

  it("the CSV button calls the library's export", () => {
    const library = makeLibrary({
      cards: [card("a", "Solo", "indexed", INDEXED)],
    });
    renderManager(library);
    fireEvent.click(screen.getByTestId("library-export-csv"));
    expect(library.exportCsv).toHaveBeenCalledTimes(1);
  });

  it("opening the dialog pays the (idempotent) backfill", () => {
    const library = makeLibrary({
      cards: [card("a", "Solo", "pending", null)],
      pendingCount: 1,
    });
    renderManager(library);
    expect(library.ensureIndexes).toHaveBeenCalled();
    expect(screen.getByTestId("library-indexing")).toHaveTextContent(
      /Indexing 1 sessions/i,
    );
  });
});

// ---------------------------------------------------------------------------
// The records tab (§24.2/24.5)
// ---------------------------------------------------------------------------

describe("LibraryRecords (§24.2/§24.5)", () => {
  const records = lifetimeRecords([
    {
      id: "a",
      name: "Fast ride",
      index: {
        activityStartMs: Date.parse("2024-05-01T06:00:00Z"),
        hasTimingData: true,
        distanceM: 11_446,
        movingTimeMs: 24_000,
        recordedDistanceM: 11_000,
        recordedMovingTimeMs: 23_000,
        recordedGainM: 42,
        efforts: [
          { distanceM: 1000, timeMs: 4_800, startInterpolated: true, endInterpolated: false },
          { distanceM: 5000, timeMs: 26_000, startInterpolated: false, endInterpolated: true },
        ],
      },
    },
    {
      id: "b",
      name: "Slow ride",
      index: {
        activityStartMs: Date.parse("2024-04-01T06:00:00Z"),
        hasTimingData: true,
        distanceM: 12_000,
        movingTimeMs: 40_000,
        recordedDistanceM: 12_000,
        recordedMovingTimeMs: 39_000,
        recordedGainM: 80,
        efforts: [
          { distanceM: 1000, timeMs: 6_000, startInterpolated: false, endInterpolated: false },
        ],
      },
    },
  ]);

  it("renders the three value tiles from recorded-only numbers", () => {
    render(<LibraryRecords records={records} paceUnit="km" />);
    expect(screen.getByTestId("records-farthest")).toHaveTextContent(
      "Slow ride",
    );
    expect(screen.getByTestId("records-farthest")).toHaveTextContent(
      "12.00 km",
    );
    expect(screen.getByTestId("records-longest")).toHaveTextContent("0:39");
    expect(screen.getByTestId("records-mostgain")).toHaveTextContent("80");
  });

  it("ranks the ladder best-first with the session and the flag", () => {
    render(<LibraryRecords records={records} paceUnit="km" />);
    const best = screen.getByTestId("records-effort-1000");
    expect(best).toHaveTextContent("0:04");
    // The interpolated-marker flag sits beside the time, in the cell.
    expect(best.closest("td")).toHaveTextContent("≈");
    // Top-3 expansion: the slower effort appears on demand.
    fireEvent.click(screen.getByTestId("records-expand-1000"));
    expect(screen.getByText("Slow ride")).toBeInTheDocument();
    expect(screen.getByText(/#2/i)).toBeInTheDocument();
  });

  it("states the rules: elapsed clock, reconstruction exclusion, top three", () => {
    render(<LibraryRecords records={records} paceUnit="km" />);
    const copy = document.body.textContent ?? "";
    expect(copy).toMatch(/clock does not stop/i);
    expect(copy).toMatch(/drawn-in gap is not a record/i);
    expect(copy).toMatch(/top three/i);
  });

  it("Riegel is opt-in: hidden until asked, then seeds and predicts", () => {
    render(<LibraryRecords records={records} paceUnit="km" />);
    expect(screen.queryByTestId("riegel-table")).toBeNull();
    fireEvent.click(screen.getByTestId("riegel-enable"));
    // The seed defaults to the longest covered distance (5 km here).
    const seed = screen.getByTestId("riegel-seed") as HTMLSelectElement;
    expect(seed.value).toBe("5000");
    // 1 km predicted from the 5 km best (26 s): faster than the seed.
    const row = screen.getByTestId("riegel-row-1000");
    expect(row).toHaveTextContent(/0:0[0-5]/);
    expect(document.body.textContent).toMatch(/1\.06/); // formula shown
    expect(document.body.textContent).toMatch(/not a coach/i); // caveat
  });

  it("renders its empty reason with no indexed sessions", () => {
    render(
      <LibraryRecords records={lifetimeRecords([])} paceUnit="km" />,
    );
    expect(screen.getByTestId("records-empty")).toHaveTextContent(
      /No indexed sessions/i,
    );
  });
});

// ---------------------------------------------------------------------------
// The trends tab (§24.3)
// ---------------------------------------------------------------------------

describe("LibraryTrends (§24.3)", () => {
  const week = [
    {
      startMs: Date.parse("2024-05-06T00:00:00Z"),
      distanceM: 11_446,
      movingTimeMs: 24_000,
      activities: 2,
    },
    {
      startMs: Date.parse("2024-05-13T00:00:00Z"),
      distanceM: 5_000,
      movingTimeMs: 1_800_000,
      activities: 1,
    },
  ];

  it("renders the volume bars and the textual twin of the same series", () => {
    render(
      <LibraryTrends
        volumeWeek={week}
        volumeMonth={[]}
        fitness={null}
        paceUnit="km"
      />,
    );
    expect(screen.getAllByTestId("trends-volume-bar")).toHaveLength(2);
    // The readout speaks the cursor's bucket (keyboard discipline).
    const svg = screen.getByTestId("trends-volume-svg");
    fireEvent.focus(svg);
    fireEvent.keyDown(svg, { key: "ArrowRight" });
    expect(screen.getByTestId("trends-volume-readout")).toHaveTextContent(
      /11\.45 km/,
    );
    // The twin table.
    fireEvent.click(screen.getByTestId("trends-volume-table-toggle"));
    expect(screen.getByTestId("trends-volume-table")).toBeInTheDocument();
    expect(screen.getAllByTestId("trends-volume-table")[0]).toHaveTextContent(
      "2",
    );
  });

  it("switches granularity and metric", () => {
    render(
      <LibraryTrends
        volumeWeek={week}
        volumeMonth={[
          {
            startMs: Date.parse("2024-05-01T00:00:00Z"),
            distanceM: 16_446,
            movingTimeMs: 1_824_000,
            activities: 3,
          },
        ]}
        fitness={null}
        paceUnit="km"
      />,
    );
    expect(screen.getAllByTestId("trends-volume-bar")).toHaveLength(2);
    fireEvent.click(screen.getByTestId("trends-granularity-month"));
    expect(screen.getAllByTestId("trends-volume-bar")).toHaveLength(1);
    fireEvent.click(screen.getByTestId("trends-metric-time"));
    expect(screen.getByTestId("trends-volume-svg")).toHaveAttribute(
      "role",
      "img",
    );
  });

  it("gates the fitness line below the minimum counts, with the counts", () => {
    render(
      <LibraryTrends
        volumeWeek={week}
        volumeMonth={[]}
        fitness={{
          points: [0, 1, 2].map((i) => ({
            dayMs: Date.parse("2024-05-01T00:00:00Z") + i * 86_400_000,
            ctl: 100,
            atl: 80,
            form: 20,
          })),
          spanDays: 3,
          sessionCount: 3,
          untimedCount: 0,
          minCountMet: false,
        }}
        paceUnit="km"
      />,
    );
    expect(screen.getByTestId("trends-fitness-gated")).toHaveTextContent(
      /3 days/i,
    );
    expect(screen.queryByTestId("trends-fitness-svg")).toBeNull();
  });

  it("draws the three lines and twins them when the counts are met", () => {
    const dayMs = Date.parse("2024-05-01T00:00:00Z");
    const points = Array.from({ length: 10 }, (_, i) => ({
      dayMs: dayMs + i * 86_400_000,
      ctl: 1000 + i * 50,
      atl: 900 + i * 30,
      form: 100 + i * 20,
    }));
    render(
      <LibraryTrends
        volumeWeek={week}
        volumeMonth={[]}
        fitness={{
          points,
          spanDays: 10,
          sessionCount: 10,
          untimedCount: 1,
          minCountMet: true,
        }}
        paceUnit="km"
      />,
    );
    expect(screen.getByTestId("trends-fitness-ctl")).toBeInTheDocument();
    expect(screen.getByTestId("trends-fitness-atl")).toBeInTheDocument();
    expect(screen.getByTestId("trends-fitness-form")).toBeInTheDocument();
    // The readout speaks the cursor's day.
    const svg = screen.getByTestId("trends-fitness-svg");
    fireEvent.focus(svg);
    fireEvent.keyDown(svg, { key: "Home" });
    expect(screen.getByTestId("trends-fitness-readout")).toHaveTextContent(
      /fitness/i,
    );
    fireEvent.click(screen.getByTestId("trends-fitness-table-toggle"));
    expect(screen.getByTestId("trends-fitness-table")).toBeInTheDocument();
    // The untimed disclosure counts its sessions.
    expect(document.body.textContent).toMatch(/1 sessions? carry no timestamps/i);
  });

  it("renders the dated-empty reason when nothing sits on a calendar", () => {
    render(
      <LibraryTrends
        volumeWeek={[]}
        volumeMonth={[]}
        fitness={null}
        paceUnit="km"
      />,
    );
    expect(screen.getByTestId("trends-empty")).toHaveTextContent(
      /No dated sessions/i,
    );
  });
});

// ---------------------------------------------------------------------------
// The tab switcher itself
// ---------------------------------------------------------------------------

describe("the manager's three doors", () => {
  it("starts on the sessions shelf and switches tabs", () => {
    const library = makeLibrary();
    renderManager(library);
    expect(
      screen.getByTestId("library-tab-sessions").getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.click(screen.getByTestId("library-tab-records"));
    expect(screen.getByTestId("records-card")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("library-tab-trends"));
    expect(screen.getByTestId("trends-card")).toBeInTheDocument();
    expect(
      screen.getByTestId("library-tab-sessions").getAttribute("aria-pressed"),
    ).toBe("false");
  });
});
