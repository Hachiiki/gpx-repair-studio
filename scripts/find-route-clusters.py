#!/usr/bin/env python3
"""Tight-tolerance scan for the recorded route color #2563eb, with
connected-cluster analysis over the full screenshot."""
import json
import sys

from PIL import Image

TARGET = (34, 34, 34)
TOL = 24  # tight: only near-exact route ink

SCREENSHOT = "/home/z/my-project/download/task28-prod-05-pick-mode.png"


def main() -> None:
    img = Image.open(SCREENSHOT).convert("RGB")
    W, H = img.size
    px = img.load()

    pts = []
    for y in range(H):
        for x in range(W):
            r, g, b = px[x, y]
            if (
                abs(r - TARGET[0]) <= TOL
                and abs(g - TARGET[1]) <= TOL
                and abs(b - TARGET[2]) <= TOL
            ):
                pts.append((x, y))

    if not pts:
        print(json.dumps({"error": "no pixels", "count": 0}))
        return

    # Connected components (BFS, 8-neighbour) over a set for speed.
    pset = set(pts)
    seen = set()
    clusters = []
    for p in pts:
        if p in seen:
            continue
        stack = [p]
        seen.add(p)
        comp = []
        while stack:
            cx, cy = stack.pop()
            comp.append((cx, cy))
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    q = (cx + dx, cy + dy)
                    if q in pset and q not in seen:
                        seen.add(q)
                        stack.append(q)
        clusters.append(comp)

    clusters.sort(key=len, reverse=True)
    out = {"total": len(pts), "clusters": []}
    for comp in clusters[:8]:
        xs = [c[0] for c in comp]
        ys = [c[1] for c in comp]
        cx = sum(xs) / len(xs)
        cy = sum(ys) / len(ys)
        out["clusters"].append(
            {
                "size": len(comp),
                "bbox": [min(xs), min(ys), max(xs), max(ys)],
                "centroid": [round(cx, 1), round(cy, 1)],
            }
        )
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
