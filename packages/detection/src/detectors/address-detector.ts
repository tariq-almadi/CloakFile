import type { RawDetection } from '@cloakfile/shared';

import type { DetectionInput, Detector } from '../types.js';

/**
 * A US street address with a city, state, and ZIP. The shape is deliberately
 * narrow: number, street, optional suite, city, two-letter state, ZIP.
 */
const US_ADDRESS =
  /\b\d{1,6}\s+[A-Z][\p{L}.'-]*(?:\s+[A-Z][\p{L}.'-]*){0,5}(?:,\s*(?:Suite|Ste\.?|Apt\.?|Unit)\s+[\w-]+)?,\s*[A-Z][\p{L}.'-]*(?:\s+[A-Z][\p{L}.'-]*)*,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/gu;

export class AddressDetector implements Detector {
  readonly name = 'address';
  readonly types = ['ADDRESS'] as const;
  readonly maturity = 'experimental' as const;

  detect({ text }: DetectionInput): readonly RawDetection[] {
    const detections: RawDetection[] = [];

    for (const match of text.matchAll(US_ADDRESS)) {
      const value = match[0];
      const start = match.index;
      if (start === undefined) continue;
      detections.push({
        type: 'ADDRESS',
        start,
        end: start + value.length,
        value,
        confidence: 0.7,
        detector: this.name,
      });
    }

    return detections;
  }
}
