#!/usr/bin/env python3
"""
Phase 13 fixture generator — src/features/gpx/fixtures/files/deep-defects.gpx

A deterministic, hand-specified recording that carries exactly one instance
of every deep-check damage type (positions around Berlin, 3 s cadence):

  i=0..9    clean bike-leg points (~33 m steps, ~40 km/h)
  i=10      GPS teleport victim  (~1.2 km off, 3 s)  -> speed-spike (flag 10, 11)
  i=11      the return point     (leg 10->11 also implies >130 km/h)
  i=12..14  near-duplicates of 11 (0.3-0.9 m away)   -> duplicate-cluster
  i=15..19  backwards-time block (2 reversed transitions at 15 and 18)
  i=20      elevation pressure spike (118 m vs ~50 m neighbours)
  i=21..35  stop-and-wander drift blob (sub-0.5 m/s scatter, 42 s, <2 m)
  i=36..41  missing-elevation run (6 points without <ele>)
  i=42..44  clean finish

Gap detection stays quiet on this file by construction: cadence 3 s <<
120 s time-gap threshold, and the teleport legs are dt-guarded (3 s < 10 s).
Run once; the output is committed (deterministic bytes, no randomness).
"""

from datetime import datetime, timedelta, timezone

BASE = datetime(2024, 5, 1, 10, 0, 0, tzinfo=timezone.utc)
LAT0 = 52.5200
LON0 = 13.4050
M_PER_DEG_LAT = 111_320.0
M_PER_DEG_LON = 111_320.0 * 0.608_766  # cos(52.52 deg)

# Drift offsets (meters, east/north) for i=21..35: a slow circle of
# radius 3 m, arc step 0.4 rad -> constant 1.19 m chords. Every chord is
# > 1 m (outside the duplicate radius at ANY window distance: 1 step =
# 1.19 m, 2 steps = 2.34 m, 3 steps = 3.37 m) yet implies 0.40 m/s at
# the 3 s cadence (< 0.5). Max displacement from the start: 6.0 m (< 10 m).
import math

DRIFT_OFFSETS = [
    (
        round(3 + 3 * math.cos(-math.pi / 2 + 0.4 * k), 2),
        round(3 + 3 * math.sin(-math.pi / 2 + 0.4 * k), 2),
    )
    for k in range(15)
]


def iso(seconds: float) -> str:
    moment = BASE + timedelta(seconds=seconds)
    return moment.strftime("%Y-%m-%dT%H:%M:%SZ")


def ele_at(i: int):
    """Elevation profile: gentle climb; spike at 20; missing 36..41."""
    if 36 <= i <= 41:
        return None
    if i == 20:
        return 118.0
    return round(40.0 + 0.5 * i, 1)


def main() -> None:
    points = []  # (lat, lon, ele, time_str)

    def add(lat, lon, t):
        points.append((lat, lon, t))

    # 0..9 clean
    for i in range(10):
        add(LAT0 + 0.0003 * i, LON0, 3 * i)
    # 10 teleport, 11 return
    add(52.5300, 13.4100, 30)
    add(52.5230, 13.4050, 33)
    # 12..14 near-duplicates of 11 (0.45-0.81 m away — inside the 1 m radius)
    for k, (de, dn) in enumerate([(0.4, 0.2), (0.6, 0.3), (0.7, 0.4)]):
        add(
            52.5230 + dn / M_PER_DEG_LAT,
            13.4050 + de / M_PER_DEG_LON,
            36 + 3 * k,
        )
    # 15..19 backwards-time block (2 reversed transitions: at 15 and 18)
    block_times = [4, 7, 13, 10, 16]
    for k in range(5):
        add(52.5234 + 0.0003 * k, 13.4053, block_times[k])
    # 20 elevation spike point (position continues the line)
    add(52.52355, 13.4053, 63)
    # 21..35 drift blob around (52.5236, 13.4054)
    for k, (de, dn) in enumerate(DRIFT_OFFSETS):
        add(
            52.5236 + dn / M_PER_DEG_LAT,
            13.4054 + de / M_PER_DEG_LON,
            66 + 3 * k,
        )
    # 36..44 clean continuation (36..41 without <ele>)
    for k in range(9):
        add(52.5237 + 0.0003 * k, 13.4055, 108 + 3 * k)

    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<gpx version="1.1" creator="Deep Defects Generator 1" xmlns="http://www.topografix.com/GPX/1/1">',
        "  <trk>",
        "    <name>Deep defects synthetic ride</name>",
        "    <trkseg>",
    ]
    for index, (lat, lon, t) in enumerate(points):
        ele = ele_at(index)
        ele_xml = f"<ele>{ele}</ele>" if ele is not None else ""
        lines.append(
            f'      <trkpt lat="{lat:.6f}" lon="{lon:.6f}">'
            f"{ele_xml}<time>{iso(t)}</time></trkpt>"
        )
    lines += [
        "    </trkseg>",
        "  </trk>",
        "</gpx>",
        "",
    ]

    out = "\n".join(lines)
    path = "src/features/gpx/fixtures/files/deep-defects.gpx"
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(out)
    print(f"wrote {path}: {len(points)} points, {len(out)} bytes")


if __name__ == "__main__":
    main()
