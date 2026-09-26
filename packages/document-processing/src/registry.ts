import {
  DOCUMENT_FORMATS,
  UnsupportedFormatError,
  type DocumentFormat,
  type ExtractedDocument,
  type GeneratedDocument,
} from '@sds/shared';

import type {
  DocumentExtractor,
  DocumentGenerator,
  DocumentTransformer,
  ExtractionInput,
  FormatSupport,
  GenerationInput,
} from './types.js';

/**
 * Maps a format to its extractor, optional transformer and generator.
 *
 * Adding a format means writing those pieces and registering them here.
 * Everything upstream — the pipeline, the API, the UI — works in terms of
 * `DocumentFormat` and never names a specific implementation.
 */
export class DocumentProcessorRegistry {
  readonly #extractors = new Map<DocumentFormat, DocumentExtractor>();
  readonly #generators = new Map<DocumentFormat, DocumentGenerator>();
  readonly #transformers = new Map<DocumentFormat, DocumentTransformer>();

  registerExtractor(extractor: DocumentExtractor): this {
    this.#extractors.set(extractor.format, extractor);
    return this;
  }

  registerGenerator(generator: DocumentGenerator): this {
    this.#generators.set(generator.format, generator);
    return this;
  }

  registerTransformer(transformer: DocumentTransformer): this {
    this.#transformers.set(transformer.format, transformer);
    return this;
  }

  async extract(input: ExtractionInput): Promise<ExtractedDocument> {
    const extractor = this.#extractors.get(input.format);
    if (extractor === undefined) {
      throw new UnsupportedFormatError(`No extractor is registered for ${input.format}.`);
    }
    return await extractor.extract(input);
  }

  async generate(format: DocumentFormat, input: GenerationInput): Promise<GeneratedDocument> {
    const generator = this.#generators.get(format);
    if (generator === undefined) {
      throw new UnsupportedFormatError(`No generator is registered for ${format}.`);
    }

    const transformer = this.#transformers.get(format);
    const prepared = transformer === undefined ? input : await transformer.transform(input);

    return await generator.generate(prepared);
  }

  /**
   * What the system supports, for the capabilities endpoint.
   *
   * A format whose handlers are stubs still appears here: the honest answer is
   * "we know about PDF and it does not work yet", not silence.
   */
  support(): readonly FormatSupport[] {
    return DOCUMENT_FORMATS.map((format) => {
      const extractor = this.#extractors.get(format);
      const generator = this.#generators.get(format);
      return {
        format,
        extract: extractor?.implemented ?? false,
        generate: generator?.implemented ?? false,
        capabilities: extractor?.capabilities ?? null,
      };
    });
  }
}
