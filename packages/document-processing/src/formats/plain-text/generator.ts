import {
  FORMAT_MEDIA_TYPES,
  MalformedDocumentError,
  type DocumentFormat,
  type GeneratedDocument,
  type SanitizationMode,
} from '@sds/shared';

import type { DocumentGenerator, GenerationInput } from '../../types.js';

/**
 * Writes the sanitized text back out as a brand-new file.
 *
 * The original bytes are not touched, copied or overlaid: the output is encoded
 * from the rewritten string alone. For these formats that is the whole of "true
 * text replacement" — there is no other place a value could hide.
 *
 * `validate` lets each format assert that rewriting did not break its syntax.
 * That matters because placeholders are inserted into text that may be inside
 * JSON strings or CSV fields, and a malformed download is a defect even if it
 * is a perfectly sanitized one.
 */
export class PlainTextGenerator implements DocumentGenerator {
  readonly format: DocumentFormat;
  readonly mode: SanitizationMode = 'text-replacement';
  readonly implemented = true;
  readonly #validate: ((text: string) => readonly string[]) | undefined;

  constructor(format: DocumentFormat, validate?: (text: string) => readonly string[]) {
    this.format = format;
    this.#validate = validate;
  }

  generate({ sanitizedText }: GenerationInput): GeneratedDocument {
    const warnings = this.#validate?.(sanitizedText) ?? [];

    return {
      format: this.format,
      bytes: new TextEncoder().encode(sanitizedText),
      mediaType: FORMAT_MEDIA_TYPES[this.format],
      mode: this.mode,
      warnings: [...warnings],
    };
  }
}

/** Placeholders contain no quote or backslash, so a valid document stays valid. */
export function validateJson(text: string): readonly string[] {
  try {
    JSON.parse(text);
    return [];
  } catch (cause) {
    throw new MalformedDocumentError(
      'Sanitizing this document produced invalid JSON, so it was not released.',
      { cause },
    );
  }
}

/**
 * Column-count check. Replacement should never change a CSV's shape; if it did,
 * a placeholder introduced a delimiter and the file would silently reinterpret.
 */
export function validateCsvShape(original: string): (text: string) => readonly string[] {
  const originalShape = csvColumnCounts(original);

  return (text: string): readonly string[] => {
    const shape = csvColumnCounts(text);
    if (
      shape.length !== originalShape.length ||
      shape.some((count, i) => count !== originalShape[i])
    ) {
      throw new MalformedDocumentError(
        'Sanitizing this document changed its CSV structure, so it was not released.',
      );
    }
    return [];
  };
}

function csvColumnCounts(text: string): number[] {
  return text
    .split(/\r?\n/u)
    .filter((line) => line.length > 0)
    .map((line) => line.split(',').length);
}
