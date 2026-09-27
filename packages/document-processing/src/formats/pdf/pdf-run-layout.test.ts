import { describe, expect, it } from 'vitest';

import { findOverflowContinuation, resolveDrawX } from './pdf-run-layout.js';

describe('resolveDrawX', () => {
  it('keeps a short placeholder from opening a hole before the next word', () => {
    const previous = {
      run: { x: 50, y: 700, width: 40 },
      drawX: 50,
      drawnWidth: 70,
    };
    const next = { x: 96, y: 700, width: 40 };
    expect(resolveDrawX(next, previous)).toBe(126);
  });

  it('does not retreat into a longer previous placeholder', () => {
    const previous = {
      run: { x: 340, y: 240, width: 55 },
      drawX: 401,
      drawnWidth: 100,
    };
    const next = { x: 400, y: 240, width: 156 };
    expect(resolveDrawX(next, previous, { textWidth: 153, pageRight: 576 })).toBeGreaterThan(500);
  });

  it('does not slide the next column left when a long cell almost fills the gap', () => {
    const previous = {
      run: { x: 133, y: 500, width: 100 },
      drawX: 133,
      drawnWidth: 62,
    };
    const next = { x: 239, y: 500, width: 90 };
    expect(resolveDrawX(next, previous)).toBe(239);
  });

  it('leaves table columns on their original x', () => {
    const previous = {
      run: { x: 58, y: 400, width: 92 },
      drawX: 58,
      drawnWidth: 70,
    };
    const next = { x: 185, y: 400, width: 100 };
    expect(resolveDrawX(next, previous)).toBe(185);
  });

  it('does not drag the next row behind a token that sits slightly higher', () => {
    const previous = {
      run: { x: 470, y: 621.8, width: 33 },
      drawX: 470,
      drawnWidth: 33,
    };
    const next = { x: 58, y: 621, width: 70 };
    expect(resolveDrawX(next, previous)).toBe(58);
  });

  it('closes the hole when the previous word was removed', () => {
    const previous = {
      run: { x: 51, y: 620, width: 29 },
      drawX: 51,
      drawnWidth: 0,
    };
    const next = { x: 84, y: 620, width: 90 };
    expect(resolveDrawX(next, previous)).toBe(55);
  });

  it('keeps the original word gap when nothing changed width', () => {
    const previous = {
      run: { x: 51, y: 500, width: 15 },
      drawX: 51,
      drawnWidth: 15,
    };
    const next = { x: 72, y: 500, width: 40 };
    expect(resolveDrawX(next, previous)).toBe(72);
  });
});

describe('findOverflowContinuation', () => {
  it('finds the empty soft-wrap run below a clipped card fragment', () => {
    const items = [
      { run: { x: 521, y: 393, width: 28 }, text: '[CREDIT_CARD_002]' },
      { run: { x: 51, y: 378, width: 66 }, text: '' },
      { run: { x: 117, y: 378, width: 200 }, text: '. Support noted' },
    ];
    expect(findOverflowContinuation(items, 0)).toBe(1);
  });
});
