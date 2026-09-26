import type { Detection, MaybePromise, PIIType, RawDetection } from '@cloakfile/shared';

/**
 * How much trust the product may place in a detector.
 *
 * This is surfaced all the way to the UI. A `stub` detector finds nothing, and
 * the user is told so explicitly rather than being allowed to believe a
 * category was handled.
 */
export type DetectorMaturity = 'reference' | 'experimental' | 'stub';

export interface DetectionInput {
  /** Flattened document text. Offsets in results are relative to this string. */
  readonly text: string;
  /**
   * ISO 3166-1 alpha-2 region used to interpret nationally-formatted values
   * (chiefly phone numbers). Absent means "only accept unambiguous formats".
   */
  readonly defaultRegion?: string;
}

/**
 * A single, self-contained source of PII matches.
 *
 * Deliberately narrow: a detector receives text and returns spans. It has no
 * access to the file, the network, the session, or the placeholder map. That
 * keeps detectors trivially unit-testable and impossible to misuse as an
 * exfiltration path.
 *
 * NOTE ON THE INTERFACE SHAPE: `types` is a list rather than the single `type`
 * originally sketched, because some detectors legitimately emit more than one
 * category from one pass (a single NLP parse yields both people and
 * organizations). Each returned `RawDetection` still carries exactly one type.
 */
export interface Detector {
  /** Stable, unique identifier. Appears in results and in the capabilities API. */
  readonly name: string;
  readonly types: readonly PIIType[];
  readonly maturity: DetectorMaturity;
  /**
   * Must be pure with respect to `input`: no I/O, no shared mutable state.
   * Returned spans may overlap each other and spans from other detectors; the
   * engine resolves conflicts.
   */
  detect(input: DetectionInput): MaybePromise<readonly RawDetection[]>;
}

export interface DetectionEngineOptions extends DetectionInput {
  /** Only detectors that cover at least one of these types are run. */
  readonly enabledTypes: readonly PIIType[];
}

export interface DetectionEngineResult {
  readonly detections: readonly Detection[];
  /**
   * Non-sensitive notes for the user, most importantly: "you enabled ADDRESS
   * but no address detector is implemented".
   */
  readonly warnings: readonly string[];
  readonly detectorsRun: readonly string[];
}
