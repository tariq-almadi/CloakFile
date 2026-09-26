/**
 * Character handling for generated PDFs.
 *
 * ---------------------------------------------------------------------------
 * The problem this solves
 * ---------------------------------------------------------------------------
 * Generated output uses Helvetica, one of the Standard 14 fonts, which is
 * WinAnsi-encoded and covers 218 code points — Latin-1 plus the CP1252 extras.
 *
 * pdf-lib does **not** raise an error for a character outside that set. It was
 * tested: drawing "Жизнь" or "漢字" succeeds, and the text re-extracts from the
 * finished file as "?????" and "??". That is silent corruption of the user's
 * document, which is precisely the failure mode this project refuses to ship.
 *
 * So the substitution is performed here, deliberately and counted, and the
 * count becomes a warning the user sees.
 *
 * This is a real limitation of Phase 2: documents in Cyrillic, Greek, Hebrew,
 * Arabic, or any CJK script will lose their text. Fixing it means embedding a
 * Unicode font, which is a licensing and payload-size decision rather than a
 * technical one. It is recorded in README and docs/DEVELOPMENT.md.
 */

const SUBSTITUTE = '?';

export interface EncodedText {
  readonly text: string;
  /** How many characters could not be represented and were substituted. */
  readonly substituted: number;
}

/**
 * Rewrites text so every character can be represented by the output font.
 *
 * Whitespace is normalised first: the font has no glyph for a tab or a newline,
 * so leaving them in would have them counted as corruption rather than as
 * layout. Newlines survive because the layout engine splits on them.
 */
export function toEncodableText(text: string, charset: ReadonlySet<number>): EncodedText {
  const normalised = text
    .replace(/\r\n?/gu, '\n')
    .replace(/\t/gu, '    ')
    // Other C0/C1 controls carry no meaning here and have no glyphs.
    .replace(/[\p{Cc}\p{Cf}]/gu, (match) => (match === '\n' ? '\n' : ''));

  let substituted = 0;
  let out = '';

  for (const character of normalised) {
    const codePoint = character.codePointAt(0);
    if (character === '\n' || (codePoint !== undefined && charset.has(codePoint))) {
      out += character;
      continue;
    }
    out += SUBSTITUTE;
    substituted += 1;
  }

  return { text: out, substituted };
}
