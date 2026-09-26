import type { PIIType, RawDetection } from '@cloakfile/shared';

import type { Detector } from '../types.js';

/**
 * A registered placeholder for a category we have designed for but not yet
 * built.
 *
 * Why register something that finds nothing, instead of simply leaving the
 * category out?
 *
 *   - The capabilities endpoint can report the category as `stub`, so the UI
 *     shows the checkbox with an explicit "not implemented" note rather than
 *     hiding it and letting the user assume it is covered.
 *   - The detection engine emits a warning when the user enables it, so a
 *     document is never quietly returned as "sanitized" for a category that was
 *     never inspected.
 *   - It gives the developer picking up the work a named file and a green test
 *     harness to start from.
 *
 * Returning `[]` rather than throwing is deliberate: an unimplemented *category*
 * should degrade loudly-but-gracefully, whereas an unimplemented *document
 * format* must hard fail, because there the output file itself would be wrong.
 */
export class StubDetector implements Detector {
  readonly name: string;
  readonly types: readonly PIIType[];
  readonly maturity = 'stub' as const;
  /** Why it is not implemented, for docs and for the developer who takes it on. */
  readonly rationale: string;

  constructor(name: string, types: readonly PIIType[], rationale: string) {
    this.name = name;
    this.types = types;
    this.rationale = rationale;
  }

  detect(): readonly RawDetection[] {
    return [];
  }
}

export const addressDetector = new StubDetector(
  'address',
  ['ADDRESS'],
  'Needs locale-aware parsing plus a street/city gazetteer; a regex approach produces ' +
    'unacceptable false-positive rates on ordinary prose.',
);

export const governmentIdDetector = new StubDetector(
  'government-id',
  ['GOVERNMENT_ID'],
  'Each jurisdiction has its own format and checksum. Implement as a set of per-country ' +
    'validators behind one detector rather than a single pattern.',
);

export const bankAccountDetector = new StubDetector(
  'bank-account',
  ['BANK_ACCOUNT'],
  'IBAN is tractable (mod-97 checksum); domestic account and routing numbers are not, ' +
    'and need country-specific rules. Start with IBAN.',
);

export const dateOfBirthDetector = new StubDetector(
  'date-of-birth',
  ['DATE_OF_BIRTH'],
  'Requires distinguishing a birth date from any other date, which is a contextual ' +
    'problem rather than a formatting one.',
);
