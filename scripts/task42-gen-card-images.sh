#!/usr/bin/env bash
# Task 42 — generate the four landing tool-card illustrations.
#
# Art direction: the app's "Field Plot" theme as an illustration style —
# off-white paper, thin dark ink linework, ONE orange accent, faint
# topographic contours, no text (AI text renders as gibberish; the
# cards' typography is real DOM text around the image).
#
# Raw generations land in scripts/qa/task42/raw/ (QA artifacts);
# scripts/task42-optimize-card-images.mjs then produces the shipped
# public/cards/*.webp.

set -euo pipefail

RAW_DIR="scripts/qa/task42/raw"
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

gen repair \
  "a winding route line drawn as a bold dark ink stroke crossing the frame from lower left to upper right; the middle third of the route is missing, replaced by a dashed orange line being drawn by a simple orange pencil tip; two round dark map pins mark where the solid route breaks off."

gen share \
  "a tall smartphone standing upright in the center; its screen shows a minimal tall poster with one bold orange squiggly route line with a thin dark outline, and three short dark horizontal bars beneath it; a small orange circle with a downward arrow floats beside the phone."

gen recovery \
  "a round sports GPS watch with a wrist band lies at lower left; a route line travels from the watch across the frame, breaks into a dotted orange segment strung between two anchor pins, then continues as a solid dark ink line; a small dark stopwatch symbol floats above the dotted segment."

gen create \
  "a rectangular sports watch face at upper left showing three tiny gauge dials; an orange pencil at lower right draws a brand-new winding route line onto the paper, small orange dots appearing along the fresh line; the route starts at a small dashed dark circle."

echo "== all generations complete:"
ls -la "$RAW_DIR"
