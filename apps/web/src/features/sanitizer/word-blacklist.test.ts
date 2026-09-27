import { describe, expect, it } from 'vitest';

import {
  blacklistToCustomPatterns,
  DEFAULT_REDACTION_TAG,
  escapeRegexLiteral,
  normalizeRedactionTag,
  wordToSearchPattern,
} from './word-blacklist.js';

describe('word blacklist helpers', () => {
  it('escapes regex metacharacters in literals', () => {
    expect(escapeRegexLiteral('a+b(c)')).toBe('a\\+b\\(c\\)');
  });

  it('builds bounded patterns for words and phrases', () => {
    expect(wordToSearchPattern('secret')).toBe('\\bsecret\\b');
    expect(wordToSearchPattern('Project Nightfall')).toBe('\\bProject\\s+Nightfall\\b');
  });

  it('normalizes replacement tags to UPPER_SNAKE', () => {
    expect(normalizeRedactionTag('')).toBe(DEFAULT_REDACTION_TAG);
    expect(normalizeRedactionTag('  hidden  ')).toBe('HIDDEN');
    expect(normalizeRedactionTag('my tag')).toBe('MY_TAG');
    expect(normalizeRedactionTag('123')).toBe('TAG_123');
  });

  it('uses REDACTED (or a chosen tag) instead of the blocked word as the label', () => {
    const patterns = blacklistToCustomPatterns([
      { word: 'audit', ignoreCase: true },
      { word: 'CONFIDENTIAL', ignoreCase: false },
    ]);

    expect(patterns).toEqual([
      { name: 'REDACTED', pattern: '\\baudit\\b', ignoreCase: true },
      { name: 'REDACTED', pattern: '\\bCONFIDENTIAL\\b', ignoreCase: false },
    ]);

    expect(
      blacklistToCustomPatterns([{ word: 'audit', ignoreCase: true }], 'HIDDEN'),
    ).toEqual([{ name: 'HIDDEN', pattern: '\\baudit\\b', ignoreCase: true }]);
  });
});
