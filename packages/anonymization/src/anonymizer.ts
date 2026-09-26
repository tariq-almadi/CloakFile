import {
  buildPreview,
  type AnonymizedDetection,
  type Detection,
  type PlaceholderGroup,
} from '@sds/shared';

import { PlaceholderAllocator, bracketFormatter } from './placeholder-allocator.js';
import type { AnonymizationOptions, AnonymizationResult } from './types.js';

/**
 * Turns a set of detections into rewritten text plus a privacy-safe summary.
 *
 * One instance handles exactly one document. Allocation state is per-instance,
 * which is what scopes placeholder numbering to a single document without any
 * shared or persisted mapping.
 */
export class Anonymizer {
  readonly #allocator: PlaceholderAllocator;

  constructor(options: AnonymizationOptions = {}) {
    this.#allocator = new PlaceholderAllocator(options.formatter ?? bracketFormatter);
  }

  /**
   * Assign placeholders to detections without touching any text.
   *
   * Separated from `apply` because the pipeline needs placeholders during the
   * review step — the user chooses what to replace by placeholder — before any
   * replacement happens.
   */
  assign(detections: readonly Detection[]): readonly AnonymizedDetection[] {
    // Allocate in document order so numbering follows reading order:
    // the first person in the text becomes PERSON_001.
    return [...detections]
      .sort((a, b) => a.start - b.start)
      .map((detection) => {
        const { placeholder, groupId } = this.#allocator.allocate(
          detection.type,
          detection.value,
          detection.metadata,
        );
        return { ...detection, placeholder, groupId };
      });
  }

  dispose(): void {
    this.#allocator.dispose();
  }
}

/**
 * Rewrite `text`, substituting each detection's placeholder for its value.
 *
 * Replacement runs from the end of the document backwards so that earlier
 * offsets stay valid as the string length changes. The alternative — replacing
 * forwards and tracking a running delta — is the classic source of off-by-one
 * corruption in redaction tools, where a shifted offset cuts out the wrong
 * characters and leaves the sensitive ones in place.
 *
 * Detections are required to be non-overlapping; the detection engine
 * guarantees this via `resolveOverlaps`, and it is asserted here because a
 * violation would silently corrupt output.
 */
export function applyAnonymization(
  text: string,
  detections: readonly AnonymizedDetection[],
  options: AnonymizationOptions = {},
): AnonymizationResult {
  const excluded = new Set(options.excludedPlaceholders ?? []);
  const ordered = [...detections].sort((a, b) => a.start - b.start);

  const applied: AnonymizedDetection[] = [];
  const skipped: AnonymizedDetection[] = [];
  let previousEnd = -1;

  for (const detection of ordered) {
    if (detection.start < previousEnd) {
      throw new Error(
        'Overlapping detections reached anonymization. Resolve overlaps before applying.',
      );
    }
    previousEnd = detection.end;

    if (excluded.has(detection.placeholder)) skipped.push(detection);
    else applied.push(detection);
  }

  let result = text;
  for (let index = applied.length - 1; index >= 0; index -= 1) {
    const detection = applied[index];
    if (detection === undefined) continue;
    result = result.slice(0, detection.start) + detection.placeholder + result.slice(detection.end);
  }

  return {
    text: result,
    applied,
    skipped,
    groups: summarizeGroups(ordered),
  };
}

/**
 * Collapse occurrences into one reviewable item per distinct value.
 *
 * This is the only representation of a detection that leaves the backend, and
 * it carries no original value and no offsets — only a placeholder, a count and
 * a preview produced by the shared preview policy.
 */
export function summarizeGroups(detections: readonly AnonymizedDetection[]): PlaceholderGroup[] {
  const groups = new Map<string, PlaceholderGroup & { detectors: string[] }>();

  for (const detection of detections) {
    const existing = groups.get(detection.groupId);

    if (existing === undefined) {
      groups.set(detection.groupId, {
        groupId: detection.groupId,
        type: detection.type,
        placeholder: detection.placeholder,
        preview: buildPreview(detection.type, detection.value, detection.metadata),
        occurrences: 1,
        confidence: detection.confidence,
        detectors: [detection.detector],
        ...(detection.metadata === undefined ? {} : { metadata: detection.metadata }),
      });
      continue;
    }

    groups.set(detection.groupId, {
      ...existing,
      occurrences: existing.occurrences + 1,
      confidence: Math.max(existing.confidence, detection.confidence),
      detectors: existing.detectors.includes(detection.detector)
        ? existing.detectors
        : [...existing.detectors, detection.detector],
    });
  }

  return [...groups.values()];
}
