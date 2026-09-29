import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";

const dom = new JSDOM();
const parser = new dom.window.DOMParser();
const ser = new dom.window.XMLSerializer();

const src = `<?xml version="1.0"?>
<gpx xmlns="urn:g" xmlns:foo="urn:foo"><a><foo:segext x="1"><foo:inner/></foo:segext></a></gpx>`;
const doc = parser.parseFromString(src, "application/xml");
const a = doc.documentElement.children[0];
const segext = a.children[0];
console.log("jsdom serialize(a)      :", ser.serializeToString(a));
console.log("jsdom serialize(segext) :", ser.serializeToString(segext));

const fixture = readFileSync(
  "src/features/gpx/fixtures/files/garmin-extensions.gpx",
  "utf8",
);
const doc2 = parser.parseFromString(fixture, "application/xml");
const root = doc2.documentElement;
const trk = root.getElementsByTagNameNS("*", "trk")[0];
const segexts = Array.from(trk.children).filter((c) => c.localName === "segext");
if (segexts.length) console.log("\nfixture segext serialize (jsdom):", ser.serializeToString(segexts[0]));
const trkpt = root.getElementsByTagNameNS("*", "trkpt")[0];
const ele = Array.from(trkpt.children).filter((c) => c.localName === "ele")[0];
console.log("fixture ele serialize (jsdom):   ", ser.serializeToString(ele));
