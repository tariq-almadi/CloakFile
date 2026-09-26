import type { RawDetection } from '@cloakfile/shared';

import type { DetectionInput, Detector } from '../types.js';

/**
 * Deliberately stricter than RFC 5322.
 *
 * A fully RFC-compliant email grammar matches things no real mail system uses
 * and is a notorious source of both false positives and catastrophic
 * backtracking. Every quantifier here is bounded, so matching is linear.
 */
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){1,8}/gu;

/** A trailing dot or hyphen is almost always sentence punctuation, not the address. */
function trimTrailingPunctuation(value: string): string {
  let end = value.length;
  while (end > 0) {
    const character = value[end - 1];
    if (character === '.' || character === '-') end -= 1;
    else break;
  }
  return value.slice(0, end);
}

export class EmailDetector implements Detector {
  readonly name = 'email';
  readonly types = ['EMAIL'] as const;
  readonly maturity = 'reference' as const;

  detect({ text }: DetectionInput): readonly RawDetection[] {
    const detections: RawDetection[] = [];
    EMAIL_PATTERN.lastIndex = 0;

    for (const match of text.matchAll(EMAIL_PATTERN)) {
      const matched = match[0];
      const start = match.index;
      const value = trimTrailingPunctuation(matched);

      // The TLD must look like a TLD, not a file extension in `report.v2.xlsx`.
      const tld = value.slice(value.lastIndexOf('.') + 1);
      if (!/^[A-Za-z]{2,24}$/u.test(tld)) continue;

      detections.push({
        type: 'EMAIL',
        start,
        end: start + value.length,
        value,
        confidence: 0.95,
        detector: this.name,
      });
    }

    return detections;
  }
}
