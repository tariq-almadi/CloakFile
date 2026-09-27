/**
 * Rebuilds readable page text from pdf.js text items.
 *
 * pdf.js emits one run per visual fragment and sets `hasEOL` on almost every
 * wrapped line. Writing those breaks through unchanged produces a ragged
 * dump: headings look like body text, paragraphs have no gaps, and a name
 * split across a wrap (`Alexander` / `Vance`) is detected as two people.
 *
 * This assembler groups runs onto lines by vertical position, then:
 *
 *   - joins tightly spaced body lines into one paragraph (soft wrap)
 *   - rejoins a hyphen at the end of a wrap (`Al-` + `Mansoor`)
 *   - starts a new paragraph when the gap is larger, or when the line is a
 *     title / heading (taller than body text)
 *
 * Paragraphs are separated by a blank line so the generator can wrap each one
 * to the page width and space them like the source.
 */
const SAME_LINE_Y = 2;
/** Gaps at least this wide (pt) are table columns, not spaces between words. */
const COLUMN_GAP = 16;
/** Keeps the next cell from being read as part of the previous name. Not drawn. */
const COLUMN_BREAK = '\u001f';
/** Gaps at or below this multiple of the previous line's height are wraps. */
const SOFT_WRAP_RATIO = 1.65;
/** Taller than body copy: titles and section headings stay their own blocks. */
const STRUCTURAL_HEIGHT = 12;

interface LinePiece {
  readonly str: string;
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly width: number;
  readonly color: { readonly r: number; readonly g: number; readonly b: number };
  readonly bold: boolean;
  readonly mono: boolean;
}

interface VisualLine {
  readonly y: number;
  height: number;
  readonly pieces: LinePiece[];
}

export function normalizeTextForDetection(extractedText: string): string {
  return extractedText.replace(/\n/g, ' ');
}

/** Walk pdf.js `getTextContent()` items in order. */
export function assemblePageTextFromPdfJsItems(
  items: readonly Record<string, unknown>[],
): string {
  return assemblePositionedPage(items).text;
}

export interface PositionedRun {
  readonly start: number;
  readonly end: number;
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly width: number;
  readonly color: { readonly r: number; readonly g: number; readonly b: number };
  readonly bold: boolean;
  readonly mono: boolean;
}

/**
 * Same paragraph text as `assemblePageTextFromPdfJsItems`, plus the original
 * position of each pdf.js run inside that string.
 */
export function assemblePositionedPage(items: readonly Record<string, unknown>[]): {
  readonly text: string;
  readonly runs: readonly PositionedRun[];
} {
  const paragraphs: string[] = [];
  const runs: PositionedRun[] = [];
  let paragraph = '';
  let paragraphRuns: PositionedRun[] = [];
  let previous: VisualLine | null = null;

  const flush = (): void => {
    if (paragraph.length === 0) return;
    const offset = paragraphs.join('\n\n').length === 0 ? 0 : paragraphs.join('\n\n').length + 2;
    paragraphs.push(paragraph);
    for (const run of paragraphRuns) {
      runs.push({ ...run, start: run.start + offset, end: run.end + offset });
    }
    paragraph = '';
    paragraphRuns = [];
  };

  for (const line of groupVisualLines(items)) {
    const placed = placeLine(line);
    if (placed.text.length === 0) continue;

    if (paragraph.length === 0 || previous === null) {
      paragraph = placed.text;
      paragraphRuns = [...placed.runs];
      previous = line;
      continue;
    }

    if (isSoftWrap(previous, line)) {
      const joiner = paragraph.endsWith('-') ? '' : ' ';
      const shift = paragraph.length + joiner.length;
      paragraph += joiner + placed.text;
      paragraphRuns.push(
        ...placed.runs.map((run) => ({ ...run, start: run.start + shift, end: run.end + shift })),
      );
      previous = line;
      continue;
    }

    flush();
    paragraph = placed.text;
    paragraphRuns = [...placed.runs];
    previous = line;
  }

  flush();
  return { text: paragraphs.join('\n\n'), runs };
}

