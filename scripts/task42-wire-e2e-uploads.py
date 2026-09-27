#!/usr/bin/env python3
"""Task 42 — wire the shared enterRepairTool helper into every
repair-section spec's local upload() helper.

For each spec (excluding gap-recovery/share-card/create-from-stats,
which enter their tools explicitly):
  1. add `import { enterRepairTool } from "./helpers/landing";` after
     the top import block;
  2. make `await enterRepairTool(page);` the first statement of the
     local `async function upload(...)` body.
"""
import re
from pathlib import Path

SPECS = [
    "upload-inspection.spec.ts",
    "workspace-layout.spec.ts",
    "strava-real-files.spec.ts",
    "time-reconstruction.spec.ts",
    "road-follow.spec.ts",
    "manual-repair-span.spec.ts",
    "export.spec.ts",
    "draw-editor.spec.ts",
    "elevation.spec.ts",
    "map-display.spec.ts",
]

E2E = Path("/home/z/my-project/e2e")
IMPORT = 'import { enterRepairTool } from "./helpers/landing";'
CALL = "  // Task 42: the landing opens on the tool cards — enter the repair\n  // tool's page before its upload zone exists.\n  await enterRepairTool(page);\n"

for name in SPECS:
    path = E2E / name
    text = path.read_text()

    if IMPORT not in text:
        # Insert after the last top-of-file import line.
        lines = text.split("\n")
        last_import = max(
            i for i, line in enumerate(lines) if line.startswith("import ")
        )
        lines.insert(last_import + 1, IMPORT)
        text = "\n".join(lines)

    if "await enterRepairTool(page);" not in text:
        text, n = re.subn(
            r"(async function upload\([^{]*\{\n)",
            r"\1" + CALL,
            text,
            count=1,
        )
        assert n == 1, f"{name}: upload() body not found"

    path.write_text(text)
    print(f"updated {name}")
