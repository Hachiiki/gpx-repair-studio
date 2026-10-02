/**
 * Shared XML-walk utilities for the DOM-based parsers (Phase 14).
 *
 * The GPX parser (parse.ts) grew these as private helpers in Phase 1; the
 * TCX import (features/formats/parse-tcx.ts) needs exactly the same
 * namespace-tolerant, NaN-guarded primitives, so they live here as the
 * single source. Both parsers consume them through an injected `XmlIo`,
 * which keeps them pure and runnable under DOMParser, the Phase 9 worker
 * tokenizer, and jsdom alike.
 *
 * Semantics are pinned by the Phase 1 parser tests (tests/gpx-parse.test.ts):
 * strict ISO-8601-with-timezone (semantic range checks — `Date.parse`
 * silently rolls Feb 30 over), trimmed text with empty-as-absent, and
 * non-finite numbers returned as `undefined` so callers flag instead of
 * invent.
 */

// ---------------------------------------------------------------------------
// Strict xsd:dateTime (§J) — shared by GPX <time> and TCX <Time>
// ---------------------------------------------------------------------------

/** Strict xsd:dateTime-with-mandatory-timezone shape (GPX §J). */
const ISO_8601_WITH_TZ =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$/;

/**
 * Parse a timestamp strictly as ISO-8601 with timezone; `undefined` when
 * the text is naive, malformed, or semantically invalid (e.g. Feb 30 —
 * `Date.parse` would silently roll such dates over, so ranges are checked
 * explicitly before conversion).
 */
export function parseStrictEpochMs(text: string | undefined): number | undefined {
  if (text === undefined) return undefined;
  const trimmed = text.trim();
  const match = ISO_8601_WITH_TZ.exec(trimmed);
  if (match === null) return undefined;

  const [, yearS, monthS, dayS, hourS, minuteS, secondS, sign, offHourS, offMinuteS] = match;
  const year = Number(yearS);
  const month = Number(monthS);
  const day = Number(dayS);

  if (month < 1 || month > 12) return undefined;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][
    month - 1
  ];
  if (day < 1 || day > daysInMonth) return undefined;
  if (Number(hourS) > 23 || Number(minuteS) > 59 || Number(secondS) > 59) {
    return undefined;
  }
  if (sign !== undefined && (Number(offHourS) > 23 || Number(offMinuteS) > 59)) {
    return undefined;
  }

  const ms = Date.parse(trimmed);
  return Number.isNaN(ms) ? undefined : ms;
}

// ---------------------------------------------------------------------------
// Namespace-tolerant structure walk (localName-based, document order)
// ---------------------------------------------------------------------------

/** Direct child elements with the given localName, in document order. */
export function childrenByLocalName(
  el: Element | undefined,
  name: string,
): Element[] {
  if (el === undefined) return [];
  return Array.from(el.children).filter((c) => c.localName === name);
}

/** First direct child element with the given localName, if any. */
export function firstChildByLocalName(
  el: Element | undefined,
  name: string,
): Element | undefined {
  if (el === undefined) return undefined;
  return Array.from(el.children).find((c) => c.localName === name);
}

/** Trimmed text of the first matching child element; undefined if absent. */
export function trimmedTextOfFirstChild(
  el: Element | undefined,
  name: string,
): string | undefined {
  if (el === undefined) return undefined;
  const child = firstChildByLocalName(el, name);
  if (child === undefined) return undefined;
  const text = (child.textContent ?? "").trim();
  return text === "" ? undefined : text;
}

// ---------------------------------------------------------------------------
// Value parsing (NaN-guarded, per §H-2)
// ---------------------------------------------------------------------------

/**
 * Parse a numeric string. `undefined` when absent, blank, or non-finite —
 * callers turn that into an anomaly flag rather than inventing a value.
 */
export function parseFiniteNumber(
  text: string | null | undefined,
): number | undefined {
  if (text === null || text === undefined) return undefined;
  const trimmed = text.trim();
  if (trimmed === "") return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : undefined;
}
