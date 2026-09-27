import type { RawDetection } from '@cloakfile/shared';
import { findPhoneNumbersInText, type CountryCode } from 'libphonenumber-js';

import type { DetectionInput, Detector } from '../types.js';

/**
 * Phone detection delegated to libphonenumber-js.
 *
 * International phone formatting cannot be expressed as one regex: the same
 * digits are valid in one country and not another, national prefixes differ,
 * and length rules are per-region. libphonenumber-js is the JavaScript port of
 * Google's libphonenumber metadata, which is the reference implementation for
 * this problem, and it is actively maintained.
 *
 * `findPhoneNumbersInText` returns matches with character offsets, which is
 * exactly the shape this architecture needs.
 *
 * Without a `defaultRegion`, only unambiguous international numbers (`+1 514
 * 555 0132`) are found; a national-format number is meaningless without a
 * region, so we would rather miss it than guess wrong.
 */
export class PhoneDetector implements Detector {
  readonly name = 'phone';
  readonly types = ['PHONE'] as const;
  readonly maturity = 'reference' as const;

  detect({ text, defaultRegion }: DetectionInput): readonly RawDetection[] {
    const region = isCountryCode(defaultRegion) ? defaultRegion : undefined;

    const matches =
      region === undefined ? findPhoneNumbersInText(text) : findPhoneNumbersInText(text, region);

    const detections: RawDetection[] = matches.map((match) => ({
      type: 'PHONE' as const,
      start: match.startsAt,
      end: match.endsAt,
      value: text.slice(match.startsAt, match.endsAt),
      // `isValid()` means the number matches its region's length and prefix
      // rules, not merely that it is parseable.
      confidence: match.number.isValid() ? 0.95 : 0.7,
      detector: this.name,
      metadata: { region: match.number.country ?? 'unknown' },
    }));

    // 555 exchanges and vanity toll-free numbers are real redaction targets and
    // are rejected by libphonenumber. The shape is strict: 3-3-4 or 1-800-xxx-WORD.
    for (const pattern of [FORMATTED_NANP, VANITY_TOLLFREE]) {
      for (const match of text.matchAll(pattern)) {
        const value = match[0];
        const start = match.index;
        if (start === undefined) continue;
        if (detections.some((found) => found.start < start + value.length && start < found.end)) {
          continue;
        }
        detections.push({
          type: 'PHONE',
          start,
          end: start + value.length,
          value,
          confidence: 0.8,
          detector: this.name,
        });
      }
    }

    return detections;
  }
}

const FORMATTED_NANP =
  /(?<![\d(])(?:\+?1[\s.-]*)?(?:\(\d{3}\)[\s.-]*|\d{3}[\s.-]+)\d{3}[\s.-]+\d{4}(?!\d)/gu;

const VANITY_TOLLFREE = /\b1[\s.-]?8\d{2}[\s.-]\d{3}[\s.-][A-Z]{4}\b/gu;

function isCountryCode(value: string | undefined): value is CountryCode {
  return value !== undefined && /^[A-Z]{2}$/u.test(value);
}
