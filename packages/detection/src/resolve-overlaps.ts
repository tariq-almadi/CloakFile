import { PII_TYPE_PRIORITY, type RawDetection } from '@sds/shared';

/**
 * Collapse competing claims over the same characters into a non-overlapping set.
 *
 * Different detectors routinely claim overlapping spans: a phone detector may
 * match a prefix of a credit card, an organization may sit inside an address.
 * Replacement needs disjoint spans, so exactly one claim must win.
 *
 * Ranking, in order:
 *   1. Longer span. The more complete reading of the text is almost always the
 *      correct one — a 16-digit card beats a 10-digit "phone number" inside it.
 *   2. Higher confidence. A checksum-validated match beats a guess.
 *   3. Higher type priority. Breaks ties between deterministic detectors.
 *   4. Earlier start, then detector name. Purely to make the result stable, so
 *      identical input always yields identical placeholders.
 *
 * Exact-duplicate spans of the same type (two detectors agreeing) collapse to
 * the higher-confidence one rather than being treated as a conflict.
 */
export function resolveOverlaps(detections: readonly RawDetection[]): RawDetection[] {
  const ranked = [...detections].sort(compareDetections);
  const accepted: RawDetection[] = [];

  for (const candidate of ranked) {
    if (candidate.end <= candidate.start) continue;
    if (accepted.some((existing) => overlaps(existing, candidate))) continue;
    accepted.push(candidate);
  }

  return accepted.sort((a, b) => a.start - b.start);
}

function overlaps(a: RawDetection, b: RawDetection): boolean {
  return a.start < b.end && b.start < a.end;
}

function compareDetections(a: RawDetection, b: RawDetection): number {
  const lengthDelta = b.end - b.start - (a.end - a.start);
  if (lengthDelta !== 0) return lengthDelta;

  const confidenceDelta = b.confidence - a.confidence;
  if (confidenceDelta !== 0) return confidenceDelta;

  const priorityDelta = PII_TYPE_PRIORITY[b.type] - PII_TYPE_PRIORITY[a.type];
  if (priorityDelta !== 0) return priorityDelta;

  if (a.start !== b.start) return a.start - b.start;
  return a.detector.localeCompare(b.detector);
}
