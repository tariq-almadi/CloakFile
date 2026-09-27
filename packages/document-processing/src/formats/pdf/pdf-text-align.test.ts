import { describe, expect, it } from 'vitest';

import { sanitizedBoundaries } from './pdf-text-align.js';

describe('sanitizedBoundaries', () => {
  it('gives the placeholder to the first span of a multi-word name', () => {
    const original = 'like Alexander Vance or';
    const sanitized = 'like [PERSON_001] or';
    const boundaries = sanitizedBoundaries(original, sanitized);
    const alexander = original.indexOf('Alexander');
    const vance = original.indexOf('Vance');
    const after = original.indexOf(' or');

    expect(sanitized.slice(boundaries[alexander], boundaries[vance])).toBe('[PERSON_001]');
    expect(sanitized.slice(boundaries[vance], boundaries[after])).toBe('');
  });

  it('maps consecutive placeholders without skipping ahead', () => {
    const original = 'coordinators Carmen Rodriguez and Klaus-Dieter Schmidt, who ensured';
    const sanitized = 'coordinators [PERSON_009] and [PERSON_010], who ensured';
    const carmen = original.indexOf('Carmen');
    const afterRodriguez = original.indexOf('Rodriguez') + 'Rodriguez'.length;
    const klaus = original.indexOf('Klaus');
    const afterSchmidt = original.indexOf(',');

    const boundaries = sanitizedBoundaries(original, sanitized, [
      { start: carmen, end: afterRodriguez, placeholder: '[PERSON_009]' },
      { start: klaus, end: afterSchmidt, placeholder: '[PERSON_010]' },
    ]);

    expect(sanitized.slice(boundaries[carmen], boundaries[afterRodriguez])).toBe('[PERSON_009]');
    expect(sanitized.slice(boundaries[klaus], boundaries[afterSchmidt])).toBe('[PERSON_010]');
  });

  it('gives a placeholder to the first run when the span continues into the next cell', () => {
    const original = 'Genevieve BeaumontResearch & Development';
    const sanitized = '[PERSON_018]arch & Development';
    const nameEnd = 'Genevieve Beaumont'.length;
    const boundaries = sanitizedBoundaries(original, sanitized, [
      { start: 0, end: nameEnd + 'Rese'.length, placeholder: '[PERSON_018]' },
    ]);

    expect(sanitized.slice(boundaries[0], boundaries[nameEnd])).toBe('[PERSON_018]');
    expect(sanitized.slice(boundaries[nameEnd], boundaries[original.length])).toBe('arch & Development');
  });
});
