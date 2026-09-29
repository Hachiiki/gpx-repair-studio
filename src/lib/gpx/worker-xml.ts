/**
 * Worker-side compact XML engine (docs/MASTER_PLAN.md §E-3, Phase 9).
 *
 * Web Workers have no `DOMParser`/`XMLSerializer`, but the Phase 9 plan
 * moves parse+validate+gaps for large files off the main thread. Instead
 * of vendoring a full pure-JS DOM (heavy, slow), this module implements
 * the **exact surface `parseGpx` consumes** behind the same `XmlIo` seam
 * the domain already uses (lib/utils/xml.ts):
 *
 *   Document:  documentElement, getElementsByTagNameNS(ns, local)
 *   Element:   localName, tagName, getAttribute(name), children,
 *              textContent (subtree text), getElementsByTagNameNS
 *   XmlIo:     parse(xml) — THROWS on malformed input (the documented
 *              platform alternative to a <parsererror> document;
 *              parseGpx handles a throwing io), serialize(node)
 *              (spec-style subtree serialization with in-scope
 *              namespace materialization, like XMLSerializer).
 *
 * Why hand-rolled: a tight char-code tokenizer parses a 10 MB GPX in a
 * few hundred ms (vs multiple seconds for a pure-JS DOM), keeps the
 * worker bundle dependency-free, and lets `serialize` guarantee
 * well-formed output by construction. Parity with the native parser is
 * enforced by tests/worker-xml.test.ts: every committed fixture parses
 * to a structurally identical outcome through BOTH implementations, and
 * identity exports are byte-equal.
 *
 * Deliberate strictness parity (native XML parsers reject all of these;
 * so does this tokenizer — this is what drives the undeclared-prefix
 * recovery path in parseGpx):
 *   - undeclared namespace prefixes          - mismatched end tags
 *   - duplicate attributes                   - unclosed elements at EOF
 *   - text/content outside the root element  - invalid entity references
 *   - raw '<' or ']]>' in text               - '--' inside comments
 *
 * Accepted-but-normalized (documented, semantics-preserving — matches
 * the exporter's existing normalizations): CDATA becomes escaped text;
 * the XML declaration, comments, PIs and DOCTYPE are not kept in the
 * tree (parseGpx never reads them; serialize of a subtree therefore
 * never re-emits them).
 *
 * Phase 9 — Performance & Large Files. Pure TypeScript: no DOM globals
 * (this is the *worker* twin of lib/utils/xml.ts, which stays the only
 * place that touches the DOM XML globals).
 */

import type { XmlIo } from "@/lib/utils/xml";

// ---------------------------------------------------------------------------
// Node model — one class carries the data AND the DOM-parity surface
// ---------------------------------------------------------------------------

/**
 * A CDATA character-data run, kept distinct from plain text so the
 * serializer can re-emit `<![CDATA[…]]>` exactly like XMLSerializer does
 * (byte-parity between the two engines' identity exports).
 */
export class CdataText {
  readonly text: string;
  constructor(text: string) {
    this.text = text;
  }
}

/** One element node: the only node type the compact tree keeps. */
export class MiniElement {
  readonly tagName: string;
  readonly localName: string;
  readonly prefix: string | null;
  readonly namespaceURI: string | null;
  /** Qualified attribute name → decoded value (xmlns included). */
  readonly attributes: Record<string, string>;
  /** Attribute names THIS element declared (document order). */
  readonly selfDeclared: readonly string[];
  /**
   * Ordered content: text strings, CDATA runs, and child elements
   * interleaved in document order (this is what keeps DOM `textContent`
   * semantics exact). Trees are immutable once tokenized, so the
   * element-only `children` view is cached lazily.
   */
  readonly content: (string | CdataText | MiniElement)[];
  /** Parent element (null for the document element). */
  parent: MiniElement | null;
  #childrenView: MiniElement[] | null;

