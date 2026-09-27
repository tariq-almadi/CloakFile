import {
  FORMAT_MEDIA_TYPES,
  MalformedDocumentError,
  type GeneratedDocument,
  type SanitizationMode,
} from '@cloakfile/shared';

import type { DocumentGenerator, GenerationInput } from '../../types.js';
import { readDocxPackage, writeSanitizedDocx } from './docx-package.js';

/**
 * Rewrites the text nodes of the original DOCX and packs a new ZIP.
 *
 * Nothing is drawn on top of the old text. The characters inside each run are
 * replaced, and a run that only held the tail of a replaced name is cleared.
 * Styles, table geometry and numbering are the original parts, copied through.
 *
 * Embedded OLE parts are dropped rather than sanitized: they can be any format.
 * Author attributes are cleared because they are not part of the text layer
 * verification re-reads.
 */
export class DocxGenerator implements DocumentGenerator {
  readonly format = 'docx' as const;
  readonly mode: SanitizationMode = 'text-replacement';
  readonly implemented = true;

  generate({ source, originalBytes, replacements = [] }: GenerationInput): GeneratedDocument {
    const pack = readDocxPackage(originalBytes);
    if (pack.text !== source.text) {
      throw new MalformedDocumentError(
        'This Word document could not be rewritten without losing track of where the text sits.',
      );
    }

    return {
      format: 'docx',
      bytes: writeSanitizedDocx(pack, replacements),
      mediaType: FORMAT_MEDIA_TYPES.docx,
      mode: this.mode,
      warnings: pack.warnings.filter((warning) => warning.includes('Embedded')),
    };
  }
}
