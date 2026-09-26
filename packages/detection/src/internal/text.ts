const REGEXP_METACHARACTERS = /[.*+?^${}()|[\]\\]/gu;

export function escapeRegExp(value: string): string {
  return value.replace(REGEXP_METACHARACTERS, '\\$&');
}

export interface LiteralOccurrence {
  readonly start: number;
  readonly end: number;
}

/**
 * Find every whole-word occurrence of a literal string.
 *
 * Used by detectors that identify *what* is sensitive but not reliably *where*
 * — notably the NLP detector, whose tokenizer works on a normalised copy of the
 * text. Re-locating the literal in the original guarantees the offsets we
 * report genuinely slice back to the reported value, which the engine asserts.
 *
 * Finding every occurrence rather than just the first is intentional: repeated
 * values must all collapse onto one placeholder, so they must all be detected.
 */
export function findLiteralOccurrences(text: string, needle: string): LiteralOccurrence[] {
  if (needle.length === 0) return [];

  const occurrences: LiteralOccurrence[] = [];
  let index = text.indexOf(needle);

  while (index !== -1) {
    if (isWordBoundedAt(text, index, needle.length)) {
      occurrences.push({ start: index, end: index + needle.length });
    }
    index = text.indexOf(needle, index + 1);
  }

  return occurrences;
}

/** Prevents "John" from matching inside "Johnson". */
function isWordBoundedAt(text: string, start: number, length: number): boolean {
  const before = text[start - 1];
  const after = text[start + length];
  const isWordCharacter = (character: string | undefined): boolean =>
    character !== undefined && /[\p{L}\p{N}_]/u.test(character);

  return !isWordCharacter(before) && !isWordCharacter(after);
}
