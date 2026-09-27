import { describe, expect, it } from 'vitest';

import {
  assemblePageTextFromPdfJsItems,
  normalizeTextForDetection,
} from './page-text-assembler.js';

function item(str: string, y: number, height = 10, x = 50, width = str.length * 5): Record<string, unknown> {
  return { str, height, width, transform: [1, 0, 0, 1, x, y] };
}

describe('assemblePageTextFromPdfJsItems', () => {
  it('joins wrapped body lines into one paragraph and keeps a split name together', () => {
    const text = assemblePageTextFromPdfJsItems([
      item('developers like Alexander', 600),
      item('Vance or software architect', 586),
    ]);

    expect(text).toBe('developers like Alexander Vance or software architect');
    expect(text).not.toContain('\n');
  });

  it('rejoins a hyphenated wrap without inserting a space', () => {
    const text = assemblePageTextFromPdfJsItems([
      item('Hassan Al-', 600),
      item('Mansoor', 586),
    ]);

    expect(text).toBe('Hassan Al-Mansoor');
  });

  it('keeps a hyphenated given name and the surname as one phrase', () => {
    const text = assemblePageTextFromPdfJsItems([
      item('Mei-Ling', 600),
      item('Zhou', 586),
    ]);

    expect(text).toBe('Mei-Ling Zhou');
  });

  it('does not glue a table cell onto the name in the previous column', () => {
    const text = assemblePageTextFromPdfJsItems([
      item('Genevieve Beaumont', 400, 9, 58, 92),
      item(' ', 400, 9, 150, 35),
      item('Research & Development', 400, 9, 185, 103),
    ]);

    expect(text).toBe('Genevieve Beaumont\u001fResearch & Development');
  });

  it('separates headings and paragraph breaks from body wraps', () => {
    const text = assemblePageTextFromPdfJsItems([
      item('Application Parsing Report', 700, 18),
      item('Document ID: TEST-DOC-2026-A1', 679, 10),
      item('Section 1: Executive Overview', 650, 13),
      item('The primary objective of this document is to supply', 627),
      item('a rigorous string-matching environment.', 612),
      item('During the initial system audit, the lead investigator noted it.', 592),
    ]);

    expect(text).toBe(
      [
        'Application Parsing Report',
        'Document ID: TEST-DOC-2026-A1',
        'Section 1: Executive Overview',
        'The primary objective of this document is to supply a rigorous string-matching environment.',
        'During the initial system audit, the lead investigator noted it.',
      ].join('\n\n'),
    );
  });
});

describe('normalizeTextForDetection', () => {
  it('turns paragraph breaks into spaces without shifting offsets', () => {
    const visual = 'Alexander\n\nVance';
    const detection = normalizeTextForDetection(visual);

    expect(detection).toBe('Alexander  Vance');
    expect(detection.length).toBe(visual.length);
  });
});
