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
export { PdfExtractor } from './formats/pdf/pdf-extractor.js';
export { PdfGenerator } from './formats/pdf/pdf-generator.js';
export { PDF_CAPABILITIES } from './formats/pdf/capabilities.js';
export { BLOCK_SEPARATOR } from './formats/pdf/text-blocks.js';
/**
 * Exported for `@cloakfile/verification`, which needs a reading of a generated
 * PDF that does not share a code path with the one used to produce it.
 */
export {
  sweepPdfStructure,
  type StructuralChannels,
  type StructuralReport,
} from './formats/pdf/structural-sweep.js';
export { DocxExtractor, DOCX_CAPABILITIES } from './formats/docx/docx-extractor.js';
export { DocxGenerator } from './formats/docx/docx-generator.js';

export {
  inspectZip,
  assertSafeZip,
  DEFAULT_ZIP_LIMITS,
  type ZipGuardLimits,
  type ZipInspection,
} from './security/zip-guard.js';
