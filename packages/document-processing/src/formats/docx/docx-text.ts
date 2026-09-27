import type { TextRegion, TextSegment } from '@cloakfile/shared';

import type { BoundaryReplacement } from '../pdf/pdf-text-align.js';

/**
 * Separates table cells in the flat text the detectors see.
 *
 * A normal space or newline is not enough: the person heuristics treat
 * whitespace as "the name continues". Word stores each cell as its own
 * paragraph, and joining them with a space made "Genevieve Beaumont" swallow
 * "Research" in the PDF path. This character is never written back into the
 * DOCX; it only exists between text nodes.
 */
export const CELL_BREAK = '\u001f';

/** Same idea between headers, footers, comments and the body. */
export const PART_BREAK = '\n\u001f\n';

const META_LOCAL_NAMES = new Set([
  'creator',
  'title',
  'subject',
  'description',
  'lastModifiedBy',
  'Company',
  'Manager',
]);

export interface DocxTextNode {
  readonly part: string;
  readonly region: TextRegion;
  readonly start: number;
  readonly end: number;
  /** Byte range of the decoded character data inside the part XML. */
  readonly innerStart: number;
  readonly innerEnd: number;
}

export interface DocxTextRead {
  readonly text: string;
  readonly nodes: readonly DocxTextNode[];
  readonly segments: readonly TextSegment[];
}

/**
 * Pull every visible and hidden text node out of one WordprocessingML part.
 *
 * Only the five predefined XML entities and numeric character references are
 * decoded. A general entity such as `&xxe;` is left untouched, so a DTD cannot
 * make this parser read a local file.
 */
export function readWordprocessingPart(
  part: string,
  xml: string,
  region: TextRegion,
  textSoFar: string,
): DocxTextRead {
  const nodes: DocxTextNode[] = [];
  const segments: TextSegment[] = [];
  let text = textSoFar;
  let pending: '' | '\n' | typeof CELL_BREAK = '';
  let cellDepth = 0;
  let index = 0;

  while (index < xml.length) {
    const mark = xml.indexOf('<', index);
    if (mark === -1) break;

    if (xml.startsWith('</w:tc', mark)) {
      cellDepth = Math.max(0, cellDepth - 1);
      index = mark + 6;
      continue;
    }

    if (!xml.startsWith('<w:', mark)) {
      index = mark + 1;
      continue;
    }

    const tagEnd = endOfTag(xml, mark);
    if (tagEnd === -1) break;

    const head = xml.slice(mark + 3, tagEnd - 1);
    const selfClosing = /\/\s*$/u.test(head);
    const name = /^[A-Za-z0-9]+/u.exec(head)?.[0] ?? '';
    const here: TextRegion = cellDepth > 0 ? 'table' : region;

    if (name === 'tc' && !selfClosing) {
      cellDepth += 1;
      if (text.length > textSoFar.length) pending = CELL_BREAK;
      index = tagEnd;
      continue;
    }

    if (name === 'p' && !selfClosing && pending !== CELL_BREAK && text.length > textSoFar.length) {
      pending = '\n';
      index = tagEnd;
      continue;
    }

    if ((name === 't' || name === 'delText' || name === 'instrText') && !selfClosing) {
      const close = `</w:${name}>`;
      const closeAt = xml.indexOf(close, tagEnd);
      if (closeAt === -1) break;

      if (pending.length > 0) {
        text += pending;
        pending = '';
      }

      const decoded = decodeXmlText(xml.slice(tagEnd, closeAt));
      const start = text.length;
      text += decoded;
      nodes.push({
        part,
        region: here,
        start,
        end: text.length,
        innerStart: tagEnd,
        innerEnd: closeAt,
      });
      if (decoded.length > 0) {
        segments.push({ start, end: text.length, locator: `${part}#${String(nodes.length)}`, region: here });
      }
      index = closeAt + close.length;
      continue;
    }

    index = tagEnd;
  }

  return { text, nodes, segments };
}

