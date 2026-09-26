import type { z } from 'zod';

import type {
  analyzeOptionsSchema,
  analyzeResponseSchema,
  capabilitiesResponseSchema,
  customPatternSchema,
  detectorCoverageSchema,
  errorResponseSchema,
  formatCapabilitiesSchema,
  placeholderGroupSchema,
  sanitizeRequestSchema,
  sanitizeResponseSchema,
} from './schemas.js';

/**
 * Request types use the schema *input* (pre-defaults), response types use the
 * *output*. Mixing them up is the usual source of "optional in the client,
 * required in the server" bugs.
 */
export type CustomPatternInput = z.input<typeof customPatternSchema>;
export type CustomPattern = z.output<typeof customPatternSchema>;

export type AnalyzeOptionsInput = z.input<typeof analyzeOptionsSchema>;
export type AnalyzeOptions = z.output<typeof analyzeOptionsSchema>;

export type SanitizeRequestInput = z.input<typeof sanitizeRequestSchema>;
export type SanitizeRequest = z.output<typeof sanitizeRequestSchema>;

export type PlaceholderGroupDto = z.output<typeof placeholderGroupSchema>;
export type FormatCapabilitiesDto = z.output<typeof formatCapabilitiesSchema>;
export type AnalyzeResponse = z.output<typeof analyzeResponseSchema>;
export type SanitizeResponse = z.output<typeof sanitizeResponseSchema>;
export type DetectorCoverageDto = z.output<typeof detectorCoverageSchema>;
export type CapabilitiesResponse = z.output<typeof capabilitiesResponseSchema>;
export type ErrorResponse = z.output<typeof errorResponseSchema>;
