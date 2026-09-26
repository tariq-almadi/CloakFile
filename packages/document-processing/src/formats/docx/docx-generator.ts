import { NotImplementedError, type GeneratedDocument, type SanitizationMode } from '@sds/shared';

import type { DocumentGenerator, GenerationInput } from '../../types.js';

/**
 * DOCX reconstruction — NOT IMPLEMENTED.
 *
 * The intended approach rewrites the text nodes of each relevant XML part and
 * rebuilds the ZIP, rather than producing a new document from scratch: that
 * preserves styling, tables and numbering, which users expect from a Word file.
 *
 * Non-obvious requirement: parts that are not rewritten must still be cleaned.
 * `docProps/core.xml` (author, last-modified-by) and any `w:del` tracked-change
 * runs must be removed outright — `content-removal`, not replacement — because
 * there is nothing in them worth preserving and everything in them worth
 * leaking.
 */
export class DocxGenerator implements DocumentGenerator {
  readonly format = 'docx' as const;
  readonly mode: SanitizationMode = 'text-replacement';
  readonly implemented = false;

  generate(_input: GenerationInput): GeneratedDocument {
    throw new NotImplementedError(
      'DOCX generation',
      'Rebuilding a DOCX from sanitized text is planned for Phase 2.',
    );
  }
}
