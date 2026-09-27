import { MalformedDocumentError, type TextRegion, type TextSegment } from '@cloakfile/shared';

import type { BoundaryReplacement } from '../pdf/pdf-text-align.js';
import {
  PART_BREAK,
  readMetadataPart,
  readWordprocessingPart,
  rewriteXmlText,
  stripEmbeddingRelationships,
  type DocxTextNode,
} from './docx-text.js';
import { readZip, writeZip, type ZipPart } from './docx-zip.js';

export interface DocxPackage {
  readonly text: string;
  readonly nodes: readonly DocxTextNode[];
  readonly segments: readonly TextSegment[];
  readonly warnings: readonly string[];
  readonly unreadable: readonly string[];
  readonly parts: readonly ZipPart[];
}

const WORD_REGION: readonly { readonly pattern: RegExp; readonly region: TextRegion; readonly rank: number }[] = [
  { pattern: /^word\/document\.xml$/u, region: 'body', rank: 0 },
  { pattern: /^word\/header\d+\.xml$/u, region: 'header', rank: 10 },
  { pattern: /^word\/footer\d+\.xml$/u, region: 'footer', rank: 20 },
  { pattern: /^word\/footnotes\.xml$/u, region: 'footnote', rank: 30 },
  { pattern: /^word\/endnotes\.xml$/u, region: 'footnote', rank: 40 },
  { pattern: /^word\/comments\.xml$/u, region: 'annotation', rank: 50 },
];

/**
 * Read every text channel Word actually stores.
 *
 * Styles, numbering, tables and images are not interpreted here. They stay in
 * the ZIP and are copied back unchanged, which is how layout survives. The
 * flat string is only the input to detection.
 */
export function readDocxPackage(bytes: Uint8Array): DocxPackage {
  const parts = readZip(bytes);
  if (!parts.some((part) => part.name === 'word/document.xml')) {
    throw new MalformedDocumentError('This Word document has no body.');
  }

  const selected = parts
    .map((part) => ({ part, kind: classify(part.name) }))
    .filter((entry): entry is { part: ZipPart; kind: WordPartKind } => entry.kind !== null)
    .sort((a, b) => a.kind.rank - b.kind.rank || a.part.name.localeCompare(b.part.name));

  let text = '';
  const nodes: DocxTextNode[] = [];
  const segments: TextSegment[] = [];

  for (const entry of selected) {
    const xml = new TextDecoder('utf-8').decode(entry.part.data);
    if (text.length > 0 && xml.length > 0) text += PART_BREAK;

    const read =
      entry.kind.metadata
        ? readMetadataPart(entry.part.name, xml, text)
        : readWordprocessingPart(entry.part.name, xml, entry.kind.region, text);

    text = read.text;
    nodes.push(...read.nodes);
    segments.push(...read.segments);
  }

  const warnings: string[] = [];
  const unreadable: string[] = [];
  const hasMedia = parts.some((part) => part.name.startsWith('word/media/'));
  const hasEmbeddings = parts.some((part) => part.name.startsWith('word/embeddings/'));

  if (hasMedia && text.trim().length === 0) {
    unreadable.push('word/media');
  } else if (hasMedia) {
    warnings.push(
      'Pictures were kept. Text that appears only inside an image was not read and was not removed.',
    );
  }

  if (hasEmbeddings) {
    warnings.push('Embedded files were removed so they cannot carry unsanitized text.');
  }

  return { text, nodes, segments, warnings, unreadable, parts };
}

export function writeSanitizedDocx(
  source: DocxPackage,
  replacements: readonly BoundaryReplacement[],
): Uint8Array {
  const byPart = new Map<string, DocxTextNode[]>();
  for (const node of source.nodes) {
    const list = byPart.get(node.part) ?? [];
    list.push(node);
    byPart.set(node.part, list);
  }

  const xmlByName = new Map<string, string>();
  for (const part of source.parts) {
    if (!byPart.has(part.name) && !part.name.endsWith('.rels')) continue;
    xmlByName.set(part.name, new TextDecoder('utf-8').decode(part.data));
  }

  const rewritten = source.parts.flatMap((part) => {
    if (part.name.startsWith('word/embeddings/')) return [];

    const nodes = byPart.get(part.name);
    if (nodes !== undefined) {
      const xml = xmlByName.get(part.name);
      if (xml === undefined) return [part];
      return [{ name: part.name, data: encodeXml(rewriteXmlText(xml, nodes, source.text, replacements)) }];
    }

    if (part.name.endsWith('.rels')) {
      const xml = xmlByName.get(part.name);
      if (!xml?.includes('embeddings/')) return [part];
      return [{ name: part.name, data: encodeXml(stripEmbeddingRelationships(xml)) }];
    }

    return [part];
  });

  return writeZip(rewritten);
}

interface WordPartKind {
  readonly region: TextRegion;
  readonly rank: number;
  readonly metadata: boolean;
}

function classify(name: string): WordPartKind | null {
  if (name === 'docProps/core.xml' || name === 'docProps/app.xml') {
    return { region: 'metadata', rank: name.endsWith('core.xml') ? 60 : 70, metadata: true };
  }
  for (const candidate of WORD_REGION) {
    if (candidate.pattern.test(name)) {
      return { region: candidate.region, rank: candidate.rank, metadata: false };
    }
  }
  return null;
}

function encodeXml(xml: string): Uint8Array {
  return new TextEncoder().encode(xml);
}
