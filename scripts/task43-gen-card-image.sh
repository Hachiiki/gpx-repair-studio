#!/usr/bin/env bash
# Task 43 — generate the fifth landing tool-card illustration (merge).
#
# Art direction: the app's "Field Plot" theme as an illustration style —
# off-white paper, thin dark ink linework, ONE orange accent, faint
# topographic contours, no text (AI text renders as gibberish; the
# card's typography is real DOM text around the image). The exact
# STYLE string from Task 42 keeps all five cards one family.
#
# Raw generation lands in scripts/qa/task43/raw/ (QA artifact);
# scripts/task43-optimize-card-image.mjs then produces the shipped
# public/cards/merge.webp.

set -euo pipefail

RAW_DIR="scripts/qa/task43/raw"
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

gen merge \
  "three separate winding route lines enter the frame from the left edge at different heights, drawn as thin dark ink strokes; they converge and join at one round dark pin near the center, continuing together as a single bold dark route line toward the upper right; the joined line's shared pin carries a small orange ring; two small dark map pins mark the two outer source lines' starting points."

echo "== generation complete:"
ls -la "$RAW_DIR"
