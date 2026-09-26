import { describe, expect, it } from 'vitest';

import { isLuhnValid } from './luhn.js';

describe('isLuhnValid', () => {
  it.each([
    ['4111111111111111', 'Visa test number'],
    ['5500005555555559', 'Mastercard test number'],
    ['378282246310005', 'Amex test number'],
    ['6011111111111117', 'Discover test number'],
  ])('accepts %s (%s)', (digits) => {
    expect(isLuhnValid(digits)).toBe(true);
  });

  it('rejects a number with a single transposed digit', () => {
    expect(isLuhnValid('4111111111111112')).toBe(false);
  });

  it('rejects anything outside plausible card length', () => {
    expect(isLuhnValid('411111111111')).toBe(false); // 12 digits
    expect(isLuhnValid('41111111111111111111')).toBe(false); // 20 digits
  });

  it('rejects non-digit input rather than coercing it', () => {
    expect(isLuhnValid('4111-1111-1111-1111')).toBe(false);
    expect(isLuhnValid('')).toBe(false);
  });
});
