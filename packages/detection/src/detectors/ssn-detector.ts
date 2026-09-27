import type { RawDetection } from '@cloakfile/shared';

import { isLuhnValid } from '../internal/luhn.js';
import type { DetectionInput, Detector } from '../types.js';

/** Canadian SIN: three groups of three digits (123-456-789). */
const SIN_PATTERN = /(?<![\d-])(\d{3})-(\d{3})-(\d{3})(?![\d-])/gu;
/** US-style grouping that still appears in some Canadian documents. */
const US_STYLE_PATTERN = /(?<![\d-])(\d{3})-(\d{2})-(\d{4})(?![\d-])/gu;
/** Masked serials still identify the holder through the visible digits. */
const MASKED_US_STYLE_PATTERN = /\*{3}-\*{2}-\d{4}(?![\d-])/gu;
const MASKED_SIN_PATTERN = /\*{3}-\*{3}-\d{3}(?![\d-])/gu;
/** Bare nine-digit runs only with nearby SIN / SSN wording. */
const COMPACT_PATTERN = /(?<![\d-])(\d{9})(?![\d-])/gu;
const CONTEXT_PATTERN =
  /\b(?:sin|s\.i\.n\.|ssn|s\.s\.n\.|social\s+insurance(?:\s+number)?|social\s+security(?:\s+number)?)\b/iu;
const CONTEXT_WINDOW = 40;

/**
 * Social Insurance Numbers (Canada), with US-style grouping still accepted.
 *
 * Canadian SINs use a Luhn check. US-style `###-##-####` runs keep the SSA
 * structural rules so we do not invent a checksum we do not have. The PII type
 * stays `SSN` on the wire for compatibility; placeholders render as `[SIN_…]`.
 */
export class SsnDetector implements Detector {
  readonly name = 'sin-ca';
  readonly types = ['SSN'] as const;
  readonly maturity = 'reference' as const;

  detect({ text }: DetectionInput): readonly RawDetection[] {
    const detections: RawDetection[] = [];
    const claimed = new Set<string>();

    const push = (detection: RawDetection): void => {
      const key = `${String(detection.start)}:${String(detection.end)}`;
      if (claimed.has(key)) return;
      claimed.add(key);
      detections.push(detection);
    };

    for (const match of text.matchAll(SIN_PATTERN)) {
      const digits = `${match[1] ?? ''}${match[2] ?? ''}${match[3] ?? ''}`;
      if (!isCanadianSin(digits)) continue;
      push({
        type: 'SSN',
        start: match.index,
        end: match.index + match[0].length,
        value: match[0],
        confidence: 0.95,
        detector: this.name,
      });
    }

    for (const match of text.matchAll(US_STYLE_PATTERN)) {
      if (!isUsStyleStructurallyValid(match[1], match[2], match[3])) continue;
      push({
        type: 'SSN',
        start: match.index,
        end: match.index + match[0].length,
        value: match[0],
        confidence: 0.9,
        detector: this.name,
      });
    }

    for (const match of text.matchAll(MASKED_SIN_PATTERN)) {
      push({
        type: 'SSN',
        start: match.index,
        end: match.index + match[0].length,
        value: match[0],
        confidence: 0.85,
        detector: this.name,
      });
    }

    for (const match of text.matchAll(MASKED_US_STYLE_PATTERN)) {
      push({
        type: 'SSN',
        start: match.index,
        end: match.index + match[0].length,
        value: match[0],
        confidence: 0.85,
        detector: this.name,
      });
    }

    for (const match of text.matchAll(COMPACT_PATTERN)) {
      const digits = match[1] ?? '';
      if (!hasNearbyContext(text, match.index)) continue;
      const confidence = isCanadianSin(digits)
        ? 0.8
        : isUsStyleStructurallyValid(digits.slice(0, 3), digits.slice(3, 5), digits.slice(5, 9))
          ? 0.7
          : 0;
      if (confidence === 0) continue;
      push({
        type: 'SSN',
        start: match.index,
        end: match.index + match[0].length,
        value: match[0],
        confidence,
        detector: this.name,
      });
    }

    return detections;
  }
}

function isCanadianSin(digits: string): boolean {
  if (!/^\d{9}$/u.test(digits)) return false;
  // Reject all zeros; temporary SINs may start with 9 and still Luhn-check.
  if (digits === '000000000') return false;
  return isLuhnValid(digits, 9, 9);
}

function isUsStyleStructurallyValid(
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
