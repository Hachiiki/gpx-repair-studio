import re

xml = open("/home/z/Downloads/time-gap.repaired (1).gpx").read()
pts = re.findall(r"<trkpt[^>]*>", xml)
times = re.findall(r"<time>([^<]+)</time>", xml)
recon = re.findall(r"<gpxr:reconstructed[^>]*>", xml)
print("trkpts:", len(pts))
print("reconstructed markers:", len(recon))
print("first marker:", recon[0][:130] if recon else None)
print("anchor lat verbatim:", 'lat="52.520006"' in xml)
print("anchor 07:00:09 present:", "2024-05-01T07:00:09Z" in xml)
print("anchor 07:05:09 present:", "2024-05-01T07:05:09Z" in xml)
summary = re.search(r"<gpxr:summary[^>]*>", xml)
print("summary:", summary.group(0)[:160] if summary else None)
interior = [t for t in times if "2024-05-01T07:00:09" < t < "2024-05-01T07:05:09"]
print("interior timestamps:", len(interior))
if interior:
    print("  first:", interior[0], " last:", interior[-1])
    print("  all strictly inside:", all("2024-05-01T07:00:09" < t < "2024-05-01T07:05:09" for t in interior))
print("attribution:", "Repaired with GPX Repair Studio" in xml)
print("first/last overall:", times[0], "...", times[-1])