export function readMetadataPart(part: string, xml: string, textSoFar: string): DocxTextRead {
  const nodes: DocxTextNode[] = [];
  const segments: TextSegment[] = [];
  let text = textSoFar;
  const pattern = /<((?:[A-Za-z0-9]+:)?([A-Za-z0-9]+))>([\s\S]*?)<\/\1>/gu

  for (const match of xml.matchAll(pattern)) {
    const localName = match[2];
    const raw = match[3];
    const index = match.index;
    if (localName === undefined || raw === undefined) continue;
    if (!META_LOCAL_NAMES.has(localName) || raw.includes('<')) continue;

    if (text.length > textSoFar.length) text += '\n';
    const decoded = decodeXmlText(raw);
    const start = text.length;
    text += decoded;
    const innerStart = index + match[0].indexOf('>') + 1;
    nodes.push({
      part,
      region: 'metadata',
      start,
      end: text.length,
      innerStart,
      innerEnd: innerStart + raw.length,
    });
    if (decoded.length > 0) {
      segments.push({
        start,
        end: text.length,
        locator: `${part}#${localName}`,
        region: 'metadata',
      });
    }
  }

  return { text, nodes, segments };
}

/**
 * Text that belongs in one Word run after replacement.
 *
 * The run that contains the start of a match receives the whole placeholder.
 * Later runs covered by the same match become empty. That is what keeps a
 * name Word split into "Jo" + "hn Doe" from rendering as "[PERSON_001]hn Doe".
 */
export function textForNode(
  original: string,
  start: number,
  end: number,
  replacements: readonly BoundaryReplacement[],
): string {
  let output = '';
  let cursor = start;
  const ordered = [...replacements].sort((a, b) => a.start - b.start);

  for (const replacement of ordered) {
    if (replacement.end <= cursor || replacement.start >= end) continue;

    if (replacement.start > cursor) {
      output += original.slice(cursor, Math.min(replacement.start, end));
    }

    if (replacement.start >= start && replacement.start < end && cursor <= replacement.start) {
      output += replacement.placeholder;
    }

    cursor = Math.max(cursor, Math.min(end, replacement.end));
  }

  if (cursor < end) output += original.slice(cursor, end);
  return output;
}

export function rewriteXmlText(
  xml: string,
  nodes: readonly DocxTextNode[],
  original: string,
  replacements: readonly BoundaryReplacement[],
): string {
  const ordered = [...nodes].sort((a, b) => b.innerStart - a.innerStart);
  let result = xml;

  for (const node of ordered) {
    const next = escapeXmlText(textForNode(original, node.start, node.end, replacements));
    result = result.slice(0, node.innerStart) + next + result.slice(node.innerEnd);
  }

  return scrubAuthorAttributes(result);
}

/** Reviewer names live in attributes, which text extraction never returns. */
export function scrubAuthorAttributes(xml: string): string {
  return xml.replace(/\s(w:author|w:initials)="[^"]*"/gu, ' $1=""');
}

export function stripEmbeddingRelationships(xml: string): string {
  return xml.replace(/<Relationship\b[^>]*Target="embeddings\/[^"]*"[^>]*\/>/gu, '');
}

export function decodeXmlText(value: string): string {
  return value.replace(/&(amp|lt|gt|quot|apos|#x[0-9a-fA-F]+|#\d+);/gu, (_entity, body: string) => {
    if (body === 'amp') return '&';
    if (body === 'lt') return '<';
    if (body === 'gt') return '>';
    if (body === 'quot') return '"';
    if (body === 'apos') return "'";
    const code = body.startsWith('#x')
      ? Number.parseInt(body.slice(2), 16)
      : Number.parseInt(body.slice(1), 10);
    if (!Number.isInteger(code) || code < 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
      return '\uFFFD';
    }
    return String.fromCodePoint(code);
  });
}

export function escapeXmlText(value: string): string {
  return value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;');
}

function endOfTag(xml: string, from: number): number {
  let quote: '"' | "'" | null = null;
  for (let index = from; index < xml.length; index += 1) {
    const character = xml[index];
    if (quote !== null) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '>') return index + 1;
  }
  return -1;
}
