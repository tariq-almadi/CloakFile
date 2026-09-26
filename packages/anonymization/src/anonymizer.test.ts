import type { Detection } from '@sds/shared';
import { describe, expect, it } from 'vitest';

import { Anonymizer, applyAnonymization } from './anonymizer.js';

function detection(id: string, type: Detection['type'], start: number, value: string): Detection {
  return {
    id,
    type,
    start,
    end: start + value.length,
    value,
    confidence: 0.9,
    detector: 'test',
  };
}

describe('Anonymizer', () => {
  it('gives every occurrence of one value the same placeholder', () => {
    const text = 'John Doe met John Doe, then John Doe left.';
    const detections = [
      detection('a', 'PERSON', 0, 'John Doe'),
      detection('b', 'PERSON', 13, 'John Doe'),
      detection('c', 'PERSON', 28, 'John Doe'),
    ];

    const assigned = new Anonymizer().assign(detections);
    const placeholders = new Set(assigned.map((item) => item.placeholder));

    expect(placeholders).toEqual(new Set(['[PERSON_001]']));
    expect(applyAnonymization(text, assigned).text).toBe(
      '[PERSON_001] met [PERSON_001], then [PERSON_001] left.',
    );
  });

  it('gives different values different placeholders, numbered in reading order', () => {
    const text = 'John Doe and Jane Smith';
    const assigned = new Anonymizer().assign([
      detection('b', 'PERSON', 13, 'Jane Smith'),
      detection('a', 'PERSON', 0, 'John Doe'),
    ]);

    expect(applyAnonymization(text, assigned).text).toBe('[PERSON_001] and [PERSON_002]');
  });

  it('merges values that differ only by formatting', () => {
    const assigned = new Anonymizer().assign([
      detection('a', 'EMAIL', 0, 'John.Doe@Example.com'),
      detection('b', 'EMAIL', 25, 'john.doe@example.com'),
    ]);

    expect(new Set(assigned.map((item) => item.placeholder)).size).toBe(1);
  });

  it('keeps numbering separate per category', () => {
    const assigned = new Anonymizer().assign([
      detection('a', 'PERSON', 0, 'John Doe'),
      detection('b', 'EMAIL', 20, 'john@example.com'),
    ]);

    expect(assigned.map((item) => item.placeholder)).toEqual(['[PERSON_001]', '[EMAIL_001]']);
  });

  it('replaces from the end so offsets stay valid as lengths change', () => {
    // The placeholder is much longer than the value it replaces, so a
    // forward-walking implementation would corrupt every later span.
    const text = 'a@b.co and c@d.co and e@f.co';
    const assigned = new Anonymizer().assign([
      detection('a', 'EMAIL', 0, 'a@b.co'),
      detection('b', 'EMAIL', 11, 'c@d.co'),
      detection('c', 'EMAIL', 22, 'e@f.co'),
    ]);

    expect(applyAnonymization(text, assigned).text).toBe(
      '[EMAIL_001] and [EMAIL_002] and [EMAIL_003]',
    );
  });

  it('leaves excluded placeholders untouched', () => {
    const text = 'John Doe and Jane Smith';
    const assigned = new Anonymizer().assign([
      detection('a', 'PERSON', 0, 'John Doe'),
      detection('b', 'PERSON', 13, 'Jane Smith'),
    ]);

    const result = applyAnonymization(text, assigned, {
      excludedPlaceholders: ['[PERSON_002]'],
    });

    expect(result.text).toBe('[PERSON_001] and Jane Smith');
    expect(result.skipped).toHaveLength(1);
  });

  it('refuses to apply overlapping detections rather than corrupting the text', () => {
    const assigned = new Anonymizer().assign([
      detection('a', 'PERSON', 0, 'John Doe'),
      detection('b', 'PERSON', 5, 'Doe met'),
    ]);

    expect(() => applyAnonymization('John Doe met', assigned)).toThrow(/Overlapping detections/u);
  });

  it('handles unicode values without splitting characters', () => {
    const text = 'Contact Zoë Müller today';
    const assigned = new Anonymizer().assign([detection('a', 'PERSON', 8, 'Zoë Müller')]);

    expect(applyAnonymization(text, assigned).text).toBe('Contact [PERSON_001] today');
  });

  it('summarises groups without leaking the original value', () => {
    const assigned = new Anonymizer().assign([
      detection('a', 'CREDIT_CARD', 0, '4111111111111111'),
    ]);
    const { groups } = applyAnonymization('4111111111111111', assigned);

    expect(JSON.stringify(groups)).not.toContain('4111111111111111');
  });
});
