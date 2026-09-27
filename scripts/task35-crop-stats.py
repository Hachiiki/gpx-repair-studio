"""Crop the stats-panel table area from the Task 35 screenshot for a
focused VLM check of the category group labels."""
from PIL import Image

img = Image.open("download/task35-08-stats-banner.png")
w, h = img.size
# The statistics card sits below the three summary cards; crop the
# middle band of the page (full width).
crop = img.crop((0, int(h * 0.42), w, int(h * 0.80)))
crop.save("download/task35-08b-stats-table-crop.png")
print(f"cropped {crop.size}")
