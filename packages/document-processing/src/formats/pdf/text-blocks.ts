import type { TextRegion, TextSegment } from '@cloakfile/shared';

/**
 * Block separator used inside the flattened text view of a PDF.
 *
 * ---------------------------------------------------------------------------
 * Why a separator character rather than offsets
 * ---------------------------------------------------------------------------
 * `TextSegment` offsets point into the *extracted* text. By the time the
 * generator runs, that string has been rewritten: placeholders are almost never
 * the same length as the values they replaced, so every offset past the first
 * replacement is stale. Carrying the offsets forward would silently put text on
 * the wrong page.
 *
 * A separator survives rewriting instead of being invalidated by it. U+000C
 * FORM FEED is the conventional page break in extracted PDF text (it is what
 * `pdftotext` emits), it is not a character any detector produces, and it
 * cannot appear inside a placeholder.
 *
 * The generator still checks that the number of separators is unchanged before
 * trusting the split, because "cannot happen" is not a guarantee. See
 * `splitSanitizedBlocks`.
 */
export const BLOCK_SEPARATOR = '\f';

export interface TextBlock {
  /** Format-specific provenance, e.g. `page:1`, `page:1:field:patient_name`. */
  readonly locator: string;
  readonly region: TextRegion;
  readonly text: string;
}

export interface FlattenedText {
  readonly text: string;
  readonly segments: readonly TextSegment[];
}

/** Joins blocks into the single string detection runs against. */
export function flattenBlocks(blocks: readonly TextBlock[]): FlattenedText {
  const segments: TextSegment[] = [];
  let text = '';

  for (const [index, block] of blocks.entries()) {
    if (index > 0) text += BLOCK_SEPARATOR;
    const start = text.length;
    text += block.text;
    segments.push({ start, end: text.length, locator: block.locator, region: block.region });
  }

  return { text, segments };
}

/**
 * Splits rewritten text back into blocks.
 *
 * Returns `null` when the block count no longer matches, which means something
 * consumed or introduced a separator. The generator treats that as a reason to
 * fall back to an unstructured layout and say so, rather than distributing text
 * across pages it can no longer account for.
 */
export function splitSanitizedBlocks(
  sanitizedText: string,
  expectedCount: number,
): readonly string[] | null {
  const parts = sanitizedText.split(BLOCK_SEPARATOR);
  return parts.length === expectedCount ? parts : null;
}
