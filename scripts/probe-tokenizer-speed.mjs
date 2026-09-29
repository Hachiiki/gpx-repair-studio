// Tokenizer speed probe on the real 100k fixture.
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

const { tokenizeXml } = await import(
  new URL("../src/lib/gpx/worker-xml.ts", import.meta.url).href
).catch(() => ({ tokenizeXml: null }));

if (!tokenizeXml) {
  // Run via vitest-style TS import instead: use tsx-like loader through bun/node --experimental-strip-types
  const mod = await import(
    new URL("../src/lib/gpx/worker-xml.ts", import.meta.url).href
  );
  console.log(typeof mod.tokenizeXml);
  process.exit(1);
}

const text = readFileSync("e2e/fixtures/synthetic-100k.generated.gpx", "utf8");
console.log("fixture size:", (text.length / 1048576).toFixed(1), "MB");

// Warmup + measure
tokenizeXml(text);
const t0 = performance.now();
const doc = tokenizeXml(text);
const t1 = performance.now();
const seg = doc.documentElement.children.filter((c) => c.localName === "trk")[0];
const trkseg = seg.children.filter((c) => c.localName === "trkseg")[0]; const points = trkseg.children.filter((c) => c.localName === "trkpt");
console.log("tokenize:", Math.round(t1 - t0), "ms");
console.log("trkpt count:", points.length);
console.log("first point lat/lon:", points[0].getAttribute("lat"), points[0].getAttribute("lon"));