  constructor(init: {
    tagName: string;
    localName: string;
    prefix: string | null;
    namespaceURI: string | null;
    attributes: Record<string, string>;
    selfDeclared: string[];
  }) {
    this.tagName = init.tagName;
    this.localName = init.localName;
    this.prefix = init.prefix;
    this.namespaceURI = init.namespaceURI;
    this.attributes = init.attributes;
    this.selfDeclared = init.selfDeclared;
    this.content = [];
    this.parent = null;
    this.#childrenView = null;
  }

  /** DOM parity: qualified-name lookup, null when absent. */
  getAttribute(name: string): string | null {
    const value = this.attributes[name];
    return value === undefined ? null : value;
  }

  /** DOM parity: element children only, in document order. */
  get children(): MiniElement[] {
    if (this.#childrenView === null) {
      this.#childrenView = this.content.filter(
        (node): node is MiniElement => node instanceof MiniElement,
      );
    }
    return this.#childrenView;
  }

  /** DOM parity: concatenated text of the whole subtree, in order. */
  get textContent(): string {
    let out = "";
    for (const node of this.content) {
      if (typeof node === "string") out += node;
      else if (node instanceof MiniElement) out += node.textContent;
      else out += node.text; // CdataText
    }
    return out;
  }

  /** DOM parity: subtree search by namespace + localName ("*" wildcards). */
  getElementsByTagNameNS(ns: string, localName: string): MiniElement[] {
    return searchSubtree(this, ns, localName);
  }
}

/** The compact Document twin. */
export class MiniDocument {
  readonly documentElement: MiniElement | null;
  constructor(root: MiniElement | null) {
    this.documentElement = root;
  }
  getElementsByTagNameNS(ns: string, localName: string): MiniElement[] {
    return this.documentElement
      ? searchSubtree(this.documentElement, ns, localName)
      : [];
  }
}

/** Structured syntax error carrying the 1-based line/column it was found at. */
export class XmlSyntaxError extends Error {
  readonly line: number;
  readonly column: number;
  constructor(message: string, line: number, column: number) {
    super(`${line}:${column}: ${message}`);
    this.name = "XmlSyntaxError";
    this.line = line;
    this.column = column;
  }
}

/** Subtree search matching DOM getElementsByTagNameNS semantics. */
function searchSubtree(
  root: MiniElement,
  ns: string,
  localName: string,
): MiniElement[] {
    const out: MiniElement[] = [];
  const stack: MiniElement[] = [root];
  while (stack.length > 0) {
    const el = stack.pop()!;
    if (
      (ns === "*" || el.namespaceURI === ns) &&
      (localName === "*" || el.localName === localName)
    ) {
      out.push(el);
    }
    const children = el.children;
    for (let i = children.length - 1; i >= 0; i -= 1) {
      stack.push(children[i]);
    }
  }
  // DOM document-order guarantee (the stack walk reverses siblings).
  out.reverse();
  return out;
}

// ---------------------------------------------------------------------------
// Name scanning (XML Name, pragmatic: ASCII rules + any codepoint > 0x7F,
// which accepts every realistic GPX vocabulary incl. unicode names)
// ---------------------------------------------------------------------------

function isNameStartChar(code: number): boolean {
  return (
    (code >= 0x61 && code <= 0x7a) || // a-z
    (code >= 0x41 && code <= 0x5a) || // A-Z
    code === 0x5f || // _
    code > 0x7f // pragmatic unicode acceptance
  );
}

function isNameChar(code: number): boolean {
  return (
    isNameStartChar(code) ||
    (code >= 0x30 && code <= 0x39) || // 0-9
    code === 0x2d || // -
    code === 0x2e || // .
    code === 0x3a // : (qualified names carry their separator)
  );
}

// ---------------------------------------------------------------------------
// Entity decoding (the XML-predefined set + character references)
// ---------------------------------------------------------------------------

const PREDEFINED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

/**
 * Decode `&…;` starting at `start` (which points at the '&').
 * Returns [decodedText, indexAfterSemicolon], or null when the source
 * at this position is not a well-formed entity reference (the caller
 * reports a syntax error — native parsers reject a raw '&' likewise).
 */
