#!/usr/bin/env python3
"""Locate the recorded route's blue pixels in a screenshot and compute
the click target for a mid-route vertex (index 2 of 6, i.e. 40% along
the polyline), plus sanity stats. Output: absolute page coordinates."""
import json
import sys

from PIL import Image

# Route blue #2563eb -> (37, 99, 235)
TARGET = (37, 99, 235)
TOL = 70

SCREENSHOT = "/home/z/my-project/download/task28-prod-05-pick-mode.png"
CANVAS = {"x": 25, "y": 82, "w": 990, "h": 700}  # CSS px box from agent-browser


def main() -> None:
    img = Image.open(SCREENSHOT).convert("RGB")
    W, H = img.size
    print(f"screenshot size: {W}x{H}", file=sys.stderr)
    px = img.load()

    # Collect blue-ish pixels inside the canvas region.
    pts = []
    x0, y0 = CANVAS["x"], CANVAS["y"]
    x1, y1 = min(x0 + CANVAS["w"], W), min(y0 + CANVAS["h"], H)
    for y in range(y0, y1):
        for x in range(x0, x1):
            r, g, b = px[x, y]
            if (
                abs(r - TARGET[0]) <= TOL
                and abs(g - TARGET[1]) <= TOL
                and abs(b - TARGET[2]) <= TOL
            ):
                pts.append((x, y))

    if len(pts) < 10:
        print(json.dumps({"error": "too few blue pixels", "count": len(pts)}))
        return

    # Principal axis via covariance (the route is a straight diagonal).
    n = len(pts)
    mx = sum(p[0] for p in pts) / n
    my = sum(p[1] for p in pts) / n
    cxx = sum((p[0] - mx) ** 2 for p in pts) / n
    cyy = sum((p[1] - my) ** 2 for p in pts) / n
    cxy = sum((p[0] - mx) * (p[1] - my) for p in pts) / n
    theta = 0.5 * (2 * cxy) / max(1e-9, (cxx - cyy)) if abs(cxx - cyy) > 1e-9 else 0
    import math

    # Angle of principal axis (handle vertical/horizontal robustly).
    if abs(cxx - cyy) < 1e-9:
        ang = math.pi / 4 if cxy >= 0 else -math.pi / 4
    else:
        ang = 0.5 * math.atan2(2 * cxy, cxx - cyy)
    dx, dy = math.cos(ang), math.sin(ang)

    # Project onto the axis to find the extremes (endpoints).
    ts = [(p[0] - mx) * dx + (p[1] - my) * dy for p in pts]
    tmin, tmax = min(ts), max(ts)

    def point_at(frac: float):
        t = tmin + frac * (tmax - tmin)
        # Snap to the nearest actual blue pixel for accuracy.
        best, bestd = None, 1e18
        for (x, y), tv in zip(pts, ts):
            d = abs(tv - t)
            if d < bestd:
                best, bestd = (x, y), d
        return best

    p_start = point_at(0.0)
    p_end = point_at(1.0)
    p_mid = point_at(0.4)  # vertex index 2 of 6 (0,0.2,0.4,...)

    out = {
        "blue_pixel_count": n,
        "line_angle_deg": round(math.degrees(ang), 2),
        "start_pixel": p_start,
        "end_pixel": p_end,
        "click_pixel": p_mid,
        # Screen pixel == CSS px if DPR == 1 (agent-browser headless default).
        "click_page": {"x": p_mid[0], "y": p_mid[1]},
    }
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
