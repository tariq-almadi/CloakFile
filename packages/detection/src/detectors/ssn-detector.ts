import type { RawDetection } from '@cloakfile/shared';

import type { DetectionInput, Detector } from '../types.js';

const SSN_PATTERN = /(?<![\d-])(\d{3})-(\d{2})-(\d{4})(?![\d-])/gu;
/** Unseparated nine-digit runs are only treated as an SSN with nearby context. */
const COMPACT_SSN_PATTERN = /(?<![\d-])(\d{3})(\d{2})(\d{4})(?![\d-])/gu;
const CONTEXT_PATTERN = /\b(?:ssn|social\s+security(?:\s+number)?|s\.s\.n\.)\b/iu;
const CONTEXT_WINDOW = 40;

/**
 * US Social Security numbers, validated against the SSA's structural rules.
 *
 * The rules are worth applying because they remove a large share of the
 * nine-digit numbers that are not SSNs:
 *   - area (first 3) is never 000, 666, or 900-999
 *   - group (middle 2) is never 00
 *   - serial (last 4) is never 0000
 *
 * This detector is US-specific by design. Other national identifiers belong in
 * their own detectors with their own checksums, registered under
 * `GOVERNMENT_ID` — see `government-id-detector.ts`.
 */
export class SsnDetector implements Detector {
  readonly name = 'ssn-us';
  readonly types = ['SSN'] as const;
  readonly maturity = 'reference' as const;

  detect({ text }: DetectionInput): readonly RawDetection[] {
    const detections: RawDetection[] = [];

    for (const match of text.matchAll(SSN_PATTERN)) {
      if (!isStructurallyValid(match[1], match[2], match[3])) continue;
      detections.push({
        type: 'SSN',
        start: match.index,
        end: match.index + match[0].length,
        value: match[0],
        confidence: 0.9,
        detector: this.name,
      });
    }

    for (const match of text.matchAll(COMPACT_SSN_PATTERN)) {
      if (!isStructurallyValid(match[1], match[2], match[3])) continue;
      if (!hasNearbyContext(text, match.index)) continue;
      detections.push({
        type: 'SSN',
        start: match.index,
        end: match.index + match[0].length,
        value: match[0],
        // Lower: nine bare digits are ambiguous even with a keyword nearby.
        confidence: 0.7,
        detector: this.name,
      });
    }

    return detections;
  }
}

function isStructurallyValid(
  area: string | undefined,
  group: string | undefined,
  serial: string | undefined,
): boolean {
  if (area === undefined || group === undefined || serial === undefined) return false;
  if (area === '000' || area === '666' || area.startsWith('9')) return false;
  if (group === '00') return false;
  if (serial === '0000') return false;
  return true;
}

function hasNearbyContext(text: string, index: number): boolean {
  const from = Math.max(0, index - CONTEXT_WINDOW);
  return CONTEXT_PATTERN.test(text.slice(from, index));
}
