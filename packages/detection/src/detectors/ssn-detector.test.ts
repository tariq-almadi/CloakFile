import { describe, expect, it } from 'vitest';

import { SsnDetector } from './ssn-detector.js';

/**
 * A known Luhn-valid Canadian SIN used in CRA examples / public fixtures.
 * Not a real person's number.
 */
const VALID_SIN = '046-454-286';
const VALID_SIN_DIGITS = '046454286';

describe('SsnDetector (Canadian SIN)', () => {
  const detector = new SsnDetector();

  it('finds a Luhn-valid ###-###-### SIN', () => {
    const text = `SIN: ${VALID_SIN}`;
    const hits = detector.detect({ text });

    expect(hits).toHaveLength(1);
    expect(hits[0]?.value).toBe(VALID_SIN);
    expect(hits[0]?.type).toBe('SSN');
    expect(hits[0]?.detector).toBe('sin-ca');
  });

  it('rejects a ###-###-### number that fails Luhn', () => {
    const hits = detector.detect({ text: 'SIN 123-456-789' });
    expect(hits).toHaveLength(0);
  });

  it('still finds US-style ###-##-#### grouping', () => {
    const hits = detector.detect({ text: 'Number 123-45-6789' });
    expect(hits.some((hit) => hit.value === '123-45-6789')).toBe(true);
  });

  it('needs nearby wording for a bare nine-digit SIN', () => {
    expect(detector.detect({ text: VALID_SIN_DIGITS })).toHaveLength(0);
    expect(
      detector.detect({ text: `social insurance ${VALID_SIN_DIGITS}` })[0]?.value,
    ).toBe(VALID_SIN_DIGITS);
  });
});
