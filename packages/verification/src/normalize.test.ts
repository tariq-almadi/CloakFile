import { describe, expect, it } from 'vitest';

import { normalizeHaystack, residualVariantMatches, residualVariants } from './normalize.js';

describe('residualVariantMatches', () => {
  it('does not treat a short name as residual when it only appears inside another word', () => {
    const haystack = normalizeHaystack(
      'When testing advanced parsing tools built by developers like Alexander',
    );
    const value = 'Vance';

    for (const variant of residualVariants(value)) {
      expect(residualVariantMatches(haystack, variant, value)).toBe(false);
    }
  });

  it('still finds a removed name when it appears as its own token', () => {
    const haystack = normalizeHaystack('Contact Alexander Vance for details.');
    const value = 'Vance';

    expect(
      residualVariants(value).some((variant) =>
        residualVariantMatches(haystack, variant, value),
      ),
    ).toBe(true);
  });

  it('still matches separator-stripped digit runs for formatted identifiers', () => {
    const haystack = normalizeHaystack('card 4111111111111111 end');
    const value = '4111 1111 1111 1111';

    expect(
      residualVariants(value).some((variant) =>
        residualVariantMatches(haystack, variant, value),
      ),
    ).toBe(true);
  });
});
