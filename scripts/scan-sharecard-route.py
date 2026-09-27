#!/usr/bin/env python3
"""Scan a share-card image for the orange route ink (#FC4C02) and report
its bounding box + coverage, normalized to the image size, so the real
card and the mockup reproduction can be compared numerically.

With --white, additionally scans for near-white foreground ink and
reports the horizontal bands it forms (wordmark / stats / shoe)."""
import json
import sys

from PIL import Image

# #FC4C02 -> (252, 76, 2)
TARGET = (252, 76, 2)
TOL = 30


def bands(rows, min_run=3, gap=12):
    """Collapse a per-row pixel-count list into bands."""
    out = []
    start = None
    last = None
    for y, n in enumerate(rows):
        if n >= min_run and start is None:
            start = y
        if n >= min_run:
            last = y
        elif start is not None and y - last > gap:
            out.append((start, last))
            start = None
    if start is not None:
        out.append((start, last))
    return out


def scan(path: str, do_white: bool) -> dict:
    img = Image.open(path).convert("RGB")
    W, H = img.size
    px = img.load()
    min_x, min_y, max_x, max_y = W, H, -1, -1
    n = 0
    white_rows = [0] * H
    for y in range(H):
        for x in range(W):
            r, g, b = px[x, y]
            if (
                abs(r - TARGET[0]) <= TOL
                and abs(g - TARGET[1]) <= TOL
                and abs(b - TARGET[2]) <= TOL
            ):
                n += 1
                if x < min_x:
                    min_x = x
                if x > max_x:
                    max_x = x
                if y < min_y:
                    min_y = y
                if y > max_y:
                    max_y = y
            elif do_white and r > 215 and g > 215 and b > 215:
                white_rows[y] += 1
    if n < 10:
        return {"path": path, "size": [W, H], "error": "too few orange pixels", "count": n}
    result = {
        "path": path,
        "size": [W, H],
        "orange_pixels": n,
        "bbox_px": [min_x, min_y, max_x, max_y],
        "bbox_norm": [
            round(min_x / W, 4),
            round(min_y / H, 4),
            round(max_x / W, 4),
            round(max_y / H, 4),
        ],
        "ink_coverage": round(n / (W * H), 4),
    }
    if do_white:
        result["white_bands_y"] = bands(white_rows)
    return result


if __name__ == "__main__":
    do_white = "--white" in sys.argv
    for p in [a for a in sys.argv[1:] if not a.startswith("--")]:
        print(json.dumps(scan(p, do_white), indent=2))