function decodeEntity(
  text: string,
  start: number,
): readonly [string, number] | null {
  const semi = text.indexOf(";", start + 1);
  if (semi === -1 || semi - start > 12) return null; // no ';' (or absurd length)
  const body = text.slice(start + 1, semi);
  const predefined = PREDEFINED_ENTITIES[body];
  if (predefined !== undefined) return [predefined, semi + 1] as const;
  if (body.startsWith("#")) {
    const hex = body[1] === "x" || body[1] === "X";
    const digits = hex ? body.slice(2) : body.slice(1);
    if (digits.length === 0 || digits.length > 6) return null;
    for (let i = 0; i < digits.length; i += 1) {
      const c = digits.charCodeAt(i);
      const ok = hex
        ? (c >= 0x30 && c <= 0x39) ||
          (c >= 0x61 && c <= 0x66) ||
          (c >= 0x41 && c <= 0x46)
        : c >= 0x30 && c <= 0x39;
      if (!ok) return null;
    }
    const code = parseInt(digits, hex ? 16 : 10);
    if (!Number.isFinite(code) || code === 0 || code > 0x10ffff) return null;
    return [String.fromCodePoint(code), semi + 1] as const;
  }
  return null; // named entities beyond the predefined five do not exist in XML
}

/** Decode all entity references in a text/attribute run (pre-validated). */
function decodeText(text: string): string {
  if (!text.includes("&")) return text;
  let out = "";
  let i = 0;
  while (i < text.length) {
    const amp = text.indexOf("&", i);
    if (amp === -1) {
      out += text.slice(i);
      break;
    }
    out += text.slice(i, amp);
    const decoded = decodeEntity(text, amp);
    if (decoded === null) {
      throw new XmlSyntaxError("invalid entity reference", 0, 0);
    }
    out += decoded[0];
    i = decoded[1];
  }
  return out;
}

// ---------------------------------------------------------------------------
// The tokenizer
// ---------------------------------------------------------------------------

export interface TokenizerProgress {
  /** Called every ~256 KB of consumed source. */
  onProgress?: (consumedBytes: number, totalBytes: number) => void;
}

const PROGRESS_WINDOW = 262_144;

/**
 * Parse an XML document string into the compact tree. Throws
 * {@link XmlSyntaxError} for anything a native XML parser would reject.
 */
