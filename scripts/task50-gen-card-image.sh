#!/usr/bin/env bash
# Task 50 — generate the sixth landing tool-card illustration (plan).
#
# Art direction: the app's "Field Plot" theme as an illustration style —
# off-white paper, thin dark ink linework, ONE orange accent, faint
# topographic contours, no text (AI text renders as gibberish; the
# cards' typography is real DOM text around the image). The exact
# STYLE string from Task 42 keeps all six cards one family.
#
# Raw generation lands in scripts/qa/task50/raw/ (QA artifact);
# scripts/task50-optimize-card-image.mjs then produces the shipped
# public/cards/plan.webp.

set -euo pipefail

RAW_DIR="scripts/qa/task50/raw"
mkdir -p "$RAW_DIR"

STYLE="Minimal flat vector illustration, technical field-manual drawing style. Off-white warm paper background, thin dark charcoal ink line work, exactly one vivid orange accent color, faint light gray topographic contour lines in the background. Consistent line weight, geometric and precise, generous negative space, no gradients, no shadows, no text, no letters, no numbers, no words, no logos."

gen() {
  local mode="$1"
  local scene="$2"
  local out="$RAW_DIR/${mode}.png"
  if [[ -s "$out" ]]; then
    echo "== $mode: already generated, skipping (delete to regen)"
    return
  fi
  echo "== $mode: generating (1344x768)..."
  z-ai image -p "$STYLE Scene: $scene" -o "$out" -s 1344x768
}

gen plan \
  "a winding route line drawn as a bold dark ink stroke crossing the frame from lower left to upper right; small orange ruler tick marks measure two segments of the route, each tick a short perpendicular orange dash; a thin dark drafting compass and a straight ruler lie beside the route at lower right; one round dark map pin marks the route's start, a dashed dark circle marks its end; a faint dashed dark straight line connects start and end directly, contrasting with the winding path."

echo "== generation complete:"
ls -la "$RAW_DIR"
