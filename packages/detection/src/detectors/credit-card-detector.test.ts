import { describe, expect, it } from 'vitest';

import { CreditCardDetector } from './credit-card-detector.js';

const detector = new CreditCardDetector();

function detect(text: string) {
  return detector.detect({ text });
}

describe('CreditCardDetector', () => {
  it('finds a card written with spaces and reports offsets that slice back', () => {
    const text = 'Card: 4111 1111 1111 1111 on file.';
    const [detection] = detect(text);

    expect(detection).toBeDefined();
    expect(text.slice(detection?.start ?? 0, detection?.end ?? 0)).toBe('4111 1111 1111 1111');
    expect(detection?.metadata?.['cardBrand']).toBe('Visa');
  });

  it.each([
    ['4111-1111-1111-1111', 'hyphen separated'],
    ['4111111111111111', 'unseparated'],
    ['378282246310005', 'Amex, 15 digits'],
  ])('normalises separators before validating: %s (%s)', (value) => {
    expect(detect(`Payment ${value} received`)).toHaveLength(1);
  });

  it('does not flag an arbitrary long number that fails Luhn', () => {
    // An order number, not a card.
    expect(detect('Order 1234567890123456 shipped')).toHaveLength(0);
  });

  it('does not flag sequential or repeated digits that pass Luhn by accident', () => {
    expect(detect('Reference 0000000000000000')).toHaveLength(0);
  });

  it('carries only non-sensitive metadata', () => {
    const [detection] = detect('4111 1111 1111 1111');
    const metadata = JSON.stringify(detection?.metadata ?? {});

    expect(metadata).toContain('1111');
    expect(metadata).not.toContain('4111');
  });

  it('scores an unrecognised network lower rather than discarding it', () => {
    // Luhn-valid, 16 digits, but no issuer prefix matches.
    const [detection] = detect('Number 9999999999999995 on file');

    expect(detection).toBeDefined();
    expect(detection?.confidence).toBeLessThan(0.9);
    expect(detection?.metadata?.['cardBrand']).toBeUndefined();
  });
});