export function tokenizeXml(
  source: string,
  progress?: TokenizerProgress,
): MiniDocument {
  const text = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  const len = text.length;
  let pos = 0;
  let line = 1;
  let lineStart = 0;
  let lastProgress = 0;

  const fail = (message: string): never => {
    throw new XmlSyntaxError(message, line, pos - lineStart + 1);
  };
  const advance = (to: number): void => {
    while (pos < to) {
      if (text.charCodeAt(pos) === 10) {
        line += 1;
        lineStart = pos + 1;
      }
      pos += 1;
    }
  };

  const skipWhitespace = (): boolean => {
    const start = pos;
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) pos += 1;
      else break;
    }
    return pos > start;
  };

  const expect = (literal: string): void => {
    if (!text.startsWith(literal, pos)) {
      fail(`expected ${JSON.stringify(literal)}`);
    }
    advance(pos + literal.length);
  };

  const skipUntil = (closer: string, what: string): void => {
    const idx = text.indexOf(closer, pos);
    if (idx === -1) fail(`unterminated ${what}`);
    advance(idx + closer.length);
  };

  /** Prolog/misc skip: whitespace, comments, PIs, DOCTYPE. */
  const skipMisc = (): void => {
    for (;;) {
      skipWhitespace();
      if (text.startsWith("<?", pos)) {
        advance(pos + 2);
        skipUntil("?>", "processing instruction");
        continue;
      }
      if (text.startsWith("<!--", pos)) {
        const start = pos;
        advance(pos + 4);
        const idx = text.indexOf("-->", pos);
        if (idx === -1) fail("unterminated comment");
        if (text.slice(start + 4, idx).includes("--")) {
          fail("comment content must not contain '--'");
        }
        advance(idx + 3);
        continue;
      }
      if (text.startsWith("<!DOCTYPE", pos)) {
        advance(pos + 9);
        skipWhitespace();
        // Optional external id, then an optional internal subset in [...]
        // (bracket-aware so embedded '>' cannot fool us).
        let depth = 0;
        while (pos < len) {
          const c = text[pos];
          if (c === "[") {
            depth += 1;
            pos += 1;
          } else if (c === "]") {
            depth -= 1;
            pos += 1;
          } else if (c === ">" && depth === 0) {
            pos += 1;
            break;
          } else {
            pos += 1;
          }
        }
        if (pos > len) fail("unterminated DOCTYPE declaration");
        continue;
      }
      return;
    }
  };

  /**
   * Parse one element (pos is at its '<'). `parentBindings` carries the
   * in-scope namespace context.
   */
  const parseElement = (
    parentBindings: ReadonlyMap<string | null, string>,
  ): MiniElement => {
    expect("<");
    const name = scanNameStrict();

    // --- Attributes ------------------------------------------------------
    const attributes: Record<string, string> = {};
    const selfDeclared: string[] = [];
    let selfClosing = false;
    for (;;) {
      const hadSpace = skipWhitespace();
      if (pos >= len) fail(`unterminated start tag <${name}`);
      const c = text[pos];
      if (c === ">") {
        advance(pos + 1);
        break;
      }
      if (c === "/") {
        if (!text.startsWith("/>", pos)) fail("expected '/>'");
        advance(pos + 2);
        selfClosing = true;
        break;
      }
      if (!hadSpace) fail(`expected whitespace before attribute in <${name}`);
      const attrName = scanNameStrict();
      skipWhitespace();
      expect("=");
      skipWhitespace();
      const quote = text[pos];
      if (quote !== '"' && quote !== "'") {
        fail("attribute value must be quoted");
      }
      const valueStart = pos + 1;
      const valueEnd = text.indexOf(quote, valueStart);
      if (valueEnd === -1) fail("unterminated attribute value");
      // Reject '<' in values (native XML does too); '>' is legal per XML 1.0.
      if (text.slice(valueStart, valueEnd).includes("<")) {
        fail(`'<' is not allowed inside an attribute value`);
      }
      if (attributes[attrName] !== undefined) {
        fail(`duplicate attribute ${attrName}`);
      }
      advance(valueEnd + 1);
      attributes[attrName] = decodeText(text.slice(valueStart, valueEnd));
      selfDeclared.push(attrName);
    }

    // --- Namespace resolution -------------------------------------------
    const bindings = new Map<string | null, string>(parentBindings);
    for (const attrName of selfDeclared) {
      if (attrName === "xmlns") {
        bindings.set(null, attributes[attrName]);
      } else if (attrName.startsWith("xmlns:")) {
        const prefix = attrName.slice(6);
        if (
          prefix === "xml" &&
          attributes[attrName] !== "http://www.w3.org/XML/1998/namespace"
        ) {
          fail("the 'xml' prefix is reserved");
        }
        if (prefix === "xmlns") fail("the 'xmlns' prefix must not be declared");
        bindings.set(prefix, attributes[attrName]);
      }
    }
    const colon = name.indexOf(":");
    const prefix = colon === -1 ? null : name.slice(0, colon);
    const localName = colon === -1 ? name : name.slice(colon + 1);
    let namespaceURI: string | null;
    if (prefix === null) {
      namespaceURI = bindings.get(null) ?? null;
    } else if (prefix === "xml") {
      namespaceURI = "http://www.w3.org/XML/1998/namespace";
    } else {
      namespaceURI = bindings.get(prefix) ?? null;
      if (namespaceURI === null) {
        fail(`undeclared namespace prefix "${prefix}"`);
      }
    }

    const element = new MiniElement({
      tagName: name,
      localName,
      prefix,
      namespaceURI,
      attributes,
      selfDeclared,
    });

    if (selfClosing) return element;

    // --- Children --------------------------------------------------------
    for (;;) {
      if (pos >= len) fail(`unclosed element <${name}`);
      const lt = text.indexOf("<", pos);
      if (lt === -1) fail(`unclosed element <${name}`);
      if (lt > pos) {
        // Character data run [pos, lt).
        const run = text.slice(pos, lt);
        if (run.includes("]]>")) fail("']]>' is not allowed in character data");
        if (run.includes("&")) {
          // Validate entities now so the error carries the right position.
          for (let i = run.indexOf("&"); i !== -1; i = run.indexOf("&", i + 1)) {
            if (decodeEntity(run, i) === null) {
              advance(pos + i);
              fail("invalid entity reference");
            }
          }
        }
        element.content.push(decodeText(run));
        advance(lt);
      }

      if (text.startsWith("</", pos)) {
        advance(pos + 2);
        const closeName = scanNameStrict();
        skipWhitespace();
        expect(">");
        if (closeName !== name) {
          fail(
            `mismatched closing tag: expected </${name}>, found </${closeName}>`,
          );
        }
        return element;
      }
      if (text.startsWith("<!--", pos) || text.startsWith("<?", pos)) {
        skipMisc();
        continue;
      }
      if (text.startsWith("<![CDATA[", pos)) {
        advance(pos + 9);
        const end = text.indexOf("]]>", pos);
        if (end === -1) fail("unterminated CDATA section");
        element.content.push(new CdataText(text.slice(pos, end))); // verbatim
        advance(end + 3);
        continue;
      }
      if (text.startsWith("<!", pos)) {
        fail("declarations are not allowed inside element content");
      }
      const child = parseElement(bindings);
      child.parent = element;
      element.content.push(child);

      if (pos - lastProgress > PROGRESS_WINDOW && progress?.onProgress) {
        lastProgress = pos;
        progress.onProgress(pos, len);
      }
    }
  };

  /** scanName with the structural checks the XML Name production needs. */
  function scanNameStrict(): string {
    if (pos >= len) fail("unexpected end of input in a name");
    if (!isNameStartChar(text.charCodeAt(pos))) {
      fail(`unexpected character ${JSON.stringify(text[pos])} in a name`);
    }
    const start = pos;
    pos += 1;
    while (pos < len && isNameChar(text.charCodeAt(pos))) pos += 1;
    if (text[pos - 1] === ":") fail("name may not end with ':'");
    const name = text.slice(start, pos);
    if ((name.match(/:/g) ?? []).length > 1) {
      fail("name may contain at most one ':'");
    }
    return name;
  }

  // --- Document ----------------------------------------------------------
  skipMisc(); // prolog
  if (pos >= len || text[pos] !== "<") fail("no root element found");
  if (text.startsWith("</", pos)) {
    fail("document must not start with a closing tag");
  }
  const root = parseElement(new Map());
  skipMisc(); // trailing misc
  if (pos !== len) fail("content is not allowed after the root element");
  progress?.onProgress?.(len, len);
  return new MiniDocument(root);
}

