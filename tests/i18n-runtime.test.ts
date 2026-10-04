/**
 * i18n runtime + dictionary gates (Phase 21 — §EE verification).
 *
 * THE CI GATE the plan calls for: "missing-key CI gate (unit)".
 * Every locale that ships must carry exactly the English key set
 * (no missing keys, no stray keys) and exactly the English `{param}`
 * vocabulary per key (no interpolation that cannot fill). Plus the
 * runtime's own contracts: interpolation, fallback, pseudo harness.
 */

import { describe, expect, it } from "vitest";
import {
  DICTIONARIES,
  interpolate,
  missingKeyLog,
  paramNamesOf,
  translate,
} from "@/i18n/runtime";
import { en, enDomainDicts } from "@/i18n/dicts/en";
import { pseudoTransform } from "@/i18n/pseudo";

describe("interpolate", () => {
  it("fills named params with strings and numbers", () => {
    expect(interpolate("A {one} and {two}", { one: "x", two: 7 })).toBe(
      "A x and 7",
    );
  });

  it("leaves unknown placeholders visible (a bug should look like a bug)", () => {
    expect(interpolate("A {one}", { other: 1 })).toBe("A {one}");
  });

  it("returns the template untouched without params", () => {
    expect(interpolate("No placeholders")).toBe("No placeholders");
  });

  it("fills repeated params", () => {
    expect(interpolate("{a}-{a}", { a: 3 })).toBe("3-3");
  });
});

describe("paramNamesOf", () => {
  it("collects unique param names in order", () => {
    expect(paramNamesOf("{b} and {a} and {b}")).toEqual(["b", "a"]);
  });

  it("ignores brace runs that are not params", () => {
    expect(paramNamesOf("{ not-a-param } {{x}}")).toEqual([]);
  });
});

describe("translate", () => {
  it("renders English with params", () => {
    expect(translate("en", "common.points", { count: 12 })).toBe(
      "12 points",
    );
  });

  it("renders Chinese", () => {
    expect(translate("zh-CN", "common.cancel")).toBe("取消");
  });

  it("falls back to English when a translation lacks the key", () => {
    const dict = DICTIONARIES["zh-CN"] as Record<string, string>;
    const key = "common.close";
    const saved = dict[key];
    delete dict[key];
    try {
      expect(translate("zh-CN", key)).toBe("Close");
    } finally {
      dict[key] = saved;
    }
  });

  it("returns the raw key for a key nowhere (and logs the miss)", () => {
    const before = missingKeyLog.length;
    expect(translate("en", "no.such.key")).toBe("no.such.key");
    expect(missingKeyLog.length).toBeGreaterThan(before);
  });
});

describe("the pseudo locale (§EE 21.4)", () => {
  it("wraps messages in the QA brackets", () => {
    expect(pseudoTransform("Open")).toMatch(/^⟦.+⟧$/);
  });

  it("grows short words by at least a third", () => {
    const out = pseudoTransform("Repair");
    expect(out.length).toBeGreaterThanOrEqual(
      Math.ceil("Repair".length * 1.3) + 2,
    );
  });

  it("passes {param} placeholders through untouched", () => {
    expect(pseudoTransform("{count} points")).toBe(
      pseudoTransform("{count} points"),
    );
    // The param itself never expands:
    expect(pseudoTransform("{count}")).toBe("⟦{count}⟧");
  });

  it("is deterministic", () => {
    expect(pseudoTransform("Undo the last edit")).toBe(
      pseudoTransform("Undo the last edit"),
    );
  });

  it("keeps punctuation attached to words", () => {
    expect(pseudoTransform("Yes, no.")).toMatch(/Yes/);
    expect(pseudoTransform("Yes, no.")).toMatch(/no\./);
  });
});

describe("dictionary gates (the CI missing-key gate)", () => {
  const locales = ["zh-CN"] as const;

  it("en has no cross-domain duplicate keys (spread merges drop them silently)", () => {
    const seen = new Set<string>();
    let total = 0;
    for (const domain of enDomainDicts) {
      for (const key of Object.keys(domain)) {
        total += 1;
        seen.add(key);
      }
    }
    expect(seen.size).toBe(total);
  });

  it.each(locales)("every en key exists in %s (and no strays)", (locale) => {
    const dict = DICTIONARIES[locale] as Record<string, string>;
    const enKeys = new Set(Object.keys(en));
    const localeKeys = new Set(Object.keys(dict));
    const missing = [...enKeys].filter((k) => !localeKeys.has(k));
    const stray = [...localeKeys].filter((k) => !enKeys.has(k));
    expect(missing).toEqual([]);
    expect(stray).toEqual([]);
  });

  it.each(locales)("%s carries every {param} en defines per key", (locale) => {
    const dict = DICTIONARIES[locale] as Record<string, string>;
    const drift: string[] = [];
    for (const [key, template] of Object.entries(en)) {
      const enParams = paramNamesOf(template).sort().join(",");
      const theirParams = paramNamesOf(dict[key] ?? "").sort().join(",");
      if (enParams !== theirParams) drift.push(`${key}: {${enParams}} vs {${theirParams}}`);
    }
    expect(drift).toEqual([]);
  });

  it("no empty values anywhere (an empty string hides a missing translation)", () => {
    for (const [locale, dict] of Object.entries(DICTIONARIES)) {
      for (const [key, value] of Object.entries(dict)) {
        expect(value.length, `${locale}:${key}`).toBeGreaterThan(0);
      }
    }
  });
});
