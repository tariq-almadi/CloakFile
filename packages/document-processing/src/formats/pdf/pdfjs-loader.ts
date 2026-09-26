import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import { MalformedDocumentError, SuspiciousDocumentError } from '@cloakfile/shared';

/**
 * The only place in this codebase that opens a PDF with pdf.js.
 *
 * ---------------------------------------------------------------------------
 * Why this file exists
 * ---------------------------------------------------------------------------
 * pdf.js is a large parser for a deliberately extensible format, and it has had
 * remote-code-execution bugs — CVE-2024-4367 achieved arbitrary JS execution
 * through a crafted font. Funnelling every load through one function means the
 * hardening is stated once and cannot be forgotten at a call site.
 *
 * Every option below was checked against the installed package rather than the
 * documentation, and two things were worth finding out:
 *
 *   - `isEvalSupported` no longer exists. It was a real option in v5, where it
 *     defaulted to `true`, and it is the CVE-2024-4367 surface. v6 removed the
 *     eval-based font and CMap compilation outright — the string does not
 *     appear anywhere in the shipped bundle. Passing it would be a type error
 *     and a false sense of security.
 *   - `maxImageSize` still defaults to `-1`, meaning unbounded.
 *
 * Note also what this module does *not* do: it never calls
 * `PDFPageProxy.getOperatorList()`. Building an operator list decodes embedded
 * images, which runs JBIG2 and JPEG2000 decoders over attacker-controlled
 * bytes. We only need text, so the image path is never entered; detecting
 * image-only pages is done structurally instead (`pdf-structure.ts`).
 */

const require = createRequire(import.meta.url);

function packageFile(...segments: readonly string[]): string {
  return join(dirname(require.resolve('pdfjs-dist/package.json')), ...segments) + '/';
}

/** The subset of the pdf.js surface this package uses. */
export interface LoadedPdf {
  readonly pageCount: number;
  getPageText(oneBasedIndex: number): Promise<string>;
  getAnnotationText(oneBasedIndex: number): Promise<readonly AnnotationText[]>;
  getMetadata(): Promise<PdfMetadata>;
  getAttachmentNames(): Promise<readonly string[]>;
  getOutlineCount(): Promise<number>;
  hasJavaScript(): Promise<boolean>;
  destroy(): Promise<void>;
}

export interface AnnotationText {
  readonly subtype: string;
  readonly fieldName: string | null;
  readonly text: string;
}

export interface PdfMetadata {
  /** Keys only — the values are document metadata and may themselves be sensitive. */
  readonly infoKeys: readonly string[];
  readonly hasXmp: boolean;
  readonly hasAcroForm: boolean;
  readonly hasXfa: boolean;
}

/**
 * Opens a PDF with every security-relevant option stated.
 *
 * Throws `MalformedDocumentError` when the bytes are not a readable PDF, and
 * `SuspiciousDocumentError` when they are readable but we refuse them.
 */