// ---------------------------------------------------------------------------
// Serialization (spec-style, XMLSerializer-compatible shape)
// ---------------------------------------------------------------------------

function escapeText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;")
    .replaceAll("\t", "&#x9;")
    .replaceAll("\n", "&#xA;")
    .replaceAll("\r", "&#xD;");
}

/**
 * Serialize one element with the DOM Parsing spec's prefix-map algorithm
 * (the one jsdom/Chrome XMLSerializer implement for subtree
 * serialization): namespace bindings are seeded EMPTY at the
 * serialization root, declarations found on nodes register as encountered
 * (scoped to their element), and a declaration is materialized on an
 * element exactly when its own name needs a binding the current map
 * cannot satisfy. The result re-parses standalone to the same tree.
 */
function serializeElement(el: MiniElement, map: Map<string | null, string>): string {
  const saved: [string | null, string | undefined][] = [];
  const setBinding = (key: string | null, uri: string): void => {
    saved.push([key, map.get(key)]);
    map.set(key, uri);
  };
  const currentDefault = (): string | null => {
    const cur = map.get(null);
    return cur === undefined || cur === "" ? null : cur;
  };

  let out = `<${el.tagName}`;

  // 1. Declarations the node itself carries (document order), registered
  //    into the map. Emitted even when redundant — they are the node's
  //    own attributes, and XMLSerializer keeps them ahead of the rest.
  for (const attr of el.selfDeclared) {
    if (attr === "xmlns") {
      const uri = el.attributes[attr];
      if (currentDefault() !== uri || map.get(null) === undefined) {
        out += ` xmlns="${escapeAttribute(uri)}"`;
      }
      setBinding(null, uri);
    } else if (attr.startsWith("xmlns:")) {
      const prefix = attr.slice(6);
      out += ` xmlns:${prefix}="${escapeAttribute(el.attributes[attr])}"`;
      setBinding(prefix, el.attributes[attr]);
    }
  }

  // 2. Namespace fixup for the element's own qualified name.
  const ns = el.namespaceURI ?? null;
  if (el.prefix === null) {
    if (ns !== currentDefault()) {
      out += ns === null ? ` xmlns=""` : ` xmlns="${escapeAttribute(ns)}"`;
      setBinding(null, ns ?? "");
    }
  } else if (el.prefix !== "xml") {
    if (map.get(el.prefix) !== ns) {
      out += ` xmlns:${el.prefix}="${escapeAttribute(ns ?? "")}"`;
      setBinding(el.prefix, ns ?? "");
    }
  }

  // 3. Regular attributes (source order; namespace declarations excluded).
  for (const [name, value] of Object.entries(el.attributes)) {
    if (name === "xmlns" || name.startsWith("xmlns:")) continue;
    out += ` ${name}="${escapeAttribute(value)}"`;
  }

  if (el.content.length === 0) {
    restore(map, saved);
    return `${out}/>`;
  }
  out += ">";
  for (const node of el.content) {
    if (node instanceof MiniElement) out += serializeElement(node, map);
    else if (node instanceof CdataText) out += `<![CDATA[${node.text}]]>`;
    else out += escapeText(node);
  }
  restore(map, saved);
  return `${out}</${el.tagName}>`;
}

