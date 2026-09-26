import { z } from 'zod';

import { MAX_CUSTOM_PATTERNS, MAX_CUSTOM_PATTERN_LENGTH } from '../constants.js';
import { DOCUMENT_FORMATS } from '../types/document.js';
import { PII_TYPES } from '../types/pii.js';

/**
 * The HTTP contract between `apps/api` and `apps/web`.
 *
 * Defined once, here, with Zod so that the API validates inbound payloads and
 * the web client derives its types from the same declaration. The two cannot
 * drift.
 *
 * PRIVACY INVARIANT: no schema in this file has a field for an original
 * detected value. The wire format is structurally incapable of carrying one.
 *
 * Response arrays are declared `.readonly()` so the generated types line up
 * with the immutable domain types in `../types/`, and so a handler cannot
 * mutate a response payload it was handed.
 */

export const piiTypeSchema = z.enum(PII_TYPES);
export const documentFormatSchema = z.enum(DOCUMENT_FORMATS);

export const customPatternSchema = z.object({
  /** Becomes part of the placeholder label, so keep it identifier-like. */
  name: z
    .string()
    .min(1)
    .max(32)
    .regex(/^[A-Z][A-Z0-9_]*$/u, 'Use UPPER_SNAKE_CASE, starting with a letter.'),
  pattern: z.string().min(1).max(MAX_CUSTOM_PATTERN_LENGTH),
  /** `g` and `u` are added by the engine; only case-insensitivity is user-selectable. */
  ignoreCase: z.boolean().default(false),
});

export const analyzeOptionsSchema = z.object({
  enabledTypes: z.array(piiTypeSchema).min(1).max(PII_TYPES.length),
  customPatterns: z.array(customPatternSchema).max(MAX_CUSTOM_PATTERNS).default([]),
  /**
   * ISO 3166-1 alpha-2 region used to interpret phone numbers written in
   * national format. Numbers in E.164 form are region-independent.
   */
  defaultRegion: z
    .string()
    .regex(/^[A-Z]{2}$/u)
    .optional(),
});

export const placeholderGroupSchema = z.object({
  groupId: z.string(),
  type: piiTypeSchema,
  placeholder: z.string(),
  /** Produced by `buildPreview`. Never the original value. */
  preview: z.string(),
  occurrences: z.number().int().positive(),
  confidence: z.number().min(0).max(1),
  detectors: z.array(z.string()).readonly(),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});

export const formatCapabilitiesSchema = z.object({
  trueTextReplacement: z.boolean(),
  preservesLayout: z.boolean(),
  supportsVerification: z.boolean(),
  mayContainHiddenText: z.boolean(),
  mayContainEmbeddedFiles: z.boolean(),
  supportedModes: z
    .array(z.enum(['text-replacement', 'content-removal', 'visual-redaction']))
    .readonly(),
});

export const analyzeResponseSchema = z.object({
  sessionId: z.string(),
  expiresAt: z.string(),
  document: z.object({
    format: documentFormatSchema,
    safeFileName: z.string(),
    byteLength: z.number().int().nonnegative(),
    capabilities: formatCapabilitiesSchema,
  }),
  groups: z.array(placeholderGroupSchema).readonly(),
  /**
   * Honest caveats: categories the user enabled that have no real detector
   * behind them, extraction limitations, and so on. The UI must surface these.
   */
  warnings: z.array(z.string()).readonly(),
});

export const sanitizeRequestSchema = z.object({
  /**
   * Placeholders the user chose to keep as-is during review. Everything else
   * detected during analysis is replaced.
   */
  excludedPlaceholders: z.array(z.string().max(64)).max(10_000).default([]),
});

export const verificationCheckSchema = z.object({
  id: z.enum(['residual-values', 'placeholders-present', 'output-parses', 'metadata-clean']),
  status: z.enum(['pass', 'fail', 'inconclusive']),
  summary: z.string(),
  offendingPlaceholders: z.array(z.string()).readonly(),
});

export const verificationReportSchema = z.object({
  status: z.enum(['pass', 'fail', 'inconclusive']),
  checks: z.array(verificationCheckSchema).readonly(),
  unverifiedTypes: z.array(piiTypeSchema).readonly(),
  checkedAt: z.string(),
});

export const sanitizeResponseSchema = z.object({
  sessionId: z.string(),
  verification: verificationReportSchema,
  replacedGroups: z.number().int().nonnegative(),
  replacedOccurrences: z.number().int().nonnegative(),
  download: z.object({
    fileName: z.string(),
    mediaType: z.string(),
    byteLength: z.number().int().nonnegative(),
  }),
  warnings: z.array(z.string()).readonly(),
});

export const detectorCoverageSchema = z.object({
  type: piiTypeSchema,
  label: z.string(),
  /**
   * `reference`    implemented and unit-tested, though not yet hardened.
   * `experimental` implemented but known to be imprecise.
   * `stub`         interface exists, no detection happens. Enabling it changes nothing.
   */
  maturity: z.enum(['reference', 'experimental', 'stub']),
  detectors: z.array(z.string()).readonly(),
});

export const capabilitiesResponseSchema = z.object({
  formats: z
    .array(
      z.object({
        format: documentFormatSchema,
        extract: z.boolean(),
        generate: z.boolean(),
        capabilities: formatCapabilitiesSchema.nullable(),
      }),
    )
    .readonly(),
  detection: z.array(detectorCoverageSchema).readonly(),
  limits: z.object({
    maxFileBytes: z.number().int().positive(),
    sessionTtlSeconds: z.number().int().positive(),
  }),
});

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
    requestId: z.string().optional(),
  }),
});
