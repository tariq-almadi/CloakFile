import type { ExtractedDocument, FormatCapabilities } from '@cloakfile/shared';

import type { DocumentExtractor, ExtractionInput } from '../../types.js';
import { readDocxPackage } from './docx-package.js';

export const DOCX_CAPABILITIES: FormatCapabilities = {
  trueTextReplacement: true,
  // Text nodes are rewritten in place. Styles, tables and numbering stay.
  preservesLayout: true,
  supportsVerification: true,
  mayContainHiddenText: true,
  mayContainEmbeddedFiles: true,
  supportedModes: ['text-replacement', 'content-removal'],
};

/**
 * DOCX text extraction.
 *
 * Word keeps text in more places than the page: headers, footers, footnotes,
 * comments, tracked deletions and document properties. Each of those is read
 * into the flat string so detection and verification can see it.
 *
 * The XML is not parsed by a general XML library. Only `w:t`, `w:delText`,
 * `w:instrText` and a fixed set of metadata elements are read, and only the
 * five predefined entities are decoded. That is what keeps an external entity
 * in a crafted DOCX from being fetched.
 */
export class DocxExtractor implements DocumentExtractor {
  readonly format = 'docx' as const;
  readonly capabilities = DOCX_CAPABILITIES;
  readonly implemented = true;

  extract({ bytes }: ExtractionInput): ExtractedDocument {
    const pack = readDocxPackage(bytes);

    return {
      format: 'docx',
      text: pack.text,
      segments: pack.segments,
      capabilities: DOCX_CAPABILITIES,
      unreadable: pack.unreadable,
      warnings: pack.warnings,
    };
  }
}
