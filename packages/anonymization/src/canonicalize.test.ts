import { describe, expect, it } from 'vitest';

import { placeholderLabel } from './canonicalize.js';
import { Anonymizer, applyAnonymization } from './anonymizer.js';
import type { Detection } from '@cloakfile/shared';

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

describe('placeholderLabel', () => {
  it('renders SSN detections as SIN placeholders', () => {
    const text = 'SIN 123-45-6789';
    const assigned = new Anonymizer().assign([detection('a', 'SSN', 4, '123-45-6789')]);
    const { text: rewritten, groups } = applyAnonymization(text, assigned);

    expect(placeholderLabel('SSN')).toBe('SIN');
    expect(rewritten).toBe('SIN [SIN_001]');
    expect(groups[0]?.placeholder).toBe('[SIN_001]');
  });
});
