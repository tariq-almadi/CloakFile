import { NotImplementedError, type ExtractedDocument, type FormatCapabilities } from '@sds/shared';

import type { DocumentExtractor, ExtractionInput } from '../../types.js';

/**
 * What a PDF handler will be able to promise once implemented.
 *
 * Written down now, before any code exists, because these flags are how the
 * pipeline decides whether it may call a document "sanitized". Note
 * `mayContainHiddenText: true` — a PDF can carry text that ordinary extraction
 * never sees, and the system needs to know that before it makes a claim.
 */
export const PDF_CAPABILITIES: FormatCapabilities = {
  trueTextReplacement: true,
  // Reconstructing a PDF loses exact positioning. The product's promise is that
  // the value is gone, not that the page looks identical.
  preservesLayout: false,
  supportsVerification: true,
  mayContainHiddenText: true,
  mayContainEmbeddedFiles: true,
  supportedModes: ['text-replacement', 'content-removal'],
};

/**
 * PDF text extraction — NOT IMPLEMENTED.
 *
 * ---------------------------------------------------------------------------
 * Why this is a stub rather than a quick first pass
 * ---------------------------------------------------------------------------
 * PDF is the highest-risk format in this product, and a half-working
 * implementation is worse than none: it would return a file the user believes
 * is safe. The channels through which a value can survive a naive
 * implementation are all real, and each needs handling:
 *
 *   - selectable text in content streams   (the only part naive tools handle)
 *   - text drawn as positioned glyph runs with custom encodings
 *   - text stored in form field values and their appearance streams
 *   - annotation contents: comments, links, popups
 *   - document metadata: /Info dictionary and the XMP packet
 *   - embedded files and file attachments
 *   - text rendered invisibly (Tr 3) beneath a scanned image — the OCR layer
 *   - raster images that contain the value as pixels, which no text pass sees
 *   - incremental-update history: prior revisions retained inside the file
 *
 * ---------------------------------------------------------------------------
 * What "do not draw a rectangle" means concretely
 * ---------------------------------------------------------------------------
 * Drawing a filled rectangle over text adds a drawing operator; it does not
 * remove the text operator underneath. Copy-paste, `pdftotext`, and any parser
 * still return the original value. This architecture treats that as
 * `visual-redaction`, which is explicitly NOT sanitization. See
 * `SanitizationMode` in @sds/shared.
 *
 * ---------------------------------------------------------------------------
 * Intended approach (Phase 2), and its honest limits
 * ---------------------------------------------------------------------------
 *   1. Parse with a maintained PDF library to obtain per-page text with glyph
 *      positions and provenance.
 *   2. Detect PII over the flattened text.
 *   3. Rebuild each page's text content from the sanitized runs, rather than
 *      patching bytes in place, so the original glyphs are not in the output.
 *   4. Strip /Info, XMP, annotations and embedded files outright
 *      (`content-removal`), since none of them need to survive.
 *   5. Re-extract from the generated PDF and fail closed unless every original
 *      value is absent. This step is mandatory, not advisory.
 *
 * Known limit that will NOT be solved in Phase 2: a value present only as
 * pixels in a scanned page is invisible to text extraction. Such a document
 * must be reported as `inconclusive`, never as sanitized. OCR is a separate
 * capability with its own risks and is deliberately out of scope here.
 *
 * ---------------------------------------------------------------------------
 * Library selection is still open
 * ---------------------------------------------------------------------------
 * See docs/decisions/0003-pdf-library-selection.md. `pdf-lib`, the obvious
 * candidate, has had no release since 2022 and should not be adopted without
 * evaluating the maintained forks first.
 */
export class PdfExtractor implements DocumentExtractor {
  readonly format = 'pdf' as const;
  readonly capabilities = PDF_CAPABILITIES;
  readonly implemented = false;

  extract(_input: ExtractionInput): ExtractedDocument {
    throw new NotImplementedError(
      'PDF extraction',
      'PDF support is planned for Phase 2. Upload TXT, CSV or JSON for now.',
    );
  }
}
