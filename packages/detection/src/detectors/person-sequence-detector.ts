import type { RawDetection } from '@cloakfile/shared';

import { findLiteralOccurrences } from '../internal/text.js';
import type { DetectionInput, Detector } from '../types.js';
import { findPersonSequences } from './person-name-heuristics.js';

/**
 * Catches multi-word names that compromise splits or skips, especially in
 * tables and lines with job titles immediately after the name.
 */
export class PersonSequenceDetector implements Detector {
  readonly name = 'person-sequence';
  readonly types = ['PERSON'] as const;
  readonly maturity = 'experimental' as const;

  detect({ text }: DetectionInput): readonly RawDetection[] {
    const detections: RawDetection[] = [];
    const seen = new Set<string>();

    for (const span of findPersonSequences(text)) {
      if (seen.has(span.value)) continue;
      seen.add(span.value);

      for (const occurrence of findLiteralOccurrences(text, span.value)) {
        detections.push({
          type: 'PERSON',
          start: occurrence.start,
          end: occurrence.end,
          value: span.value,
          confidence: 0.58,
          detector: this.name,
        });
      }
    }

    return detections;
  }
}
