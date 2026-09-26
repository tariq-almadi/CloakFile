import type { PIIType } from './pii.js';

/**
 * Outcome of checking a generated document against what we promised to remove.
 *
 * `inconclusive` is a first-class result, not a soft pass. It means we could
 * not re-extract the output well enough to assert anything — for example a PDF
 * whose text layer we cannot read back. The API treats it as a failure under
 * strict verification.
 */
export type VerificationStatus = 'pass' | 'fail' | 'inconclusive';

export type VerificationCheckId =
  'residual-values' | 'placeholders-present' | 'output-parses' | 'metadata-clean';

export interface VerificationCheck {
  readonly id: VerificationCheckId;
  readonly status: VerificationStatus;
  /** Human-readable, non-sensitive explanation. */
  readonly summary: string;
  /**
   * Placeholders whose original value was still found in the output.
   *
   * SECURITY: we report the placeholder, never the residual value itself, so a
   * verification report is safe to return to the client and safe to log.
   */
  readonly offendingPlaceholders: readonly string[];
}

export interface VerificationReport {
  readonly status: VerificationStatus;
  readonly checks: readonly VerificationCheck[];
  /** Types that were requested but had no residual-value coverage in this run. */
  readonly unverifiedTypes: readonly PIIType[];
  readonly checkedAt: string;
}
