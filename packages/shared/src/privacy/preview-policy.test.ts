import { describe, expect, it } from 'vitest';

import { PII_TYPES } from '../types/pii.js';
import { PREVIEW_POLICY, buildPreview } from './preview-policy.js';

describe('preview policy', () => {
  it('assigns a policy to every PII type', () => {
    for (const type of PII_TYPES) {
      expect(PREVIEW_POLICY[type]).toBeDefined();
    }
  });

  it('never leaks the original value for type-only categories', () => {
    const secrets: readonly (readonly [(typeof PII_TYPES)[number], string])[] = [
      ['SSN', '123-45-6789'],
      ['GOVERNMENT_ID', 'AB1234567'],
      ['BANK_ACCOUNT', '000123456789'],
      ['DATE_OF_BIRTH', '1984-02-29'],
      ['CUSTOM', 'sk_live_abcdef123456'],
    ];

    for (const [type, value] of secrets) {
      const preview = buildPreview(type, value);
      expect(preview).not.toContain(value);
      // Not even a fragment: no run of source characters survives.
      for (const fragment of value.split(/[-_]/u)) {
        if (fragment.length >= 2) expect(preview).not.toContain(fragment);
      }
    }
  });

  it('shows a credit card as brand plus last four digits only', () => {
    const preview = buildPreview('CREDIT_CARD', '4111 1111 1111 1111', { cardBrand: 'Visa' });

    expect(preview).toBe('Visa \u2022\u2022\u2022\u2022 1111');
    expect(preview).not.toContain('4111 1111');
  });

  it('masks an email down to a recognisable hint without the domain', () => {
    expect(buildPreview('EMAIL', 'john.doe@acme-corp.example.com')).toBe(
      'j\u2022\u2022\u2022\u2022@a\u2022\u2022\u2022\u2022.e\u2022\u2022\u2022\u2022.com',
    );
  });

  it('keeps a person recognisable to the person who uploaded the document', () => {
    expect(buildPreview('PERSON', 'John Doe')).toBe('J\u2022\u2022\u2022 D\u2022\u2022');
  });

  it('never returns an empty preview', () => {
    for (const type of PII_TYPES) {
      expect(buildPreview(type, '').length).toBeGreaterThan(0);
    }
  });
});
