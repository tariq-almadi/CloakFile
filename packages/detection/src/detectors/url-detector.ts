import type { RawDetection } from '@cloakfile/shared';

import type { DetectionInput, Detector } from '../types.js';

/**
 * Only explicitly schemed URLs. Bare-domain matching (`acme.com`) produces far
 * too many false positives in prose to be worth it at this stage.
 */
const URL_PATTERN = /https?:\/\/[^\s<>"'`]{1,2000}/gu;

/** Trailing punctuation belongs to the sentence, not the URL. */
const TRAILING_PUNCTUATION = new Set(['.', ',', ';', ':', '!', '?', ')', ']', '}', '>', '"', "'"]);

function trimUrl(value: string): string {
  let end = value.length;
  while (end > 0) {
    const character = value[end - 1];
    if (character !== undefined && TRAILING_PUNCTUATION.has(character)) end -= 1;
    else break;
  }
  return value.slice(0, end);
}

export class UrlDetector implements Detector {
  readonly name = 'url';
  readonly types = ['URL'] as const;
  readonly maturity = 'reference' as const;

  detect({ text }: DetectionInput): readonly RawDetection[] {
    const detections: RawDetection[] = [];

    for (const match of text.matchAll(URL_PATTERN)) {
      const value = trimUrl(match[0]);
      if (value.length === 0) continue;

      detections.push({
        type: 'URL',
        start: match.index,
        end: match.index + value.length,
        value,
        confidence: 0.9,
        detector: this.name,
      });
    }

    return detections;
  }
}
