import type { FormatCapabilities } from '@cloakfile/shared';

/**
 * What the PDF handler promises, and — more importantly — what it does not.
 *
 * `preservesLayout: false` is the load-bearing admission. We do not edit the
 * uploaded PDF; we read it and author a new one. See
 * docs/decisions/0003 for why editing in place was rejected.
 *
 * `supportedModes` is `content-removal` only: the output is a new document
 * rather than the original with pieces taken out, and nothing that is not
 * sanitized text is carried across.
 */
export const PDF_CAPABILITIES: FormatCapabilities = {
  trueTextReplacement: true,
  preservesLayout: false,
  supportsVerification: true,
  // A PDF can carry text that page rendering never shows: annotation bodies,
  // form field values, XMP, and text drawn in render mode 3 under a scan.
  mayContainHiddenText: true,
  mayContainEmbeddedFiles: true,
  supportedModes: ['content-removal'],
};
