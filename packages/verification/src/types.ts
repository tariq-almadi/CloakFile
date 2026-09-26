import type {
  AnonymizedDetection,
  GeneratedDocument,
  MaybePromise,
  VerificationReport,
} from '@cloakfile/shared';

export interface VerificationInput {
  /** The document we are about to hand back to the user. */
  readonly generated: GeneratedDocument;
  /** Detections that were actually replaced — what we are claiming to have removed. */
  readonly applied: readonly AnonymizedDetection[];
  /**
   * Detections the user explicitly chose to keep. Their values are expected to
   * survive, so finding them is not a failure.
   */
  readonly skipped: readonly AnonymizedDetection[];
  /**
   * Locators from the *source* document that could not be read — carried
   * through from `ExtractedDocument.unreadable`.
   *
   * The verifier needs this because the evidence it works from is text. A
   * scanned page yields no text, so searching the output proves nothing about
   * it. Without this the check would pass for the most dangerous possible
   * document: one whose sensitive content was never visible to us at all.
   */
  readonly unreadable: readonly string[];
}

/**
 * Proves, or fails to prove, that a generated document no longer contains the
 * values we said we removed.
 *
 * This exists as its own interface and its own package because it is the
 * product's core safety claim. It runs on the OUTPUT bytes, not on our
 * in-memory intentions: the only trustworthy evidence that a value is gone is
 * that re-reading the file we are about to hand over does not find it.
 *
 * A verifier must never return `pass` on the strength of not having looked.
 * "Could not check" is `inconclusive`, and the pipeline treats that as a
 * refusal under strict mode.
 */
export interface SanitizationVerifier {
  verify(input: VerificationInput): MaybePromise<VerificationReport>;
}
