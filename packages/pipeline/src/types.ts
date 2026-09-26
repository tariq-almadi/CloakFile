import type {
  AnalyzeOptions,
  AnonymizedDetection,
  DocumentFormat,
  ExtractedDocument,
  GeneratedDocument,
  PlaceholderGroup,
  VerificationReport,
} from '@cloakfile/shared';

/**
 * The stages of the sanitization flow, in order.
 *
 * Named explicitly so that errors, metrics and log lines can say which stage
 * failed without anyone having to infer it from a stack trace.
 */
export const PIPELINE_STAGES = [
  'validate',
  'extract',
  'detect',
  'assign-placeholders',
  'anonymize',
  'generate',
  'verify',
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export interface AnalyzeInput {
  readonly bytes: Uint8Array;
  readonly format: DocumentFormat;
  readonly options: AnalyzeOptions;
}

/**
 * Result of the read-only half of the pipeline.
 *
 * `detections` carries original values and is BACKEND-ONLY. `groups` is the
 * privacy-safe projection that may be serialised to the client. Keeping both on
 * one object, clearly labelled, is deliberate: the alternative — two loosely
 * related objects — is how the wrong one ends up in a response body.
 */
export interface AnalysisResult {
  readonly document: ExtractedDocument;
  /** BACKEND-ONLY. Contains original sensitive values. Never serialise. */
  readonly detections: readonly AnonymizedDetection[];
  /** Safe to return to the client. */
  readonly groups: readonly PlaceholderGroup[];
  readonly warnings: readonly string[];
  readonly detectorsRun: readonly string[];
}

export interface SanitizeInput {
  readonly originalBytes: Uint8Array;
  readonly analysis: AnalysisResult;
  /** Placeholders the user chose to keep unchanged during review. */
  readonly excludedPlaceholders?: readonly string[];
}

export interface SanitizeResult {
  readonly generated: GeneratedDocument;
  readonly verification: VerificationReport;
  readonly replacedGroups: number;
  readonly replacedOccurrences: number;
  readonly warnings: readonly string[];
}