export async function loadPdf(bytes: Uint8Array): Promise<LoadedPdf> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const task = pdfjs.getDocument({
    // A copy, because pdf.js takes ownership of the buffer it is handed and
    // detaches it. The caller still needs the original bytes afterwards.
    data: new Uint8Array(bytes),

    // --- keep everything local; see ARCHITECTURE §11, no network in the core ---
    standardFontDataUrl: packageFile('standard_fonts'),
    cMapUrl: packageFile('cmaps'),
    wasmUrl: packageFile('wasm'),
    iccUrl: packageFile('iccs'),
    useWorkerFetch: false,
    disableAutoFetch: true,
    disableStream: true,
    disableRange: true,

    // --- attack surface we do not need for text ---
    useSystemFonts: false, // never read fonts from the host
    disableFontFace: true, // never hand a font program to a renderer
    enableXfa: false, // XFA is a second, XML-based document model
    useWasm: false, // no WASM image codecs
    isImageDecoderSupported: false,
    isOffscreenCanvasSupported: false,

    // --- resource limits ---
    maxImageSize: 16 * 1024 * 1024, // the default is -1, meaning unbounded

    // --- behaviour ---
    // Keep reading past a damaged page rather than aborting: a partial read is
    // still useful, and verification decides whether the result is acceptable.
    stopAtErrors: false,
    // pdf.js logs warnings to the console, and those warnings can quote
    // document content. Errors only (THREAT-MODEL T-06).
    verbosity: pdfjs.VerbosityLevel.ERRORS,
    password: '',
  });

  let doc: Awaited<typeof task.promise>;
  try {
    doc = await task.promise;
  } catch (error) {
    await task.destroy().catch(() => undefined);
    throw translateLoadError(error);
  }

  return {
    pageCount: doc.numPages,

    async getPageText(index) {
      const page = await doc.getPage(index);
      const content = await page.getTextContent();
      // Includes text drawn in render mode 3, so an invisible OCR layer under a
      // scan is picked up here. Verified against a hand-built fixture.
      return content.items
        .map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : '') : ''))
        .join('');
    },

    async getAnnotationText(index) {
      const page = await doc.getPage(index);
      const annotations = await page.getAnnotations();
      return annotations.flatMap(toAnnotationText);
    },

    async getMetadata() {
      const { info, metadata } = await doc.getMetadata();
      const record: Record<string, unknown> = isRecord(info) ? info : {};

      return {
        infoKeys: Object.keys(record).filter(
          (key) =>
            !DERIVED_INFO_KEYS.has(key) &&
            record[key] !== null &&
            record[key] !== '' &&
            record[key] !== undefined,
        ),
        hasXmp: metadata != null,
        hasAcroForm: record['IsAcroFormPresent'] === true,
        hasXfa: record['IsXFAPresent'] === true,
      };
    },

    async getAttachmentNames() {
      const attachments: unknown = await doc.getAttachments();
      // v6 returns a Map here; v5 returned a plain object. `Object.keys()` on a
      // Map yields an empty array without erroring, so getting this wrong looks
      // exactly like "this document has no attachments" — which is the most
      // dangerous possible way to be wrong about an exfiltration channel.
      if (attachments instanceof Map) return [...attachments.keys()].map(String);
      return isRecord(attachments) ? Object.keys(attachments) : [];
    },

    async getOutlineCount() {
      const outline: unknown = await doc.getOutline();
      return Array.isArray(outline) ? outline.length : 0;
    },

    async hasJavaScript() {
      return await doc.hasJSActions();
    },

    async destroy() {
      await task.destroy();
    },
  };
}

function translateLoadError(error: unknown): Error {
  if (error instanceof Error && error.name === 'PasswordException') {
    return new SuspiciousDocumentError(
      'This PDF is password protected. Remove the password and upload it again.',
    );
  }

  // The original message is dropped on purpose: pdf.js parse errors routinely
  // quote the bytes that failed to parse, and here those bytes are the user's
  // document (ARCHITECTURE §10).
  return new MalformedDocumentError('This PDF could not be parsed.');
}

function toAnnotationText(annotation: Record<string, unknown>): readonly AnnotationText[] {
  const text = [readString(annotation['contentsObj']), readFieldValue(annotation['fieldValue'])]
    .filter((value) => value !== '')
    .join('\n');

  if (text === '') return [];

  const fieldName = annotation['fieldName'];
  const subtype = annotation['subtype'];

  return [
    {
      subtype: typeof subtype === 'string' ? subtype : 'Unknown',
      fieldName: typeof fieldName === 'string' && fieldName !== '' ? fieldName : null,
      text,
    },
  ];
}

/**
 * `getMetadata().info` mixes real `/Info` entries with flags pdf.js computes.
 * Only the former are metadata that the output will have dropped.
 */
const DERIVED_INFO_KEYS = new Set([
  'PDFFormatVersion',
  'Language',
  'EncryptFilterName',
  'IsLinearized',
  'IsAcroFormPresent',
  'IsXFAPresent',
  'IsCollectionPresent',
  'IsSignaturesPresent',
]);

function readString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (isRecord(value) && typeof value['str'] === 'string') return value['str'];
  return '';
}

function readFieldValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string').join(', ');
  }
  return '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
