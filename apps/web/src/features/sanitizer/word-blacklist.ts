import type { CustomPatternInput } from '@cloakfile/shared';

/** One user-facing blacklist entry (plain word or phrase). */
export interface BlacklistWord {
  readonly word: string;
  readonly ignoreCase: boolean;
}

const MAX_LABEL_LENGTH = 32;

/**
 * Escape a literal so it can sit inside a RegExp safely.
 */
export function escapeRegexLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

/**
 * Build a case-aware search pattern for a plain word or phrase.
 *
 * Single tokens get word boundaries so `cat` does not match `category`.
 * Multi-word phrases allow flexible whitespace between the words.
 */
export function wordToSearchPattern(word: string): string {
  const trimmed = word.trim().replace(/\s+/gu, ' ');
  if (trimmed.length === 0) {
    throw new Error('Word cannot be empty.');
  }

  const parts = trimmed.split(' ').map((part) => escapeRegexLiteral(part));
  if (parts.length === 1) {
    return `\\b${parts[0] ?? ''}\\b`;
  }

  return `\\b${parts.join('\\s+')}\\b`;
}

/**
 * Placeholder label derived from the blocked word (`Project X` → `PROJECT_X`).
 */
export function labelFromWord(word: string, existing: readonly string[]): string {
  let base = word
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/gu, '_')
    .replace(/^_+|_+$/gu, '')
    .replace(/_+/gu, '_');

  if (base.length === 0) base = 'WORD';
  if (!/^[A-Z]/u.test(base)) base = `WORD_${base}`;
  base = base.slice(0, MAX_LABEL_LENGTH);

  if (!existing.includes(base)) return base;

  for (let index = 2; index < 100; index += 1) {
    const suffix = `_${String(index)}`;
    const clipped = base.slice(0, MAX_LABEL_LENGTH - suffix.length) + suffix;
    if (!existing.includes(clipped)) return clipped;
  }

  return `${base.slice(0, 28)}_${String(Date.now()).slice(-3)}`;
}

/** Convert the UI blacklist into API `customPatterns`. */
export function blacklistToCustomPatterns(
  entries: readonly BlacklistWord[],
): readonly CustomPatternInput[] {
  const names: string[] = [];
  return entries.map((entry) => {
    const name = labelFromWord(entry.word, names);
    names.push(name);
    return {
      name,
      pattern: wordToSearchPattern(entry.word),
      ignoreCase: entry.ignoreCase,
    };
  });
}
