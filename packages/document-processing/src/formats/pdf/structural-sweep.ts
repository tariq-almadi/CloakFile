import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFRawStream,
  PDFString,
  decodePDFRawStream,
  type PDFObject,
} from '@cantoo/pdf-lib';
import { MalformedDocumentError, PDF_MAX_SWEEP_DECODED_BYTES } from '@cloakfile/shared';

/**
 * An independent reading of a generated PDF, for verification.
 *
 * ---------------------------------------------------------------------------
 * Why this exists at all
 * ---------------------------------------------------------------------------
 * The verifier's job is to disagree with the generator when the generator is
 * wrong. If both halves reached the document through the same pdf.js text
 * extraction, a decoding blind spot in pdf.js would be invisible twice over and
 * the check would be theatre.
 *
 * So this walks the object graph with pdf-lib instead: every indirect object,
 * every string, every stream inflated and read. Different parser, different
 * decoder, same bytes.
 *
 * ---------------------------------------------------------------------------
 * Why this is not a byte search
 * ---------------------------------------------------------------------------
 * Because a byte search does not work, and that was measured. Re-saving a test
 * PDF moved an annotation body and the `/Info` author into a Flate-compressed
 * object stream. Searching the output bytes for those values reported both
 * absent; reading the file properly returned both, intact and readable by any
 * PDF viewer.
 *
 * A verifier that grepped would have certified a leaking document as clean.
 * Everything here decompresses first.
 */

export interface StructuralReport {
  /** Everything readable as text, from every object. */
  readonly decodedText: string;
  /** True when the sweep stopped early at the decompression budget. */
  readonly truncated: boolean;
  readonly channels: StructuralChannels;
}

/**
 * Channels the generator never writes to. Asserting these are empty is
 * independent evidence: a bug in text replacement cannot make an annotation
 * appear, and a bug that left one behind cannot be hidden by the generator's
 * own reporting.
 */
export interface StructuralChannels {
  readonly annotationCount: number;
  readonly hasAcroForm: boolean;
  readonly hasEmbeddedFiles: boolean;
  readonly hasXmpMetadata: boolean;
  readonly hasJavaScript: boolean;
  readonly hasOutlines: boolean;
  /**
   * `/Info` keys that describe the document rather than the tool that wrote it
   * — Title, Author, Subject, Keywords and anything unrecognised.
   *
   * Producer, Creator and the timestamps are excluded because the generator
   * sets them itself, to fixed non-identifying values. Flagging those would
   * make the check fail on correct output, and a check that always fails is a
   * check people learn to ignore.
   */
  readonly descriptiveInfoKeys: readonly string[];
  readonly objectCount: number;
}

export async function sweepPdfStructure(bytes: Uint8Array): Promise<StructuralReport> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, {
      ignoreEncryption: false,
      throwOnInvalidObject: false,
      updateMetadata: false,
    });
  } catch {
    // The cause is dropped on purpose: pdf-lib quotes offending bytes, and
    // those bytes are document content (ARCHITECTURE §10).
    throw new MalformedDocumentError('The generated PDF could not be read back for verification.');
  }

  const objects = doc.context.enumerateIndirectObjects();
  const collector = new TextCollector();

  for (const [, object] of objects) {
    collector.visit(object);
    if (collector.exhausted) break;
  }

  return {
    decodedText: collector.text,
    truncated: collector.exhausted,
    channels: inspectChannels(doc, objects.length),
  };
}

/**
 * Walks objects gathering anything that could be read as text.
 *
 * Streams are inflated, which is a decompression-bomb shape even though these
 * are bytes we just produced — so the budget is enforced regardless of
 * provenance. Trusting our own output is how the next bug gets through.
 */
class TextCollector {
  #parts: string[] = [];
  #decodedBytes = 0;
  #seen = new WeakSet<object>();

  get exhausted(): boolean {
    return this.#decodedBytes >= PDF_MAX_SWEEP_DECODED_BYTES;
  }

  get text(): string {
    return this.#parts.join('\n');
  }

  visit(object: PDFObject): void {
    if (this.exhausted) return;

    if (object instanceof PDFString || object instanceof PDFHexString) {
      this.#push(object.decodeText());
      return;
    }

    if (object instanceof PDFRawStream) {
      this.#visitStream(object);
      return;
    }

    if (object instanceof PDFDict) {
      if (this.#enter(object)) {
        for (const [key, value] of object.entries()) {
          this.#push(String(key));
          this.visit(value);
        }
      }
      return;
    }

    if (object instanceof PDFArray) {
      if (this.#enter(object)) {
        for (const value of object.asArray()) this.visit(value);
      }
      return;
    }

    if (object instanceof PDFName) {
      this.#push(String(object));
    }
  }

