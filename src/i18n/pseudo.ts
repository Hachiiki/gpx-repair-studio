/**
 * The pseudo-locale harness (Phase 21 — §EE 21.4).
 *
 * A LONG-STRING EXPANSION transform applied to the English source at
 * import time — the overflow-QA stand-in for the languages the app
 * will gain later. English is the shortest of the app's locales in
 * practice (Chinese is denser per glyph but its unit words — 公里,
 * 米 — replace two-character "km"/"m", and future European locales
 * run 20–35% longer than English); the harness's job is not to
 * imitate any one language, it is to make EVERY layout survive a
 * ~35% copy growth with its alignment intact, before that growth
 * ships for real.
 *
 * The transform, per message:
 *   - the whole message is wrapped in ⟦ ⟧ — one glance says "this is
 *     the QA locale, not a translation bug";
 *   - every word grows by a third (a filler run proportional to the
 *     word's own length, so short labels grow short and sentences
 *     grow long — the shape tracks the real string);
 *   - `{param}` placeholders are passed through UNTOUCHED — they are
 *     substituted after this dictionary is built, and expanding them
 *     would break every interpolated message in the harness;
 *   - punctuation and spacing are preserved, so overflow is the only
 *     thing that can change.
 *
 * Deterministic: a pure function of the source string. No randomness
 * — the same English string expands to the same pseudo string in
 * every run, so screenshots and VLM probes are comparable.
 */

/** One filler unit — a neutral, visibly-non-English glyph. */
const FILLER = "ø";

/**
 * Expand one word by ~⅓ of its own length. A "word" here is a run of
 * non-space characters; `{param}` placeholders (with optional
 * surrounding punctuation) are returned untouched.
 */
function expandWord(word: string): string {
  // Split leading/trailing punctuation off the core so fillers never
  // land between a word and its comma.
  const core = word.replace(/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u, "$2");
  if (core === "") return word; // punctuation-only token
  // A `{param}` placeholder — alone or with attached punctuation —
  // passes through untouched: it is substituted after this dictionary
  // is built, and expanding it would break every interpolated message.
  if (/^\{[a-zA-Z][a-zA-Z0-9_]*\}[^\p{L}\p{N}]*$/u.test(word)) return word;
  const fill = FILLER.repeat(Math.max(1, Math.ceil(core.length / 3)));
  return word + fill;
}

/** Transform one English message into its expanded pseudo form. */
export function pseudoTransform(message: string): string {
  if (message === "") return message;
  const expanded = message.split(/(\s+)/).map((token) =>
    /^\s+$/.test(token) ? token : expandWord(token),
  );
  return `⟦${expanded.join("")}⟧`;
}

/** Build the whole pseudo dictionary from the English source. */
export function pseudoDictionary(
  source: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    out[key] = pseudoTransform(value);
  }
  return out;
}
