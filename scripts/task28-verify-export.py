#!/usr/bin/env python3
"""Task 28 production export byte-verification: the drawn undetected
section must carry pace-estimated timestamps, gapCount=1, verbatim
originals, and untouched anchor timestamps."""

import re

PATH = "/home/z/Downloads/valid-1.1.repaired (1).gpx"

xml = open(PATH).read()
pts = re.findall(r"<trkpt[^>]*>", xml)
times = re.findall(r"<time>([^<]+)</time>", xml)
recon = re.findall(r"<gpxr:reconstructed[^>]*>", xml)
summary = re.search(r"<gpxr:summary[^>]*/?>", xml)

print("file size:", len(xml))
print("trkpts:", len(pts), "(expect 84 = 6 original + 78 generated)")
print("reconstructed markers:", len(recon), "(expect 78)")
print("first marker:", recon[0][:160] if recon else None)

# Pace-estimated markers
pe = [m for m in recon if 'timeMethod="pace-estimated"' in m]
print("pace-estimated markers:", len(pe), "(expect 78)")

# Summary
print("summary:", summary.group(0)[:200] if summary else None)
gap = re.search(r'gapCount="(\d+)"', xml)
print("gapCount:", gap.group(1) if gap else None, "(expect 1)")

# Original six points verbatim (lat/lon)
originals = [
    ("52.520006", "13.404954"),
    ("52.520051", "13.405024"),
    ("52.520096", "13.405094"),
    ("52.520141", "13.405164"),
    ("52.520186", "13.405234"),
    ("52.520231", "13.405304"),
]
ok = all(f'lat="{la}" lon="{lo}"' in xml for la, lo in originals)
print("all 6 original coords verbatim:", ok)

# Anchor timestamps untouched: the original file has 6 times
# 07:00:00 .. 07:03:00 at 36s intervals? Read the fixture to compare.
fixture = open(
    "/home/z/my-project/src/features/gpx/fixtures/files/valid-1.1.gpx"
).read()
ftimes = re.findall(r"<time>([^<]+)</time>", fixture)
all_present = all(t in xml for t in ftimes)
print("fixture times:", ftimes)
print("all original timestamps present verbatim:", all_present)

# Elapsed time untouched: first and last overall times == fixture's
print("first/last overall:", times[0], "...", times[-1])
elapsed_ok = times[0] == ftimes[0] and times[-1] == ftimes[-1]
print("elapsed window untouched:", elapsed_ok)

# Interior (generated) timestamps strictly between anchor 3 (insert
# anchor, index 2) and anchor 4: generated points are inserted after
# the picked vertex (index 2, 07:00:48-ish) and before index 3.
anchor = ftimes[2]
nxt = ftimes[3]
interior = [t for t in times if anchor < t < nxt]
print("interior timestamps between", anchor, "and", nxt, ":", len(interior))
if interior:
    print("  first:", interior[0], " last:", interior[-1])
    print(
        "  all strictly inside:",
        all(anchor < t < nxt for t in interior),
    )

print("attribution:", "Repaired with GPX Repair Studio" in xml)
