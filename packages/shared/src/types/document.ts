/** File formats the architecture knows about. Not all are implemented. */
export const DOCUMENT_FORMATS = ['txt', 'csv', 'json', 'pdf', 'docx'] as const;

export type DocumentFormat = (typeof DOCUMENT_FORMATS)[number];

/**
 * How sensitive content is removed from a document. The product's core promise
 * is `text-replacement` and `content-removal`; `visual-redaction` alone is
 * explicitly NOT considered sanitization.
 *
 * - `text-replacement` the original characters are gone from the file and a
 *                      placeholder stands in their place. The file is rebuilt.
 * - `content-removal`  the original characters are gone and nothing replaces
 *                      them (used for metadata, annotations, embedded files).
 * - `visual-redaction` pixels are covered but the underlying content may still
 *                      be extractable. Never sufficient on its own.
 */
export type SanitizationMode = 'text-replacement' | 'content-removal' | 'visual-redaction';

/**
 * What a given format handler can honestly promise.
 *
 * These flags exist so the system can refuse to claim a document was sanitized
 * when the underlying format handler cannot back that claim up.
 */
export interface FormatCapabilities {
  /** Original characters are genuinely removed from the output bytes. */
  readonly trueTextReplacement: boolean;
  /** Visual layout (fonts, positioning, tables) survives the round trip. */
  readonly preservesLayout: boolean;
  /** Text can be re-extracted from generated output, enabling verification. */
  readonly supportsVerification: boolean;
  /** Format may carry text that plain extraction misses (annotations, XMP, hidden layers). */
  readonly mayContainHiddenText: boolean;
  /** Format can embed other files, which are a separate exfiltration channel. */
  readonly mayContainEmbeddedFiles: boolean;
  readonly supportedModes: readonly SanitizationMode[];
}

/** A contiguous run of text within an extracted document, with provenance. */
export interface TextSegment {
  /** Offset of this segment's first character within `ExtractedDocument.text`. */
  readonly start: number;
  readonly end: number;
  /**
   * Where this text came from, in format-specific terms: a PDF page index, a
   * DOCX run id, a CSV `row:column`, a JSON pointer. Generators use this to put
   * replaced text back in the right place when rebuilding the document.
   */
  readonly locator: string;
  /** Segments outside the main body get flagged so verification can be stricter. */
  readonly region: TextRegion;
}

export type TextRegion =
  'body' | 'header' | 'footer' | 'footnote' | 'table' | 'metadata' | 'annotation' | 'embedded';

/** Non-sensitive description of the uploaded file. */
export interface DocumentSource {
  /** Server-generated identifier. Never the user-supplied filename. */
  readonly id: string;
  /** Sanitized, display-only filename. Never used to build a filesystem path. */
  readonly safeFileName: string;
  readonly format: DocumentFormat;
  readonly byteLength: number;
}

/**
 * The output of extraction: a flat text view for detection, plus the structural
 * information a generator needs to rebuild the file.
 */
export interface ExtractedDocument {
  readonly format: DocumentFormat;
  /** Flattened text. All detection offsets are relative to this string. */
  readonly text: string;
  readonly segments: readonly TextSegment[];
  readonly capabilities: FormatCapabilities;
  /**
   * Extraction concerns the caller should know about, e.g. "this PDF has 3
   * pages with no extractable text". Free-form but never contains document text.
   */
  readonly warnings: readonly string[];
}

export interface GeneratedDocument {
  readonly format: DocumentFormat;
  readonly bytes: Uint8Array;
  readonly mediaType: string;
  readonly mode: SanitizationMode;
  readonly warnings: readonly string[];
}
