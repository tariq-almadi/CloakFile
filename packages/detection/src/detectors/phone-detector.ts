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

    return matches.map((match) => ({
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
  }
}

function isCountryCode(value: string | undefined): value is CountryCode {
  return value !== undefined && /^[A-Z]{2}$/u.test(value);
}
