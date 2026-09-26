import type { CustomPattern, RawDetection } from '@sds/shared';

import { compileSafePattern } from '../internal/regex-guard.js';
import type { DetectionInput, Detector } from '../types.js';

interface CompiledPattern {
  readonly name: string;
  readonly pattern: RegExp;
}

/**
 * User-supplied patterns, for the organisation-specific identifiers no
 * general-purpose detector can know about (employee numbers, case references,
 * internal ticket formats).
 *
 * Every pattern goes through `compileSafePattern`, because a regex typed by a
 * user is the most direct path to a ReDoS in this system.
 *
 * Matches are reported as `CUSTOM` and previewed as type-only: we cannot know
 * whether a custom pattern targets something harmless or an API key, so it is
 * treated as maximally sensitive.
 */
export class CustomRegexDetector implements Detector {
  readonly name = 'custom-regex';
  readonly types = ['CUSTOM'] as const;
  readonly maturity = 'reference' as const;

  readonly #patterns: readonly CompiledPattern[];

  constructor(patterns: readonly CustomPattern[]) {
    this.#patterns = patterns.map((pattern) => ({
      name: pattern.name,
      pattern: compileSafePattern(pattern.pattern, { ignoreCase: pattern.ignoreCase }),
    }));
  }

  detect({ text }: DetectionInput): readonly RawDetection[] {
    const detections: RawDetection[] = [];

    for (const { name, pattern } of this.#patterns) {
      pattern.lastIndex = 0;

      for (const match of text.matchAll(pattern)) {
        if (match[0].length === 0) continue;
        detections.push({
          type: 'CUSTOM',
          start: match.index,
          end: match.index + match[0].length,
          value: match[0],
          // The user asked for this explicitly, so trust it fully.
          confidence: 1,
          detector: this.name,
          // The pattern name becomes the placeholder label, e.g. [EMPLOYEE_ID_001].
          metadata: { patternName: name },
        });
      }
    }

    return detections;
  }
}
