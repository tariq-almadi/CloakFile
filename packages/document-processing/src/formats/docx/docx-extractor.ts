import {
  NotImplementedError,
  type ExtractedDocument,
  type FormatCapabilities,
} from '@cloakfile/shared';

import { assertSafeZip, inspectZip } from '../../security/zip-guard.js';
import type { DocumentExtractor, ExtractionInput } from '../../types.js';

export const DOCX_CAPABILITIES: FormatCapabilities = {
  trueTextReplacement: true,
  // Editing the runs in-place preserves styling, unlike the PDF approach.
  preservesLayout: true,
  supportsVerification: true,
  mayContainHiddenText: true,
  mayContainEmbeddedFiles: true,
  supportedModes: ['text-replacement', 'content-removal'],
};

/**
 * DOCX text extraction — NOT IMPLEMENTED.
 *
 * ---------------------------------------------------------------------------
 * Why a stub
 * ---------------------------------------------------------------------------
 * DOCX is a ZIP of XML parts, and sensitive text lives in more of them than a
 * naive `document.xml` read suggests:
 *
 *   - word/document.xml       body paragraphs and tables
 *   - word/header*.xml        headers, which routinely carry names
 *   - word/footer*.xml        footers
 *   - word/footnotes.xml      footnotes and endnotes
 *   - word/comments.xml       reviewer comments
 *   - docProps/core.xml       author, last-modified-by
 *   - docProps/app.xml        company, manager
 *   - word/settings.xml       rsid data and, in some documents, author names
 *   - tracked changes         deleted text is retained in `w:del` runs
 *   - word/embeddings/        whole embedded documents
 *
 * A second structural problem: Word splits a single visible word across
 * multiple `w:r` runs whenever formatting or spell-check state changes. "John
 * Doe" may be four runs. So a replacement identified on the flattened text must
 * be mapped back across run boundaries — which is precisely what
 * `DocumentTransformer` exists for.
 *
 * Tracked changes and comments are the highest-risk parts, because they are
 * invisible in normal viewing yet fully extractable.
 *
 * ---------------------------------------------------------------------------
 * Security note
 * ---------------------------------------------------------------------------
 * The container is inspected before anything is parsed: an uploaded DOCX is an
 * untrusted archive and a decompression-bomb vector. The XML parser chosen in
 * Phase 2 must additionally have external entity resolution disabled (XXE) and
 * DTD processing turned off.
 */
export class DocxExtractor implements DocumentExtractor {
  readonly format = 'docx' as const;
  readonly capabilities = DOCX_CAPABILITIES;
  readonly implemented = false;

  extract({ bytes }: ExtractionInput): ExtractedDocument {
    // Runs today even though extraction does not: rejecting a malicious archive
    // is useful on its own, and it keeps this guard on the live path so it does
    // not rot while the rest of the extractor is written.
    assertSafeZip(inspectZip(bytes));

    throw new NotImplementedError(
      'DOCX extraction',
      'DOCX support is planned for Phase 2. Upload TXT, CSV or JSON for now.',
    );
  }
}
