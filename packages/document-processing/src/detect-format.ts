import { UnsupportedFormatError, type DocumentFormat } from '@sds/shared';

export interface FormatProbe {
  /** Extension taken from the upload's filename. A hint only — never trusted alone. */
  readonly declaredExtension?: string;
  /** `Content-Type` from the multipart part. Client-controlled; also a hint only. */
  readonly declaredMediaType?: string;
}

export interface FormatDetection {
  readonly format: DocumentFormat;
  /** How the decision was reached, for logging and for the capabilities response. */
  readonly evidence: 'signature' | 'content-parse' | 'text-heuristic';
  /** True when the client's claim disagreed with the bytes. */
  readonly declarationMismatch: boolean;
}

const PDF_SIGNATURE = '%PDF-';
const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];
/** OOXML stores its part names uncompressed in local headers, so this is findable in raw bytes. */
const OOXML_WORD_MARKER = 'word/document.xml';

/**
 * Decide what a file actually is, from its bytes.
 *
 * The filename extension and the browser-supplied Content-Type are both fully
 * attacker-controlled. `evil.pdf` may be a ZIP; `report.txt` may be a
 * PostScript file. So content is authoritative here, and the client's claim is
 * only used to disambiguate cases the bytes genuinely cannot settle — plain
 * text versus CSV, which differ by convention rather than by format.
 *
 * A disagreement between claim and content is reported rather than silently
 * resolved, because "this .txt is actually a ZIP" is a useful attack signal
 * even when we go on to reject the file for other reasons.
 */
export function detectFormat(bytes: Uint8Array, probe: FormatProbe = {}): FormatDetection {
  const declared = normaliseDeclaredFormat(probe);

  if (startsWithAscii(bytes, PDF_SIGNATURE)) {
    return finish('pdf', 'signature', declared);
  }

  if (hasPrefix(bytes, ZIP_SIGNATURE)) {
    if (containsAscii(bytes, OOXML_WORD_MARKER)) {
      return finish('docx', 'signature', declared);
    }
    throw new UnsupportedFormatError(
      'This looks like a ZIP archive but not a Word document. Archives are not accepted.',
    );
  }

  // Everything remaining must be well-formed UTF-8 text. A file that is not
  // decodable is binary content wearing a text extension, and is rejected.
  const text = decodeUtf8(bytes);

  if (looksLikeJson(text)) {
    return finish('json', 'content-parse', declared);
  }

  if (declared === 'csv' || (declared === undefined && looksLikeCsv(text))) {
    return finish('csv', 'text-heuristic', declared);
  }

  return finish('txt', 'text-heuristic', declared);
}

function finish(
  format: DocumentFormat,
  evidence: FormatDetection['evidence'],
  declared: DocumentFormat | undefined,
): FormatDetection {
  return {
    format,
    evidence,
    declarationMismatch: declared !== undefined && declared !== format,
  };
}

function normaliseDeclaredFormat(probe: FormatProbe): DocumentFormat | undefined {
  const extension = probe.declaredExtension?.toLowerCase().replace(/^\./u, '');
  switch (extension) {
    case 'txt':
    case 'csv':
    case 'json':
    case 'pdf':
    case 'docx':
      return extension;
    default:
      return undefined;
  }
}

function hasPrefix(bytes: Uint8Array, prefix: readonly number[]): boolean {
  if (bytes.byteLength < prefix.length) return false;
  return prefix.every((byte, index) => bytes[index] === byte);
}

function startsWithAscii(bytes: Uint8Array, marker: string): boolean {
  if (bytes.byteLength < marker.length) return false;
  for (let index = 0; index < marker.length; index += 1) {
    if (bytes[index] !== marker.charCodeAt(index)) return false;
  }
  return true;
}

function containsAscii(bytes: Uint8Array, marker: string, limit = 64 * 1024): boolean {
  const window = bytes.subarray(0, Math.min(bytes.byteLength, limit));
  return new TextDecoder('utf-8', { fatal: false }).decode(window).includes(marker);
}

/**
 * Strict UTF-8 decode. `fatal: true` is the point: it turns "binary file with a
 * .txt extension" into a rejection instead of a string full of replacement
 * characters that would then be scanned, replaced and written back out.
 */
export function decodeUtf8(bytes: Uint8Array): string {
  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
    if (text.includes('\u0000')) {
      throw new UnsupportedFormatError('This file contains null bytes and is not text.');
    }
    return text;
  } catch (cause) {
    if (cause instanceof UnsupportedFormatError) throw cause;
    throw new UnsupportedFormatError(
      'This file is not a supported document type. Accepted: TXT, CSV, JSON, PDF, DOCX.',
      { cause },
    );
  }
}

function looksLikeJson(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

/** Two or more lines that all share the same delimiter count. Deliberately conservative. */
function looksLikeCsv(text: string): boolean {
  const lines = text
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0)
    .slice(0, 10);
  if (lines.length < 2) return false;

  const counts = lines.map((line) => line.split(',').length);
  const [first] = counts;
  return first !== undefined && first > 1 && counts.every((count) => count === first);
}
