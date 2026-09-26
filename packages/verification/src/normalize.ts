/**
 * Alternative spellings of one value that must all count as "still present".
 *
 * A residual-value check that only searched for the literal original string
 * would be trivially defeated by the document round trip itself. `4111 1111
 * 1111 1111` can come back as `4111111111111111`; `John Doe` can come back with
 * a non-breaking space; a PDF extractor may join or split runs differently.
 *
 * Being generous here is the right bias: an extra variant costs a little search
 * time, while a missed variant means shipping a document we told the user was
 * clean.
 */
export function residualVariants(value: string): readonly string[] {
  const variants = new Set<string>();
  const trimmed = value.trim();
  if (trimmed.length === 0) return [];

  variants.add(trimmed);
  variants.add(trimmed.toLowerCase());
  variants.add(trimmed.normalize('NFKC'));
  variants.add(collapseWhitespace(trimmed).toLowerCase());
  variants.add(stripSeparators(trimmed).toLowerCase());

  const digits = trimmed.replace(/\D/gu, '');
  // Short digit runs (a year, a house number) match far too much ordinary text
  // to be evidence of a leak.
  if (digits.length >= 6) variants.add(digits);

  return [...variants].filter((variant) => variant.length >= 4);
}

/**
 * The form of the haystack that variants are searched against.
 *
 * The document text is normalised the same way the variants are, so that a
 * difference in whitespace or Unicode composition between input and output
 * cannot hide a residual value.
 */
/**
 * Whether a residual variant appears in normalized output.
 *
 * Digit-heavy and formatted values keep substring search so `4111 1111…` still
 * matches `4111111111111111`. Letter-only tokens use word boundaries so a short
 * name like `Vance` is not reported inside `advanced`.
 */
export function residualVariantMatches(
  haystack: ReturnType<typeof normalizeHaystack>,
  variant: string,
  originalValue: string,
): boolean {
  if (/^\d{6,}$/u.test(variant)) {
    return haystack.digits.includes(variant);
  }

  const valueHasDigit = /\d/u.test(originalValue);
  const valueHasSeparator = /[\s.\-()_/]/u.test(originalValue);

  if (valueHasDigit || valueHasSeparator) {
    return (
      haystack.lowered.includes(variant) ||
      haystack.collapsed.includes(variant) ||
      haystack.separatorless.includes(variant)
    );
  }

  return (
    lettersBounded(haystack.lowered, variant) || lettersBounded(haystack.collapsed, variant)
  );
}

function lettersBounded(haystack: string, variant: string): boolean {
  if (variant.length === 0) return false;
  const escaped = variant.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const re = new RegExp(`(?<![\\p{L}\\p{M}])${escaped}(?![\\p{L}\\p{M}])`, 'iu');
  return re.test(haystack);
}

export function normalizeHaystack(text: string): {
  readonly raw: string;
  readonly lowered: string;
  readonly collapsed: string;
  readonly separatorless: string;
  readonly digits: string;
} {
  const raw = text.normalize('NFKC');
  const lowered = raw.toLowerCase();
  return {
    raw,
    lowered,
    collapsed: collapseWhitespace(lowered),
    separatorless: stripSeparators(lowered),
    digits: raw.replace(/\D/gu, ''),
  };
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/gu, ' ');
}

/** Removes the characters that formatting freely adds and removes. */
function stripSeparators(value: string): string {
  return value.replace(/[\s.\-()_/]/gu, '');
}
