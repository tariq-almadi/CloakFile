import type { FormatCapabilities } from '@cloakfile/shared';

/**
 * Plain-text formats are the best case for this product: the text view IS the
 * document, so replacement is genuinely lossless and re-extraction for
 * verification is exact.
 */
export const PLAIN_TEXT_CAPABILITIES: FormatCapabilities = {
  trueTextReplacement: true,
  preservesLayout: true,
  supportsVerification: true,
  mayContainHiddenText: false,
  mayContainEmbeddedFiles: false,
  supportedModes: ['text-replacement'],
};
