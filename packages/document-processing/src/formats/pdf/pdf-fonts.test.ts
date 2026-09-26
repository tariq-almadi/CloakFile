import { describe, expect, it } from 'vitest';

import { toEncodableText } from './pdf-fonts.js';

/** Helvetica's WinAnsi repertoire, near enough for these assertions. */
const WIN_ANSI = new Set<number>();
for (let code = 0x20; code <= 0x7e; code += 1) WIN_ANSI.add(code);
for (let code = 0xa0; code <= 0xff; code += 1) WIN_ANSI.add(code);
WIN_ANSI.add(0x20ac); // euro
WIN_ANSI.add(0x2014); // em dash

describe('toEncodableText', () => {
  it('leaves text the font can represent alone', () => {
    const result = toEncodableText('Invoice for [PERSON_001] — 12.50 €', WIN_ANSI);

    expect(result.text).toBe('Invoice for [PERSON_001] — 12.50 €');
    expect(result.substituted).toBe(0);
  });

  it('keeps Western European accents', () => {
    const result = toEncodableText('Café naïve Öl señor', WIN_ANSI);

    expect(result.text).toBe('Café naïve Öl señor');
    expect(result.substituted).toBe(0);
  });

  /**
   * The behaviour this function exists for. pdf-lib does not raise an error for
   * a character outside the font: it writes a `?` and says nothing. Text would
   * be corrupted with no signal to the user, which is the failure mode this
   * project refuses. Counting the substitutions is what turns it into a warning.
   */
  it('substitutes characters the font cannot represent, and counts them', () => {
    const result = toEncodableText('Жизнь', WIN_ANSI);

    expect(result.text).toBe('?????');
    expect(result.substituted).toBe(5);
  });

  it('counts substitutions across mixed scripts', () => {
    const result = toEncodableText('Name: 漢字 (Smith)', WIN_ANSI);

    expect(result.substituted).toBe(2);
    expect(result.text).toBe('Name: ?? (Smith)');
  });

  it('expands tabs rather than counting them as unrepresentable', () => {
    const result = toEncodableText('a\tb', WIN_ANSI);

    expect(result.text).toBe('a    b');
    expect(result.substituted).toBe(0);
  });

  it('preserves newlines, because the layout engine splits on them', () => {
    const result = toEncodableText('one\r\ntwo\rthree\nfour', WIN_ANSI);

    expect(result.text).toBe('one\ntwo\nthree\nfour');
    expect(result.substituted).toBe(0);
  });

  it('drops other control characters instead of substituting them', () => {
    const result = toEncodableText('a\u0000b\u0007c', WIN_ANSI);

    expect(result.text).toBe('abc');
    expect(result.substituted).toBe(0);
  });

  it('counts astral characters once, not once per code unit', () => {
    const result = toEncodableText('hi 👋', WIN_ANSI);

    expect(result.substituted).toBe(1);
    expect(result.text).toBe('hi ?');
  });
});
