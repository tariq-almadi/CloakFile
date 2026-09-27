import { describe, expect, it } from 'vitest';

import { clipPersonSurface, extendPersonSpan, findPersonSequences } from './person-name-heuristics.js';

describe('extendPersonSpan', () => {
  it('includes a particle surname after a first-name hit', () => {
    const text = 'Brigitte Von Schwenk Quality Assurance';
    const span = extendPersonSpan(text, 0, 'Brigitte'.length);
    expect(span.value).toBe('Brigitte Von Schwenk');
  });

  it('stops before a field label and a parenthetical id', () => {
    expect(clipPersonSurface('Eleanor Roosevelt-Smith  Contact Email')).toBe('Eleanor Roosevelt-Smith');
    expect(clipPersonSurface('Marcus Vance (ID')).toBe('Marcus Vance');
    const extended = extendPersonSpan('Eleanor Roosevelt-Smith  Contact Email', 0, 'Eleanor'.length);
    expect(extended.value).toBe('Eleanor Roosevelt-Smith');
  });

  it('does not swallow a possessive clitic after the surname', () => {
    const text = "John Doe's phone number is +1 514-555-0132.";
    const span = extendPersonSpan(text, 0, 'John'.length);
    expect(span.value).toBe('John Doe');
    expect(text.slice(span.start, span.end)).toBe('John Doe');
  });
});

describe('findPersonSequences', () => {
  it('finds table-style names with Ibn and job titles after them', () => {
    const text = 'Montreal, QC GB-9021\n\nTariq Ibn Ziyad Systems Architect';
    const values = findPersonSequences(text).map((span) => span.value);
    expect(values).toContain('Tariq Ibn Ziyad');
    expect(values.some((value) => value.includes('Systems'))).toBe(false);
  });

  it('does not treat table headers or department cells as people', () => {
    const text = 'Full Name\u001fAssigned Department\u001fRegional Office\u001fData Governance';
    const values = findPersonSequences(text).map((span) => span.value);
    expect(values).not.toContain('Assigned Department');
    expect(values).not.toContain('Regional Office');
    expect(values).not.toContain('Data Governance');
  });

  it('does not treat section headings as people', () => {
    const text = 'Complex Interleaved Prose & Edge Cases\n\nThe concluding segment';
    const values = findPersonSequences(text).map((span) => span.value);
    expect(values).not.toContain('Edge Cases');
    expect(values).not.toContain('Complex Interleaved Prose');
  });

  it('does not treat report headings and field labels as people', () => {
    const text =
      'Target Classifications: PII, Financial Records, Contact Vectors Evaluation Purpose. Pay Victoria Sterling today.';
    const values = findPersonSequences(text).map((span) => span.value);
    expect(values).not.toContain('Financial Records');
    expect(values).not.toContain('Contact Vectors Evaluation Purpose');
    expect(values.some((value) => value.includes('Victoria Sterling'))).toBe(true);
  });

  it('finds paired given and family names compromise skips', () => {
    const text = 'contributions from Guillermo Del Toro Jr. and Chinedu Okafor demonstrate';
    const values = findPersonSequences(text).map((span) => span.value);
    expect(values).toContain('Chinedu Okafor');
  });
});
