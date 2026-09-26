import { DocxExtractor } from './formats/docx/docx-extractor.js';
import { DocxGenerator } from './formats/docx/docx-generator.js';
import { PdfExtractor } from './formats/pdf/pdf-extractor.js';
import { PdfGenerator } from './formats/pdf/pdf-generator.js';
import { PlainTextExtractor } from './formats/plain-text/extractor.js';
import {
  PlainTextGenerator,
  validateCsvShape,
  validateJson,
} from './formats/plain-text/generator.js';
import { DocumentProcessorRegistry } from './registry.js';

/**
 * Every format the system knows about, including the ones that are not built.
 *
 * Registering the unimplemented handlers is the point: an unsupported upload
 * then fails with a specific, actionable `NOT_IMPLEMENTED` error instead of a
 * generic "unsupported format", and the capabilities endpoint can describe the
 * intended behaviour of formats that do not work yet.
 *
 * `originalText` is needed by the CSV validator, which compares the output's
 * shape against the input's.
 */
export function createDefaultDocumentRegistry(originalText = ''): DocumentProcessorRegistry {
  return new DocumentProcessorRegistry()
    .registerExtractor(new PlainTextExtractor('txt'))
    .registerExtractor(new PlainTextExtractor('csv'))
    .registerExtractor(new PlainTextExtractor('json'))
    .registerExtractor(new PdfExtractor())
    .registerExtractor(new DocxExtractor())
    .registerGenerator(new PlainTextGenerator('txt'))
    .registerGenerator(new PlainTextGenerator('csv', validateCsvShape(originalText)))
    .registerGenerator(new PlainTextGenerator('json', validateJson))
    .registerGenerator(new PdfGenerator())
    .registerGenerator(new DocxGenerator());
}
