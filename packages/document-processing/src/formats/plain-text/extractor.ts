import {
  InvalidInputError,
  MAX_EXTRACTED_TEXT_LENGTH,
  type DocumentFormat,
  type ExtractedDocument,
} from '@cloakfile/shared';

import { decodeUtf8 } from '../../detect-format.js';
import type { DocumentExtractor, ExtractionInput } from '../../types.js';
import { PLAIN_TEXT_CAPABILITIES } from './capabilities.js';

/**
 * Extractor for formats whose bytes are their text: TXT, CSV and JSON.
 *
 * The text view is the whole document, so there is exactly one segment and the
 * locator is trivial. CSV and JSON reuse this because Phase 1 treats them as
 * text; structure-aware handling (per-cell for CSV, per-value for JSON) is a
 * separate step and is documented as such — see docs/ARCHITECTURE.md.
 */
export class PlainTextExtractor implements DocumentExtractor {
  readonly format: DocumentFormat;
  readonly capabilities = PLAIN_TEXT_CAPABILITIES;
  readonly implemented = true;

  constructor(format: DocumentFormat) {
    this.format = format;
  }

  extract({ bytes }: ExtractionInput): ExtractedDocument {
    const text = decodeUtf8(bytes);

    if (text.length > MAX_EXTRACTED_TEXT_LENGTH) {
      throw new InvalidInputError(
        `This document contains more than ${String(MAX_EXTRACTED_TEXT_LENGTH)} characters, which is above the processing limit.`,
      );
    }

    return {
      format: this.format,
      text,
      segments: [{ start: 0, end: text.length, locator: 'document', region: 'body' }],
      capabilities: this.capabilities,
      // For these formats the bytes are the text, so there is nothing we can
      // fail to read: either decoding succeeded or extraction already threw.
      unreadable: [],
      warnings: [],
    };
  }
}