/** Undo the bindings this element pushed (siblings must not inherit them). */
function restore(
  map: Map<string | null, string>,
  saved: [string | null, string | undefined][],
): void {
  for (let i = saved.length - 1; i >= 0; i -= 1) {
    const [key, value] = saved[i];
    if (value === undefined) map.delete(key);
    else map.set(key, value);
  }
}

// ---------------------------------------------------------------------------
// The XmlIo implementation
// ---------------------------------------------------------------------------

/**
 * Build the worker-side `XmlIo`. `parse` throws {@link XmlSyntaxError} on
 * malformed input — the documented alternative to a parsererror document
 * that parseGpx handles. `serialize` mirrors XMLSerializer's subtree
 * behavior (in-scope namespaces materialized on the root).
 *
 * The returned nodes are `MiniElement`/`MiniDocument` instances cast to
 * the lib.dom types the `XmlIo` interface declares — the DOM-parity
 * surface above is exactly what parseGpx touches, and the corpus
 * equivalence test keeps the two implementations honest.
 */
export function createWorkerXmlIo(progress?: TokenizerProgress): XmlIo {
  return {
    parse: (xml: string) => tokenizeXml(xml, progress) as unknown as Document,
    createDocument: (ns: string | null, rootName: string) =>
      tokenizeXml(
        `<?xml version="1.0" encoding="UTF-8"?><${rootName}${ns === null ? "" : ` xmlns="${ns}"`}/>`,
      ) as unknown as Document,
    serialize: (node: Node) =>
      serializeMini(node as unknown as MiniElement | MiniDocument),
  };
}

/** Dispatch a serialize call to the element or document serializer. */
function serializeMini(node: MiniElement | MiniDocument): string {
  if (node instanceof MiniElement) {
    return serializeElement(node, new Map());
  }
  if (node instanceof MiniDocument && node.documentElement !== null) {
    return `<?xml version="1.0" encoding="UTF-8"?>${serializeElement(
      node.documentElement,
      new Map(),
    )}`;
  }
  throw new Error("serialize: unsupported node (worker XmlIo)");
}
