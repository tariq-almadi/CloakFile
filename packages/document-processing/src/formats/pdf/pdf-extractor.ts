import {
  InvalidInputError,
  MAX_EXTRACTED_TEXT_LENGTH,
  PDF_EXTRACTION_TIMEOUT_MS,
  PDF_MAX_PAGES,
  SuspiciousDocumentError,
  type ExtractedDocument,
} from '@cloakfile/shared';

import type { DocumentExtractor, ExtractionInput } from '../../types.js';
import { PDF_CAPABILITIES } from './capabilities.js';
import { assertPlausiblePdf, withTimeout } from './pdf-guard.js';
import { inspectPdfStructure, type PdfStructure } from './pdf-structure.js';
import { loadPdf, type LoadedPdf } from './pdfjs-loader.js';
import { flattenBlocks, type TextBlock } from './text-blocks.js';

/**
 * PDF text extraction.
 *
 * ---------------------------------------------------------------------------
 * Which channels flow through detection, and which are simply destroyed
 * ---------------------------------------------------------------------------
 * A PDF carries text in at least six independent places, and they are not
 * equivalent. This was measured, not assumed: `getTextContent()` returns page
 * text — including invisible `3 Tr` text, so OCR layers are covered — and
 * returns none of the rest.
 *
 *   page content streams   -> extracted, sanitized, re-authored
 *   invisible / OCR text   -> extracted, sanitized, re-authored
 *   annotation bodies      -> extracted, sanitized, re-authored
 *   form field values      -> extracted, sanitized, re-authored
 *   /Info and XMP          -> NOT extracted. Destroyed by the generator
 *   embedded files         -> NOT extracted. Destroyed by the generator
 *   bookmarks, JavaScript  -> NOT extracted. Destroyed by the generator
 *
 * The split is deliberate. The first four are text a person reads, so dropping
 * them would quietly gut the document: a filled form whose field values
 * vanished is not sanitized, it is broken. The last three are containers we
 * cannot sanitize meaningfully — an attachment can be any format at all — so
 * they are removed outright and reported. That is `content-removal`, which is
 * what the capability flags promise.
 *
 * Everything extracted is flattened into one string separated by form feeds;
 * see `text-blocks.ts` for why a separator rather than offsets.
 */
export class PdfExtractor implements DocumentExtractor {
  readonly format = 'pdf' as const;
  readonly capabilities = PDF_CAPABILITIES;
  readonly implemented = true;

  async extract({ bytes }: ExtractionInput): Promise<ExtractedDocument> {
    assertPlausiblePdf(bytes);

    // Two independent readings. pdf.js knows how to turn glyphs back into
    // characters; pdf-lib answers structural questions without decoding images.
    const structure = await withTimeout(
      inspectPdfStructure(bytes),
      PDF_EXTRACTION_TIMEOUT_MS,
      'Inspecting this PDF',
    );

    const doc = await withTimeout(loadPdf(bytes), PDF_EXTRACTION_TIMEOUT_MS, 'Opening this PDF');
    try {
      return await withTimeout(
        readDocument(doc, structure),
        PDF_EXTRACTION_TIMEOUT_MS,
        'Reading text from this PDF',
      );
    } finally {
      await doc.destroy();
    }
  }
}

async function readDocument(doc: LoadedPdf, structure: PdfStructure): Promise<ExtractedDocument> {
  if (doc.pageCount > PDF_MAX_PAGES) {
    throw new SuspiciousDocumentError(
      `This PDF declares ${String(doc.pageCount)} pages, above the ${String(PDF_MAX_PAGES)}-page processing limit.`,
    );
  }
  if (doc.pageCount === 0) {
    throw new InvalidInputError('This PDF contains no pages.');
  }

  const blocks: TextBlock[] = [];
  const imageOnlyPages: number[] = [];

  for (let pageNumber = 1; pageNumber <= doc.pageCount; pageNumber += 1) {
    const pageText = await doc.getPageText(pageNumber);

    blocks.push({
      locator: `page:${String(pageNumber)}`,
      region: 'body',
      text: pageText,
    });

    if (pageText.trim() === '' && structure.pagesWithImages.has(pageNumber)) {
      imageOnlyPages.push(pageNumber);
    }

    for (const annotation of await doc.getAnnotationText(pageNumber)) {
      const isFormField = annotation.fieldName !== null;
      blocks.push({
        locator: isFormField
          ? `page:${String(pageNumber)}:field:${annotation.fieldName ?? ''}`
          : `page:${String(pageNumber)}:annotation:${annotation.subtype}`,
        region: isFormField ? 'form-field' : 'annotation',
        text: annotation.text,
      });
    }
  }

  const warnings = [...(await describeRemovedChannels(doc))];

  if (imageOnlyPages.length > 0) {
    // The honest failure. The value is in the pixels and no text pass can see
    // it. Verification turns this into `inconclusive`; it must never be
    // reported as a clean document.
    warnings.push(
      `${imageOnlyPageLabel(imageOnlyPages)} contain images but no extractable text. ` +
        'Sensitive information visible only in those images cannot be detected or removed, ' +
        'so this document cannot be verified as sanitized.',
    );
  }

  const flattened = flattenBlocks(blocks);

  if (flattened.text.length > MAX_EXTRACTED_TEXT_LENGTH) {
    throw new InvalidInputError(
      `This PDF contains more than ${String(MAX_EXTRACTED_TEXT_LENGTH)} characters of text, which is above the processing limit.`,
    );
  }

  return {
    format: 'pdf',
    text: flattened.text,
    segments: flattened.segments,
    capabilities: PDF_CAPABILITIES,
    unreadable: imageOnlyPages.map((page) => `page:${String(page)}`),
    warnings,
  };
}

function imageOnlyPageLabel(pages: readonly number[]): string {
  const listed = pages.slice(0, 10).join(', ');
  const suffix = pages.length > 10 ? ', …' : '';
  return pages.length === 1
    ? `Page ${listed} appears to be a scanned image: it and other such pages`
    : `${String(pages.length)} pages (${listed}${suffix})`;
}

/**
 * Tells the user what will be destroyed rather than sanitized.
 *
 * Counts and kinds only — never a metadata value or an attachment's contents.
 * `infoKeys` is keys-without-values for exactly that reason.
 */
async function describeRemovedChannels(doc: LoadedPdf): Promise<readonly string[]> {
  const warnings: string[] = [];
  const metadata = await doc.getMetadata();

  if (metadata.hasXfa) {
    warnings.push(
      'This PDF contains an XFA form. XFA content is not read, and it will not be present in the sanitized output.',
    );
  }

  const metadataChannels: string[] = [];
  if (metadata.infoKeys.length > 0) {
    metadataChannels.push(`document properties (${metadata.infoKeys.join(', ')})`);
  }
  if (metadata.hasXmp) metadataChannels.push('XMP metadata');

  const attachments = await doc.getAttachmentNames();
  if (attachments.length > 0) {
    warnings.push(
      `This PDF has ${String(attachments.length)} embedded file(s). They are removed, not sanitized: an attachment can be any format, and we cannot make promises about its contents.`,
    );
  }

  const outlineCount = await doc.getOutlineCount();
  if (outlineCount > 0) metadataChannels.push(`${String(outlineCount)} bookmark(s)`);

  if (await doc.hasJavaScript()) {
    warnings.push(
      'This PDF contains JavaScript actions. They are removed from the output and are never executed here.',
    );
  }

  if (metadataChannels.length > 0) {
    warnings.push(`Removed from the output: ${metadataChannels.join(', ')}.`);
  }

  return warnings;
}
