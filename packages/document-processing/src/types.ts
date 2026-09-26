import type {
  DocumentFormat,
  ExtractedDocument,
  FormatCapabilities,
  GeneratedDocument,
  MaybePromise,
  SanitizationMode,
} from '@cloakfile/shared';

export interface ExtractionInput {
  readonly bytes: Uint8Array;
  readonly format: DocumentFormat;
}

/**
 * Turns file bytes into text plus the structure needed to rebuild the file.
 *
 * Implementations must be defensive: the input is attacker-controlled. Parse
 * failures must raise `MalformedDocumentError`, and structural red flags
 * (implausible decompression ratios, absurd object counts) must raise
 * `SuspiciousDocumentError` rather than being parsed "best effort".
 */
export interface DocumentExtractor {
  readonly format: DocumentFormat;
  readonly capabilities: FormatCapabilities;
  /**
   * False for handlers that exist only to document the intended design and to
   * fail loudly. The capabilities endpoint reports this verbatim, so the UI can
   * say "PDF is not supported yet" instead of letting a user upload and fail.
   */
  readonly implemented: boolean;
  extract(input: ExtractionInput): MaybePromise<ExtractedDocument>;
}

export interface GenerationInput {
  /** The document as extracted, for structure and locators. */
  readonly source: ExtractedDocument;
  /** The fully rewritten text, with placeholders already substituted. */
  readonly sanitizedText: string;
  /** Original bytes, for generators that rebuild in place rather than from scratch. */
  readonly originalBytes: Uint8Array;
}

/**
 * Produces a NEW document containing the sanitized content.
 *
 * "New" is the operative word. A generator must not return the original bytes
 * with an overlay drawn on top; the original characters must be absent from the
 * bytes it returns. A generator that cannot honour that must declare
 * `trueTextReplacement: false` and will be refused by the pipeline.
 */
export interface DocumentGenerator {
  readonly format: DocumentFormat;
  readonly mode: SanitizationMode;
  readonly implemented: boolean;
  generate(input: GenerationInput): MaybePromise<GeneratedDocument>;
}

/**
 * Optional hook between extraction and generation, for formats where the text
 * view and the document model diverge — mapping flat-text offsets back onto
 * DOCX runs or PDF text-showing operators, splitting a replacement that spans
 * several runs, and so on.
 *
 * Not used by the plain-text formats; defined now because PDF and DOCX will
 * need it and the seam should exist before they are written.
 */
export interface DocumentTransformer {
  readonly format: DocumentFormat;
  transform(input: GenerationInput): MaybePromise<GenerationInput>;
}

export interface FormatSupport {
  readonly format: DocumentFormat;
  readonly extract: boolean;
  readonly generate: boolean;
  readonly capabilities: FormatCapabilities | null;
}
