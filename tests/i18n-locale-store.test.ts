// @vitest-environment jsdom
/**
 * Locale observable tests (Phase 21 — §EE 21.2).
 *
 * The ceremony the theme store taught us, proven again for language:
 * resolution order (?lang= > storage > default), the pickable-only
 * persistence rule (pseudo is a QA override, never a saved choice),
 * the html lang mirror, and the hydration snapshot contract.
 */

import { afterEach, describe, expect, it } from "vitest";
import {
  __resetLocaleForTests,
  getLocale,
  getServerLocale,
  readStoredLocale,
  setLocale,
  subscribeLocale,
} from "@/i18n/locale";
import { LOCALE_STORAGE_KEY } from "@/i18n/types";

function setUrl(search: string) {
  // Relative URLs only — jsdom's history throws SecurityError on
  // absolute origins different from its own.
  window.history.replaceState(null, "", search);
}

afterEach(() => {
  window.localStorage.clear();
  setUrl("/");
  __resetLocaleForTests();
});

describe("locale resolution order", () => {
  it("defaults to English with nothing stored (never sniffs the OS)", () => {
    expect(getLocale()).toBe("en");
  });

  it("reads the persisted pickable preference", () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, "zh-CN");
    expect(getLocale()).toBe("zh-CN");
  });

  it("drifted storage values degrade to the default", () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, "klingon");
    expect(getLocale()).toBe("en");
  });

  it("?lang= beats storage (the testing override)", () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, "zh-CN");
    setUrl("/?lang=en");
    expect(getLocale()).toBe("en");
  });

  it("?lang=pseudo reaches the QA harness", () => {
    setUrl("/?lang=pseudo");
    expect(getLocale()).toBe("pseudo");
  });

  it("an unknown ?lang= is ignored (not a crash, not a locale)", () => {
    setUrl("/?lang=xx");
    expect(getLocale()).toBe("en");
  });

  it("the resolution is cached — one environment read per session", () => {
    setUrl("/?lang=zh-CN");
    expect(getLocale()).toBe("zh-CN");
    setUrl("/");
    expect(getLocale()).toBe("zh-CN");
  });
});

describe("setLocale", () => {
  it("persists a pickable choice and notifies the subscribers", () => {
    let notified = 0;
    const off = subscribeLocale(() => {
      notified += 1;
    });
    setLocale("zh-CN");
    expect(notified).toBe(1);
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("zh-CN");
    expect(document.documentElement.getAttribute("lang")).toBe("zh-CN");
    off();
  });

  it("does NOT persist the pseudo locale (QA override only)", () => {
    setLocale("zh-CN");
    setLocale("pseudo");
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("zh-CN");
    expect(getLocale()).toBe("pseudo");
  });

  it("same-locale set does not re-notify", () => {
    let notified = 0;
    const off = subscribeLocale(() => {
      notified += 1;
    });
    setLocale("en");
    expect(notified).toBe(0);
    off();
  });

  it("readStoredLocale exposes the raw pickable value (or null)", () => {
    expect(readStoredLocale()).toBeNull();
    window.localStorage.setItem(LOCALE_STORAGE_KEY, "en");
    expect(readStoredLocale()).toBe("en");
  });
});

describe("hydration contract", () => {
  it("the server snapshot is always English (the prerender language)", () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, "zh-CN");
    expect(getServerLocale()).toBe("en");
  });
});
