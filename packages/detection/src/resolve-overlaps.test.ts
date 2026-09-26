import type { RawDetection } from '@cloakfile/shared';
import { describe, expect, it } from 'vitest';

import { resolveOverlaps } from './resolve-overlaps.js';

function detection(
  partial: Partial<RawDetection> & Pick<RawDetection, 'start' | 'end'>,
): RawDetection {
  return {
    type: 'PERSON',
    value: 'x'.repeat(partial.end - partial.start),
    confidence: 0.5,
    detector: 'test',
    ...partial,
  };
}

describe('resolveOverlaps', () => {
  it('keeps detections that do not overlap', () => {
    const resolved = resolveOverlaps([
      detection({ start: 0, end: 5 }),
      detection({ start: 10, end: 15 }),
    ]);

    expect(resolved).toHaveLength(2);
  });

  it('treats touching spans as non-overlapping', () => {
    const resolved = resolveOverlaps([
      detection({ start: 0, end: 5 }),
      detection({ start: 5, end: 10 }),
    ]);

    expect(resolved).toHaveLength(2);
  });

  it('prefers the longer reading of the same text', () => {
    // A phone detector claiming a slice of a credit card.
    const resolved = resolveOverlaps([
      detection({ start: 0, end: 10, type: 'PHONE', confidence: 0.95 }),
      detection({ start: 0, end: 19, type: 'CREDIT_CARD', confidence: 0.9 }),
    ]);

    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.type).toBe('CREDIT_CARD');
  });

  it('prefers higher confidence when spans are the same length', () => {
    const resolved = resolveOverlaps([
      detection({ start: 0, end: 10, type: 'PERSON', confidence: 0.6 }),
      detection({ start: 0, end: 10, type: 'ORGANIZATION', confidence: 0.9 }),
    ]);

    expect(resolved[0]?.type).toBe('ORGANIZATION');
  });

  it('falls back to type specificity when length and confidence tie', () => {
    const resolved = resolveOverlaps([
      detection({ start: 0, end: 11, type: 'PERSON', confidence: 0.8 }),
      detection({ start: 0, end: 11, type: 'SSN', confidence: 0.8 }),
    ]);

    expect(resolved[0]?.type).toBe('SSN');
  });

  it('returns results in document order', () => {
    const resolved = resolveOverlaps([
      detection({ start: 30, end: 35 }),
      detection({ start: 0, end: 5 }),
      detection({ start: 15, end: 20 }),
    ]);

    expect(resolved.map((item) => item.start)).toEqual([0, 15, 30]);
  });

  it('is deterministic for identical input', () => {
    const input = [
      detection({ start: 0, end: 10, type: 'PERSON', confidence: 0.7, detector: 'b' }),
      detection({ start: 0, end: 10, type: 'PERSON', confidence: 0.7, detector: 'a' }),
    ];

    expect(resolveOverlaps(input)).toEqual(resolveOverlaps([...input].reverse()));
  });
});
