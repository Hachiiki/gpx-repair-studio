// Generate the 100k-point synthetic fixture for the Task 35 loading-
// skeleton screenshot (same generator the e2e suite uses, same seed).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateSyntheticGpx } from "../src/features/gpx/fixtures/generators";

const dir = join("src", "features", "gpx", "fixtures", "files");
mkdirSync(dir, { recursive: true });
writeFileSync(
  join(dir, "synthetic-100k.generated.gpx"),
  generateSyntheticGpx({
    pointCount: 100_000,
    seed: 42,
    withTime: true,
    withEle: true,
    timeGapAfter: 50_000,
    timeGapSeconds: 600,
  }),
);
console.log("written");
