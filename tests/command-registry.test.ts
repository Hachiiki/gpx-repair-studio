/**
 * Command registry (Phase 20 — §EE 20.1) — the pure layer's contract.
 *
 *   - the registry's integrity: unique ids, valid groups, every
 *     command labeled; the tools' front doors and the editors'
 *     accelerators all present;
 *   - the shortcut audit (§EE 20.3): no two commands in the same
 *     scope share a binding (and the detector actually detects);
 *   - binding identity, formatting, and event matching;
 *   - the fuzzy search: prefix beats interior beats scattered, no
 *     match is excluded, keywords count;
 *   - availability: navigate commands are landing-only, editing
 *     commands are editor-only (context-gated);
 *   - the generated cheat sheet: every shipped binding appears, the
 *     editor bindings land in the editors' own group.
 *
 * Phase 21: labels live in the dictionary — the tests resolve them
 * with the English translator (the en dictionary is the contract),
 * and the search tests also prove the Chinese keyword aliases merge
 * into the searchable text.
 */

import { describe, expect, it } from "vitest";
import {
  bindingId,
  cheatSheet,
  commandLabel,
  COMMANDS,
  filterCommands,
  formatShortcut,
  fuzzyScore,
  matchesBinding,
  findShortcutConflicts,
  type CommandContext,
  type ShortcutBinding,
} from "@/features/commands/registry";
import { translatorFor } from "@/i18n/runtime";

const t = translatorFor("en");
const zh = translatorFor("zh-CN");

const LANDING: CommandContext = {
  section: null,
  landingToolPage: false,
  editing: false,
  hasSavedSessions: false,
};

const TOOL_PAGE: CommandContext = {
  ...LANDING,
  landingToolPage: true,
};

const PLAN_STUDIO: CommandContext = {
  section: "plan",
  landingToolPage: false,
  editing: true,
  hasSavedSessions: true,
};

const WORKSPACE: CommandContext = {
  section: "repair",
  landingToolPage: false,
  editing: false,
  hasSavedSessions: false,
};

describe("the registry's integrity", () => {
  it("every command has a unique id, a label key that resolves, and a valid group", () => {
    const ids = new Set<string>();
    for (const command of COMMANDS) {
      expect(command.id.length).toBeGreaterThan(0);
      expect(commandLabel(t, command).length).toBeGreaterThan(0);
      expect(["navigate", "sessions", "editing", "view", "help"]).toContain(
        command.group,
      );
      expect(ids.has(command.id), `duplicate id: ${command.id}`).toBe(false);
      ids.add(command.id);
    }
    expect(ids.size).toBe(COMMANDS.length);
  });

  it("the seven tools' front doors, the sessions door, and the help door exist", () => {
    for (const id of [
      "open-repair",
      "open-share",
      "open-recovery",
      "open-create",
      "open-merge",
      "open-plan",
      "open-batch",
      "open-sessions",
      "open-help",
    ]) {
      expect(COMMANDS.some((command) => command.id === id)).toBe(true);
    }
  });

  it("the editors' accelerators and the undo/redo pair are registered", () => {
    const byId = new Map(COMMANDS.map((command) => [command.id, command]));
    expect(byId.get("editor-undo")?.shortcut).toEqual({ key: "z", ctrl: true });
    expect(byId.get("editor-redo")?.shortcut).toEqual({
      key: "z",
      ctrl: true,
      shift: true,
    });
    expect(byId.get("editor-redo")?.altShortcut).toEqual({
      key: "y",
      ctrl: true,
    });
    expect(byId.get("editor-draw-mode")?.shortcut).toEqual({ key: "d" });
    expect(byId.get("editor-pen-toggle")?.shortcut).toEqual({ key: "c" });
  });

  it("the cheat-sheet-only native bindings never surface in the palette", () => {
    for (const command of COMMANDS) {
      if (command.palette === false) {
        expect(
          filterCommands(COMMANDS, "", LANDING, t).some(
            (entry) => entry.id === command.id,
          ),
        ).toBe(false);
      }
    }
  });
});

