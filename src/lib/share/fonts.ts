/**
 * Share card font loading (docs/MASTER_PLAN.md §O — Task 20).
 *
 * Ensures the card's Montserrat faces are loaded before the painter
 * runs. The @font-face declaration lives in globals.css (self-hosted
 * variable font — no CDN, the local-first stance applies to typography
 * too); this module resolves the two weights the card draws through
 * the FontFaceSet, which fetches lazily and is idempotent by spec, so
 * callers may await it before every paint without penalty.
 *
 * Infrastructure layer (DOM globals by design, like the download
 * utility). Guards non-browser environments (SSR, jsdom without
 * `document.fonts`): resolves `false`, and the painter simply falls
 * back to the generic sans face — it never fails.
 */

import { SHARE_CARD_TYPE } from "@/lib/share/layout";

/** The card's two faces as one CSS font shorthand each. */
const FONT_SHORTHANDS = [
  `${SHARE_CARD_TYPE.label.weight} ${SHARE_CARD_TYPE.label.size}px ${SHARE_CARD_TYPE.fontFamily}`,
  `${SHARE_CARD_TYPE.value.weight} ${SHARE_CARD_TYPE.value.size}px ${SHARE_CARD_TYPE.fontFamily}`,
] as const;

/**
 * Resolve (and if necessary fetch) the Montserrat faces. `true` when
 * the fonts are ready; `false` in environments without a FontFaceSet —
 * callers proceed with the fallback face rather than blocking.
 */
export async function loadShareCardFonts(): Promise<boolean> {
  if (typeof document === "undefined" || !document.fonts?.load) {
    return false;
  }
  try {
    await Promise.all(FONT_SHORTHANDS.map((font) => document.fonts.load(font)));
    return true;
  } catch {
    // A failed fetch (offline, blocked) must not take the card down.
    return false;
  }
}