function placeLine(line: VisualLine): { text: string; runs: PositionedRun[] } {
  let raw = '';
  const spans: { piece: LinePiece; start: number; end: number }[] = [];

  for (const piece of line.pieces) {
    if (piece.str.trim().length === 0) {
      raw += piece.width >= COLUMN_GAP ? COLUMN_BREAK : piece.str;
      continue;
    }
    const previous = spans.at(-1);
    if (previous !== undefined && previous.piece.width > 0 && !raw.endsWith(COLUMN_BREAK)) {
      const gap = piece.x - (previous.piece.x + previous.piece.width);
      if (gap >= COLUMN_GAP) raw += COLUMN_BREAK;
    }
    const start = raw.length;
    raw += piece.str;
    spans.push({ piece, start, end: raw.length });
  }

  const lead = raw.length - raw.trimStart().length;
  const text = raw.trim();
  if (text.length === 0) return { text: '', runs: [] };

  const runs: PositionedRun[] = [];
  for (const span of spans) {
    if (span.piece.str.trim().length === 0) continue;
    const from = Math.max(span.start, lead);
    const to = Math.min(span.end, lead + text.length);
    if (to <= from) continue;
    runs.push({
      start: from - lead,
      end: to - lead,
      x: span.piece.x,
      y: span.piece.y,
      size: span.piece.size,
      width: span.piece.width,
      color: span.piece.color,
      bold: span.piece.bold,
      mono: span.piece.mono,
    });
  }
  return { text, runs };
}

function groupVisualLines(items: readonly Record<string, unknown>[]): VisualLine[] {
  const lines: VisualLine[] = [];

  for (const item of items) {
    const piece = readPiece(item);
    if (piece === null) continue;
    const last = lines.at(-1);

    if (last !== undefined && Math.abs(last.y - piece.y) <= SAME_LINE_Y) {
      last.pieces.push(piece);
      last.height = Math.max(last.height, piece.size);
      continue;
    }

    lines.push({ y: piece.y, height: piece.size, pieces: [piece] });
  }

  return lines;
}

function isSoftWrap(previous: VisualLine, next: VisualLine): boolean {
  if (previous.height >= STRUCTURAL_HEIGHT || next.height >= STRUCTURAL_HEIGHT) return false;
  const gap = previous.y - next.y;
  if (gap <= 0) return false;
  return gap <= previous.height * SOFT_WRAP_RATIO;
}

function readPiece(item: Record<string, unknown>): LinePiece | null {
  if (typeof item['str'] !== 'string' || item['str'].length === 0) return null;
  const color = readColor(item['color']);
  return {
    str: item['str'],
    x: readX(item),
    y: readY(item),
    size: readHeight(item),
    width: typeof item['width'] === 'number' ? item['width'] : 0,
    color,
    bold: item['bold'] === true,
    mono: item['mono'] === true,
  };
}

function readColor(value: unknown): { r: number; g: number; b: number } {
  if (typeof value === 'object' && value !== null) {
    const record = value as { r?: unknown; g?: unknown; b?: unknown };
    if (typeof record.r === 'number' && typeof record.g === 'number' && typeof record.b === 'number') {
      return { r: record.r, g: record.g, b: record.b };
    }
  }
  return { r: 0, g: 0, b: 0 };
}

function readX(item: Record<string, unknown>): number {
  const transform = item['transform'];
  if (Array.isArray(transform) && typeof transform[4] === 'number') return transform[4];
  return 0;
}

function readY(item: Record<string, unknown>): number {
  const transform = item['transform'];
  if (Array.isArray(transform) && typeof transform[5] === 'number') return transform[5];
  return 0;
}

function readHeight(item: Record<string, unknown>): number {
  return typeof item['height'] === 'number' && item['height'] > 0 ? item['height'] : 10;
}