describe("the shortcut audit (§EE 20.3)", () => {
  it("the shipped registry has NO same-scope conflicts", () => {
    expect(findShortcutConflicts(COMMANDS)).toEqual([]);
  });

  it("the detector finds a real collision", () => {
    const conflicts = findShortcutConflicts([
      ...COMMANDS,
      {
        id: "intruder",
        labelKey: "cmd.open-about",
        group: "view",
        shortcut: { key: "d" },
        scope: "editor",
      },
    ]);
    expect(conflicts).toEqual([
      {
        binding: "d",
        ids: expect.arrayContaining(["editor-draw-mode", "intruder"]),
      },
    ]);
  });

  it("the same binding in DIFFERENT scopes is not a conflict", () => {
    expect(
      findShortcutConflicts([
        {
          id: "one",
          labelKey: "cmd.open-about",
          group: "view",
          shortcut: { key: "x" },
          scope: "editor",
        },
        {
          id: "two",
          labelKey: "cmd.open-help",
          group: "view",
          shortcut: { key: "x" },
          scope: "global",
        },
      ]),
    ).toEqual([]);
  });
});

describe("binding identity, formatting, matching", () => {
  it("bindingId normalizes modifiers and key case", () => {
    expect(bindingId({ key: "K" })).toBe("k");
    expect(bindingId({ key: "z", ctrl: true })).toBe("mod+z");
    expect(bindingId({ key: "z", ctrl: true, shift: true })).toBe(
      "mod+shift+z",
    );
    expect(bindingId({ key: "z", ctrl: true, shift: true })).not.toBe(
      bindingId({ key: "z", ctrl: true }),
    );
  });

  it("formatShortcut renders the keycap form", () => {
    expect(formatShortcut({ key: "k", ctrl: true })).toBe("Ctrl K");
    expect(formatShortcut({ key: "z", ctrl: true, shift: true })).toBe(
      "Ctrl Shift Z",
    );
    expect(formatShortcut({ key: "?" })).toBe("?");
    expect(formatShortcut({ key: "d" })).toBe("D");
  });

  it("matchesBinding accepts ctrl OR meta as the modifier, exact otherwise", () => {
    const binding: ShortcutBinding = { key: "z", ctrl: true };
    expect(
      matchesBinding(
        { key: "z", ctrlKey: true, metaKey: false, shiftKey: false, altKey: false },
        binding,
      ),
    ).toBe(true);
    expect(
      matchesBinding(
        { key: "z", ctrlKey: false, metaKey: true, shiftKey: false, altKey: false },
        binding,
      ),
    ).toBe(true);
    expect(
      matchesBinding(
        { key: "z", ctrlKey: false, metaKey: false, shiftKey: false, altKey: false },
        binding,
      ),
    ).toBe(false);
    expect(
      matchesBinding(
        { key: "z", ctrlKey: true, metaKey: false, shiftKey: true, altKey: false },
        binding,
      ),
    ).toBe(false);
    expect(
      matchesBinding(
        { key: "y", ctrlKey: true, metaKey: false, shiftKey: false, altKey: false },
        binding,
      ),
    ).toBe(false);
  });
});

describe("the fuzzy search", () => {
  it("starts-with beats an interior hit", () => {
    const startsWith = fuzzyScore("pl", "Plan a route")!;
    const interior = fuzzyScore("pl", "xplan a route")!;
    expect(startsWith).toBeGreaterThan(interior);
  });

  it("a word start beats a mid-word hit", () => {
    const wordStart = fuzzyScore("re", "gap recovery")!;
    const midWord = fuzzyScore("re", "gapxrecovery")!;
    expect(wordStart).toBeGreaterThan(midWord);
  });

  it("a contiguous run beats scattered letters", () => {
    const contiguous = fuzzyScore("ap", "apple")!;
    const scattered = fuzzyScore("ap", "axp")!;
    expect(contiguous).toBeGreaterThan(scattered);
  });

  it("no match is null", () => {
    expect(fuzzyScore("xyz", "Plan a route")).toBeNull();
    expect(fuzzyScore("planx", "Plan a route")).toBeNull();
  });

  it("empty query matches everything with score 0", () => {
    expect(fuzzyScore("", "anything")).toBe(0);
  });

  it("case folds both sides", () => {
    expect(fuzzyScore("PLAN", "plan a route")).not.toBeNull();
  });
});

