export { DocumentProcessorRegistry } from './registry.js';
export { createDefaultDocumentRegistry } from './default-registry.js';
export {
  detectFormat,
  decodeUtf8,
  type FormatDetection,
  type FormatProbe,
} from './detect-format.js';
export type {
  DocumentExtractor,
  DocumentGenerator,
  DocumentTransformer,
  ExtractionInput,
  FormatSupport,
  GenerationInput,
} from './types.js';

export { PlainTextExtractor } from './formats/plain-text/extractor.js';
export {
  PlainTextGenerator,
  validateCsvShape,
  validateJson,
} from './formats/plain-text/generator.js';
export { PLAIN_TEXT_CAPABILITIES } from './formats/plain-text/capabilities.js';
export { PdfExtractor, PDF_CAPABILITIES } from './formats/pdf/pdf-extractor.js';
export { PdfGenerator } from './formats/pdf/pdf-generator.js';
export { DocxExtractor, DOCX_CAPABILITIES } from './formats/docx/docx-extractor.js';
export { DocxGenerator } from './formats/docx/docx-generator.js';

export {
  inspectZip,
  assertSafeZip,
  DEFAULT_ZIP_LIMITS,
  type ZipGuardLimits,
  type ZipInspection,
} from './security/zip-guard.js';
