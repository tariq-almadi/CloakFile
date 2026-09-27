import { describe, expect, it } from 'vitest';

import {
  blacklistToCustomPatterns,
  escapeRegexLiteral,
  labelFromWord,
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

  it('builds unique UPPER_SNAKE labels', () => {
    expect(labelFromWord('Project Nightfall', [])).toBe('PROJECT_NIGHTFALL');
    expect(labelFromWord('Project Nightfall', ['PROJECT_NIGHTFALL'])).toBe('PROJECT_NIGHTFALL_2');
    expect(labelFromWord('123 secret', [])).toBe('WORD_123_SECRET');
  });

  it('converts blacklist entries into API custom patterns', () => {
    const patterns = blacklistToCustomPatterns([
      { word: 'CONFIDENTIAL', ignoreCase: true },
      { word: 'emp-id', ignoreCase: false },
    ]);

    expect(patterns).toEqual([
      { name: 'CONFIDENTIAL', pattern: '\\bCONFIDENTIAL\\b', ignoreCase: true },
      { name: 'EMP_ID', pattern: '\\bemp-id\\b', ignoreCase: false },
    ]);
  });
});
