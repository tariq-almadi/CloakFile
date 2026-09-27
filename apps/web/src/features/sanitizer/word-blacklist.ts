import type { CustomPatternInput } from '@cloakfile/shared';

/** One user-facing blacklist entry (plain word or phrase). */
export interface BlacklistWord {
  readonly word: string;
  readonly ignoreCase: boolean;
}

const MAX_LABEL_LENGTH = 32;

/** Default placeholder label for blocked words: `[REDACTED_001]`. */
export const DEFAULT_REDACTION_TAG = 'REDACTED';

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
 * Normalize a user-chosen replacement tag into a valid placeholder label.
 *
 * Empty / invalid input falls back to `REDACTED` so the clean file never
 * re-embeds the blocked word as its own label (e.g. audit → `[AUDIT_001]`).
 */
export function normalizeRedactionTag(raw: string): string {
  let tag = raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/gu, '_')
    .replace(/^_+|_+$/gu, '')
    .replace(/_+/gu, '_');

  if (tag.length === 0) return DEFAULT_REDACTION_TAG;
  if (!/^[A-Z]/u.test(tag)) tag = `TAG_${tag}`;
  return tag.slice(0, MAX_LABEL_LENGTH);
}

/** Convert the UI blacklist into API `customPatterns`. */
export function blacklistToCustomPatterns(
  entries: readonly BlacklistWord[],
  redactionTag: string = DEFAULT_REDACTION_TAG,
): readonly CustomPatternInput[] {
  const name = normalizeRedactionTag(redactionTag);
  return entries.map((entry) => ({
    name,
    pattern: wordToSearchPattern(entry.word),
    ignoreCase: entry.ignoreCase,
  }));
}
