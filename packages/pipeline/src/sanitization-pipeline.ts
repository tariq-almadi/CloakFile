import { Anonymizer, applyAnonymization, summarizeGroups } from '@cloakfile/anonymization';
import { DetectionEngine, createDefaultRegistry } from '@cloakfile/detection';
import {
  createDefaultDocumentRegistry,
  type DocumentProcessorRegistry,
} from '@cloakfile/document-processing';
import { VerificationFailedError } from '@cloakfile/shared';
import { DefaultSanitizationVerifier, type SanitizationVerifier } from '@cloakfile/verification';

import type { AnalysisResult, AnalyzeInput, SanitizeInput, SanitizeResult } from './types.js';

export interface PipelineOptions {
  /**
   * When true (the default), a document that does not verify clean is never
   * returned. Turning this off means shipping files we cannot vouch for, so it
   * exists only for local debugging.
   */
  readonly strictVerification?: boolean;
}

/**
 * The whole sanitization flow, with no knowledge of HTTP, sessions or storage.
 *
 *   UPLOAD -> VALIDATE -> EXTRACT -> DETECT -> ASSIGN PLACEHOLDERS
 *          -> [user review] -> ANONYMIZE -> GENERATE -> VERIFY -> DOWNLOAD
 *
 * Split into `analyze` and `sanitize` because a human decision sits in the
 * middle. Both halves are pure functions of their inputs, which is what makes
 * the end-to-end round-trip test possible without standing up a server.
 *
 * The original bytes are a required input to `sanitize`: the caller must still
 * hold them when generation runs. The original is only discarded after a
 * verified output exists — never before.
 */
export class SanitizationPipeline {
  readonly #strictVerification: boolean;

  constructor(options: PipelineOptions = {}) {
    this.#strictVerification = options.strictVerification ?? true;
  }

  /**
   * Read-only half: extract, detect, and assign placeholders.
   *
   * Nothing is modified and nothing is generated here, so this can be run
   * against a document the user may ultimately decide not to sanitize.
   */
  async analyze({ bytes, format, options }: AnalyzeInput): Promise<AnalysisResult> {
    const documents = createDefaultDocumentRegistry();
    const extracted = await documents.extract({ bytes, format });

    const engine = new DetectionEngine(
      createDefaultRegistry({ customPatterns: options.customPatterns }),
    );
    const detection = await engine.run({
      text: extracted.text,
      enabledTypes: options.enabledTypes,
      ...(options.defaultRegion === undefined ? {} : { defaultRegion: options.defaultRegion }),
    });

    // Placeholders are assigned during analysis, not during replacement,
    // because the review UI selects by placeholder.
    const anonymizer = new Anonymizer();
    const assigned = anonymizer.assign(detection.detections);

    return {
      document: extracted,
      detections: assigned,
      groups: summarizeGroups(assigned),
      warnings: [...extracted.warnings, ...detection.warnings],
      detectorsRun: detection.detectorsRun,
    };
  }

  /**
   * Write half: replace, rebuild, and prove the result is clean.
   *
   * Refuses to return a document whose verification did not pass. That refusal
   * is the product working correctly, not an error to be worked around — see
   * docs/ARCHITECTURE.md, "Fail closed".
   */
  async sanitize({
    originalBytes,
    analysis,
    excludedPlaceholders = [],
  }: SanitizeInput): Promise<SanitizeResult> {
    const { document } = analysis;

    const anonymization = applyAnonymization(document.text, analysis.detections, {
      excludedPlaceholders,
    });

    // The CSV generator compares output shape against the original, so the
    // registry is built per-document rather than shared.
    const documents = createDefaultDocumentRegistry(document.text);

    const generated = await documents.generate(document.format, {
      source: document,
      sanitizedText: anonymization.text,
      originalBytes,
    });

    const verifier: SanitizationVerifier = new DefaultSanitizationVerifier(
      buildVerificationRegistry(),
    );
    const verification = await verifier.verify({
      generated,
      applied: anonymization.applied,
      skipped: anonymization.skipped,
      // Carried from extraction: content we never read cannot be vouched for,
      // however clean the parts we did read turn out to be.
      unreadable: document.unreadable,
    });

    if (this.#strictVerification && verification.status !== 'pass') {
      throw new VerificationFailedError(
        'The sanitized document did not pass verification and was not released.',
        {
          details: {
            status: verification.status,
            // Placeholders only. The residual values themselves stay internal.
            offendingPlaceholders: verification.checks.flatMap(
              (check) => check.offendingPlaceholders,
            ),
          },
        },
      );
    }

    return {
      generated,
      verification,
      replacedGroups: new Set(anonymization.applied.map((d) => d.groupId)).size,
      replacedOccurrences: anonymization.applied.length,
      warnings: [...generated.warnings],
    };
  }
}

/**
 * A registry used purely to read the generated document back.
 *
 * Separate from the generating registry so that verification cannot
 * accidentally inherit state from generation — most concretely, the CSV shape
 * validator, which would otherwise compare the output against itself.
 */
function buildVerificationRegistry(): DocumentProcessorRegistry {
  return createDefaultDocumentRegistry();
}
