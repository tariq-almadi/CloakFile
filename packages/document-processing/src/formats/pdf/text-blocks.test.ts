import { describe, expect, it } from 'vitest';

import { BLOCK_SEPARATOR, flattenBlocks, splitSanitizedBlocks } from './text-blocks.js';

const BLOCKS = [
  { locator: 'page:1', region: 'body' as const, text: 'First page.' },
  { locator: 'page:1:annotation:Text', region: 'annotation' as const, text: 'A note.' },
  { locator: 'page:2', region: 'body' as const, text: 'Second page.' },
];

describe('flattenBlocks', () => {
  it('joins blocks with the separator and reports offsets into the result', () => {
    const { text, segments } = flattenBlocks(BLOCKS);

    expect(text).toBe(`First page.${BLOCK_SEPARATOR}A note.${BLOCK_SEPARATOR}Second page.`);
    expect(segments).toHaveLength(3);
    for (const [index, segment] of segments.entries()) {
      expect(text.slice(segment.start, segment.end)).toBe(BLOCKS[index]?.text);
    }
  });

  it('keeps provenance on every segment', () => {
    const { segments } = flattenBlocks(BLOCKS);

    expect(segments.map((segment) => segment.locator)).toEqual([
      'page:1',
      'page:1:annotation:Text',
      'page:2',
    ]);
    expect(segments.map((segment) => segment.region)).toEqual(['body', 'annotation', 'body']);
  });

  it('handles an empty page without losing the block', () => {
    const { text, segments } = flattenBlocks([
      { locator: 'page:1', region: 'body', text: '' },
      { locator: 'page:2', region: 'body', text: 'text' },
    ]);

    expect(segments).toHaveLength(2);
    expect(text).toBe(`${BLOCK_SEPARATOR}text`);
  });
});

describe('splitSanitizedBlocks', () => {
  /**
   * The reason a separator is used at all: after replacement the offsets in
   * `segments` are stale, because placeholders are a different length from the
   * values they replaced. The separator survives that; offsets do not.
   */
  it('recovers blocks from text whose lengths have all changed', () => {
    const sanitized = `[PERSON_001] was here.${BLOCK_SEPARATOR}x${BLOCK_SEPARATOR}[EMAIL_001]`;

    expect(splitSanitizedBlocks(sanitized, 3)).toEqual([
      '[PERSON_001] was here.',
      'x',
      '[EMAIL_001]',
    ]);
  });

  it('returns null when a separator was lost, rather than misplacing text', () => {
    expect(splitSanitizedBlocks('one\ftwo', 3)).toBeNull();
  });

  it('returns null when a separator was introduced', () => {
    expect(splitSanitizedBlocks('one\ftwo\fthree\ffour', 3)).toBeNull();
  });

  it('round-trips unchanged text', () => {
    const { text } = flattenBlocks(BLOCKS);

    expect(splitSanitizedBlocks(text, BLOCKS.length)).toEqual(BLOCKS.map((block) => block.text));
  });
});
