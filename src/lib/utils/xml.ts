/**
 * XML infrastructure adapter (docs/MASTER_PLAN.md §E-3, §F).
 *
 * The app's GPX parsing/serialization strategy is "native DOMParser +
 * XMLSerializer behind a typed facade". This module IS that boundary: it is
 * the **only** place in the codebase that touches the DOM XML globals.
 * Domain modules (`features/gpx/**`) stay pure — they receive an `XmlIo`
 * instance as an injected dependency, which keeps them testable under
 * jsdom in Vitest without any global mocking, and keeps the ESLint
 * domain-purity rules (no `window`/`document` in features/** or lib/geo/**)
 * meaningful.
 *
 * Two implementations exist in practice:
 *   - Browser (and jsdom tests): `createDomXmlIo()` below, built from the
 *     platform's own `DOMParser`/`XMLSerializer`.
 *   - Any custom environment can supply its own `XmlIo` — that is the point
 *     of the seam.
 *
 * Phase 1 — GPX Domain Core. Infrastructure layer (may touch DOM globals).
 */

/** Minimal XML parsing/serializing surface the GPX domain modules need. */
export interface XmlIo {
  /**
   * Parse an XML string into a Document. Malformed input must be reported
   * the platform way: either a `<parsererror>` document or a thrown error —
   * `parseGpx` handles both.
   */
  parse(xml: string): Document;

  /**
   * Create a new XML Document with the given root element. When `ns` is
   * non-null the root carries it as the default namespace.
   */
  createDocument(ns: string | null, rootName: string): Document;

  /** Serialize a node (subtree) to an XML string, namespaces intact. */
  serialize(node: Node): string;
}

/**
 * Build an `XmlIo` from the current environment's DOM XML globals
 * (browser or jsdom). Not usable in a bare Node process — unit tests for
 * DOM-dependent code run under `// @vitest-environment jsdom`.
 */
export function createDomXmlIo(): XmlIo {
  if (typeof globalThis.DOMParser !== "function") {
    throw new Error(
      "createDomXmlIo: no global DOMParser in this environment " +
        "(run under jsdom or a browser)",
    );
  }
  if (typeof globalThis.XMLSerializer !== "function") {
    throw new Error(
      "createDomXmlIo: no global XMLSerializer in this environment " +
        "(run under jsdom or a browser)",
    );
  }

  const parser = new globalThis.DOMParser();
  const serializer = new globalThis.XMLSerializer();

  return {
    parse: (xml) => parser.parseFromString(xml, "application/xml"),
    createDocument: (ns, rootName) => {
      const nsDecl = ns === null ? "" : ` xmlns="${ns}"`;
      // Parsing a minimal document is the most portable way to mint one
      // without relying on `document.implementation` (unavailable in a
      // bare jsdom-window context and in workers).
      const doc = parser.parseFromString(
        `<?xml version="1.0" encoding="UTF-8"?><${rootName}${nsDecl}/>`,
        "application/xml",
      );
      if (
        doc.documentElement === null ||
        doc.getElementsByTagNameNS("*", "parsererror").length > 0
      ) {
        // Cannot happen for the fixed, well-formed template above.
        throw new Error(`XmlIo.createDocument: failed to create <${rootName}/>`);
      }
      return doc;
    },
    serialize: (node) => serializer.serializeToString(node),
  };
}
