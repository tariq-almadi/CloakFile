import type { AnonymizedDetection, PlaceholderGroup } from '@sds/shared';

/**
 * Renders a placeholder token.
 *
 * Pluggable because the token format is a product decision that may change
 * (bracketed, angle-bracketed, format-specific escaping) and because some
 * document formats will need tokens that survive their own escaping rules.
 */
export interface PlaceholderFormatter {
  format(label: string, index: number): string;
}

export interface AnonymizationOptions {
  readonly formatter?: PlaceholderFormatter;
  /**
   * Placeholders the user chose to keep during review. Occurrences belonging to
   * an excluded placeholder are left untouched in the output.
   */
  readonly excludedPlaceholders?: readonly string[];
}

export interface AnonymizationResult {
  /** The rewritten text. Original values no longer appear in it. */
  readonly text: string;
  /** Every detection that was actually replaced, with its assigned placeholder. */
  readonly applied: readonly AnonymizedDetection[];
  /** Detections skipped because the user excluded their placeholder. */
  readonly skipped: readonly AnonymizedDetection[];
  /** Review-facing, privacy-safe summary. Safe to return to the client. */
  readonly groups: readonly PlaceholderGroup[];
}