  #visitStream(stream: PDFRawStream): void {
    if (stream.dict instanceof PDFDict) this.visit(stream.dict);

    let decoded: Uint8Array;
    try {
      decoded = decodePDFRawStream(stream).decode();
    } catch {
      // An undecodable stream is not a pass. Recording the failure lets the
      // verifier return `inconclusive` rather than silently skipping bytes.
      this.#parts.push('[cloakfile:undecodable-stream]');
      return;
    }

    this.#decodedBytes += decoded.length;
    if (this.#decodedBytes > PDF_MAX_SWEEP_DECODED_BYTES) return;

    // Content streams are latin1-ish operators with embedded strings; object
    // and metadata streams are usually UTF-8. Both readings are searched
    // because a value can be encoded either way and we would rather over-search.
    this.#push(new TextDecoder('utf-8', { fatal: false }).decode(decoded));
    this.#push(new TextDecoder('latin1', { fatal: false }).decode(decoded));
    this.#push(decodeUtf16BigEndian(decoded));
  }

  #push(value: string): void {
    if (value !== '') this.#parts.push(value);
  }

  /** Guards against a cyclic object graph, which a hostile file can contain. */
  #enter(object: object): boolean {
    if (this.#seen.has(object)) return false;
    this.#seen.add(object);
    return true;
  }
}

/**
 * PDF text strings are frequently UTF-16BE with a byte-order mark. Searching
 * only the byte-wise readings would miss any value stored that way — which is
 * exactly how pdf-lib writes document titles.
 */
function decodeUtf16BigEndian(bytes: Uint8Array): string {
  if (bytes.length < 2) return '';
  const swapped = new Uint8Array(bytes.length - (bytes.length % 2));
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    swapped[i] = bytes[i + 1] ?? 0;
    swapped[i + 1] = bytes[i] ?? 0;
  }
  return new TextDecoder('utf-16le', { fatal: false }).decode(swapped);
}

function inspectChannels(doc: PDFDocument, objectCount: number): StructuralChannels {
  const catalog = doc.catalog;
  const names = catalog.lookupMaybe(PDFName.of('Names'), PDFDict);

  let annotationCount = 0;
  for (const page of doc.getPages()) {
    const annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
    annotationCount += annots?.size() ?? 0;
  }

  return {
    annotationCount,
    hasAcroForm: catalog.lookupMaybe(PDFName.of('AcroForm'), PDFDict) !== undefined,
    hasEmbeddedFiles: names?.lookupMaybe(PDFName.of('EmbeddedFiles'), PDFDict) !== undefined,
    hasXmpMetadata: catalog.get(PDFName.of('Metadata')) !== undefined,
    hasJavaScript:
      names?.lookupMaybe(PDFName.of('JavaScript'), PDFDict) !== undefined ||
      catalog.get(PDFName.of('OpenAction')) !== undefined,
    hasOutlines: catalog.get(PDFName.of('Outlines')) !== undefined,
    descriptiveInfoKeys: findDescriptiveInfoKeys(doc),
    objectCount,
  };
}

/** Set by the generator to fixed, non-identifying values; not a finding. */
const TOOL_INFO_KEYS = new Set(['Producer', 'Creator', 'CreationDate', 'ModDate', 'Trapped']);

function findDescriptiveInfoKeys(doc: PDFDocument): readonly string[] {
  const info = doc.context.lookupMaybe(doc.context.trailerInfo.Info, PDFDict);
  if (info === undefined) return [];

  return info
    .entries()
    .filter(([key, value]) => !TOOL_INFO_KEYS.has(infoKeyName(key)) && !isBlankValue(value))
    .map(([key]) => infoKeyName(key));
}

function infoKeyName(key: PDFName): string {
  return String(key).replace(/^\//u, '');
}

/**
 * An entry that decodes to nothing is not a finding.
 *
 * Decoding matters rather than string-rendering: pdf-lib writes an empty text
 * string as `<FEFF>`, a bare UTF-16 byte-order mark. That renders as four
 * non-empty characters and decodes to zero, and treating it as a leak makes the
 * check fail on correct output.
 */
function isBlankValue(value: PDFObject): boolean {
  if (value instanceof PDFString || value instanceof PDFHexString) {
    return value.decodeText().trim() === '';
  }
  return String(value).trim() === '';
}