describe("availability (the `when` predicates)", () => {
  it("navigate commands are landing-only — hidden once a session holds the stage", () => {
    const landingIds = filterCommands(COMMANDS, "", LANDING, t).map((c) => c.id);
    expect(landingIds).toContain("open-plan");
    const workIds = filterCommands(COMMANDS, "", WORKSPACE, t).map((c) => c.id);
    expect(workIds).not.toContain("open-plan");
    expect(workIds).not.toContain("open-repair");
  });

  it("editing commands need a live editor session", () => {
    const landingIds = filterCommands(COMMANDS, "", LANDING, t).map((c) => c.id);
    expect(landingIds).not.toContain("editor-undo");
    const studioIds = filterCommands(COMMANDS, "", PLAN_STUDIO, t).map((c) => c.id);
    expect(studioIds).toContain("editor-undo");
    expect(studioIds).toContain("editor-redo");
    expect(studioIds).toContain("editor-clear");
  });

  it("'Back to the tool cards' needs the tool page", () => {
    expect(
      filterCommands(COMMANDS, "", LANDING, t).some((c) => c.id === "go-home"),
    ).toBe(false);
    expect(
      filterCommands(COMMANDS, "", TOOL_PAGE, t).some((c) => c.id === "go-home"),
    ).toBe(true);
  });

  it("a query filters AND ranks (keywords count)", () => {
    const hits = filterCommands(COMMANDS, "plan", LANDING, t);
    expect(hits.length).toBeGreaterThan(0);
    // "Plan a route" outscores "Replay the walkthrough: …" variants.
    expect(hits[0]!.id).toBe("open-plan");
    const undoHits = filterCommands(COMMANDS, "undo", PLAN_STUDIO, t);
    expect(undoHits.map((c) => c.id)).toContain("editor-undo");
    const nothing = filterCommands(COMMANDS, "zzzznotathing", LANDING, t);
    expect(nothing).toEqual([]);
  });

  it("Phase 21 — Chinese keyword aliases merge into the search text", () => {
    // The Chinese alias for the help door contains 键盘/键位/帮助.
    const hits = filterCommands(COMMANDS, "帮助", LANDING, zh);
    expect(hits.map((c) => c.id)).toContain("open-help");
    // And English keywords still match under the Chinese locale.
    const english = filterCommands(COMMANDS, "keyboard", LANDING, zh);
    expect(english.map((c) => c.id)).toContain("open-help");
  });

  it("Phase 21 — labels localize (the replay tours interpolate their tool names)", () => {
    expect(commandLabel(zh, COMMANDS.find((c) => c.id === "open-plan")!)).toBe(
      "规划一条路线",
    );
    const replay = COMMANDS.find((c) => c.id === "replay-tour-plan")!;
    expect(commandLabel(t, replay)).toBe(
      "Replay the walkthrough: Plan a route",
    );
    expect(commandLabel(zh, replay)).toBe("重看操作导览：规划一条路线");
  });
});

describe("the generated cheat sheet", () => {
  const sheet = cheatSheet(COMMANDS, t);

  it("every shipped binding appears exactly once", () => {
    const rows = sheet.flatMap((group) => group.entries);
    // One row per command that HAS a binding; the row's keys carry the
    // primary and any equivalent binding together.
    const withBindings = COMMANDS.filter(
      (command) => command.shortcut !== undefined,
    );
    expect(rows.length).toBe(withBindings.length);
    expect(new Set(rows.map((row) => row.description)).size).toBe(
      withBindings.length,
    );
    const keyCount = rows.reduce((count, row) => count + row.keys.length, 0);
    expect(keyCount).toBe(
      COMMANDS.reduce(
        (count, command) =>
          count + (command.shortcut ? 1 : 0) + (command.altShortcut ? 1 : 0),
        0,
      ),
    );
  });

  it("the Phase 12 vocabulary survives: Everywhere + the editors' group", () => {
    expect(sheet[0]!.title).toBe("Everywhere");
    expect(sheet.some((group) => group.title.startsWith("Drawing editors"))).toBe(
      true,
    );
    const editorGroup = sheet.find((group) =>
      group.title.startsWith("Drawing editors"),
    )!;
    expect(
      editorGroup.entries.every((entry) => entry.editorOnly),
    ).toBe(true);
    // The accelerators the editors own.
    const keys = editorGroup.entries.flatMap((entry) => entry.keys);
    for (const key of ["D", "M", "P", "C", "Ctrl Z", "Ctrl Shift Z"]) {
      expect(keys).toContain(key);
    }
  });

  it("the global group carries the palette and help chords", () => {
    const everywhere = sheet[0]!.entries;
    const descriptions = everywhere.map((entry) => entry.description);
    expect(descriptions).toContain("Shortcuts & help");
  });

  it("Phase 21 — the sheet localizes wholesale", () => {
    const zhSheet = cheatSheet(COMMANDS, zh);
    expect(zhSheet[0]!.title).toBe("全局");
    expect(zhSheet.some((group) => group.title.startsWith("绘制编辑器"))).toBe(
      true,
    );
  });
});
