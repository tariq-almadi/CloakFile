import {
  NotImplementedError,
  type GeneratedDocument,
  type SanitizationMode,
} from '@cloakfile/shared';

import type { DocumentGenerator, GenerationInput } from '../../types.js';

/**
 * PDF reconstruction — NOT IMPLEMENTED.
 *
 * `mode` is declared as `text-replacement` and must stay that way. If an
 * implementation cannot rebuild the content stream and falls back to covering
 * the text, it must not quietly change this to `visual-redaction`; the pipeline
 * would then be releasing files it describes as sanitized when they are not.
 * Such a fallback needs a product decision, not a code change.
 *
 * See `pdf-extractor.ts` for the full risk inventory.
 */
export class PdfGenerator implements DocumentGenerator {
  readonly format = 'pdf' as const;
  readonly mode: SanitizationMode = 'text-replacement';
  readonly implemented = false;

  generate(_input: GenerationInput): GeneratedDocument {
    throw new NotImplementedError(
      'PDF generation',
      'Rebuilding a PDF from sanitized text is planned for Phase 2.',
    );
  }
}
