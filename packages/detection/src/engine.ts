import {
  MAX_EXTRACTED_TEXT_LENGTH,
  PII_TYPE_LABELS,
  InvalidInputError,
  type Detection,
  type PIIType,
  type RawDetection,
} from '@cloakfile/shared';

import type { DetectorRegistry } from './registry.js';
import { resolveOverlaps } from './resolve-overlaps.js';
import type { DetectionEngineOptions, DetectionEngineResult, Detector } from './types.js';

/**
 * Runs the selected detectors over a document and produces one coherent,
 * non-overlapping set of detections.
 *
 * The engine owns three responsibilities the detectors deliberately do not:
 * filtering to the categories the user asked for, resolving conflicting claims,
 * and assigning stable identities.
 */
export class DetectionEngine {
  readonly #registry: DetectorRegistry;

  constructor(registry: DetectorRegistry) {
    this.#registry = registry;
  }

  async run(options: DetectionEngineOptions): Promise<DetectionEngineResult> {
    const { text, enabledTypes } = options;

    if (text.length > MAX_EXTRACTED_TEXT_LENGTH) {
      throw new InvalidInputError(
        `Extracted text exceeds the ${String(MAX_EXTRACTED_TEXT_LENGTH)} character processing limit.`,
      );
    }

    const enabled = new Set<PIIType>(enabledTypes);
    const detectors = this.#registry.select(enabledTypes);
    const input =
      options.defaultRegion === undefined
        ? { text }
        : { text, defaultRegion: options.defaultRegion };

    const raw: RawDetection[] = [];
    for (const detector of detectors) {
      const produced = await detector.detect(input);
      for (const detection of produced) {
        // A detector may cover several types; keep only what the user enabled.
        if (!enabled.has(detection.type)) continue;
        if (detection.value.includes('\u001f')) continue;
        assertWellFormed(detection, detector, text);
        raw.push(detection);
      }
    }

    const resolved = resolveOverlaps(raw);

    return {
      detections: resolved.map((detection, index) => toDetection(detection, index)),
      warnings: buildCoverageWarnings(this.#registry, enabledTypes),
      detectorsRun: detectors.map((detector) => detector.name),
    };
  }
}

/**
 * Fail loudly on a malformed detector result.
 *
 * A detector returning offsets that do not match its own `value` would silently
 * corrupt the document during replacement — the wrong characters would be cut
 * out and the sensitive ones left behind. This is exactly the class of bug that
 * must never be tolerated in a sanitizer, so it throws rather than warns.
 */
function assertWellFormed(detection: RawDetection, detector: Detector, text: string): void {
  const { start, end, value } = detection;

  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > text.length) {
    throw new Error(`Detector "${detector.name}" returned out-of-range offsets.`);
  }
  if (end <= start) {
    throw new Error(`Detector "${detector.name}" returned an empty span.`);
  }
  if (text.slice(start, end) !== value) {
    throw new Error(`Detector "${detector.name}" returned offsets that do not match its value.`);
  }
  if (detection.confidence < 0 || detection.confidence > 1) {
    throw new Error(`Detector "${detector.name}" returned a confidence outside 0..1.`);
  }
}

function toDetection(detection: RawDetection, index: number): Detection {
  // Index-based rather than random: identical input must yield identical output,
  // otherwise placeholder numbering would not be reproducible across runs.
  return { ...detection, id: `d${String(index).padStart(5, '0')}` };
}

function buildCoverageWarnings(
  registry: DetectorRegistry,
  enabledTypes: readonly PIIType[],
): string[] {
  const coverage = new Map(registry.coverage().map((entry) => [entry.type, entry]));
  const warnings: string[] = [];
  let hasExperimental = false;

  for (const type of enabledTypes) {
    const entry = coverage.get(type);
    const label = PII_TYPE_LABELS[type];

    if (entry === undefined || entry.maturity === 'stub') {
      warnings.push(
        `${label}: no detector is implemented yet, so nothing in this category was found or replaced.`,
      );
    } else if (entry.maturity === 'experimental') {
      hasExperimental = true;
    }
  }

  if (hasExperimental) {
    warnings.push('Some categories can miss matches — please review the list carefully.');
  }

  return warnings;
}
