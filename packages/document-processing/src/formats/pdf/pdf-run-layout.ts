/**
 * Horizontal placement for positioned PDF runs.
 *
 * Word spaces in body text are only a few points. Table columns start much
 * farther apart. Closing every gap pulls table cells into one pile; keeping
 * every original x leaves a hole after a short placeholder in a sentence.
 *
 * A longer placeholder must never be flowed to an x where it would run off the
 * page if the original x still has room — that clips characters and fails
 * verification.
 */
const COLUMN_BREAK = 16;
/**
 * Distance between the start of one fragment and the next. A long name can
 * fill its table cell so the ink gap looks like a word space, while the next
 * column still begins far to the right. Word spaces in a sentence are closer
 * than this.
 */
const COLUMN_START = 72;

export interface PlacedRun {
  readonly x: number;
  readonly y: number;
  readonly width: number;
}

export interface ResolveDrawXOptions {
  readonly textWidth?: number;
  readonly pageRight?: number;
}

export function resolveDrawX(
  run: PlacedRun,
  previous: { readonly run: PlacedRun; readonly drawX: number; readonly drawnWidth: number } | null,
  options: ResolveDrawXOptions = {},
): number {
  if (previous === null) return run.x;
  const sameBand = Math.abs(run.y - previous.run.y) <= 2;
  // A jump back to the left margin is the next row, even when baselines differ by a point.
  const readingForward = run.x >= previous.run.x - 1;
  if (!sameBand || !readingForward) return run.x;

  const wordGap = run.x - (previous.run.x + previous.run.width);
  const startGap = run.x - previous.run.x;
  const cursorX = previous.drawX + previous.drawnWidth;

  let x = run.x;
  if (wordGap >= 0 && wordGap < COLUMN_BREAK && startGap < COLUMN_START) {
    x = cursorX + wordGap;
  } else if (run.x < cursorX + 1.5) {
    x = cursorX + 3;
  }

  const textWidth = options.textWidth ?? 0;
  const pageRight = options.pageRight;
  if (textWidth > 0 && pageRight !== undefined && x + textWidth > pageRight) {
    const originalFits = run.x + textWidth <= pageRight;
    const originalClear =
      previous === null || run.x >= previous.drawX + previous.drawnWidth - 0.5;
    if (originalFits && originalClear) return run.x;
  }

  return x;
}

/**
 * When a replacement is wider than the end of the line, move it onto the next
 * empty soft-wrapped run (the rest of the original value) so every character
 * stays on the page.
 */
export function findOverflowContinuation(
  items: readonly { readonly run: PlacedRun; readonly text: string }[],
  index: number,
): number {
  const current = items[index];
  if (current === undefined) return -1;

  for (let cursor = index + 1; cursor < items.length; cursor += 1) {
    const candidate = items[cursor];
    if (candidate === undefined) break;
    if (candidate.text.length > 0) return -1;
    if (candidate.run.y >= current.run.y - 0.5) continue;
    if (candidate.run.y < current.run.y - current.run.width && candidate.run.y < current.run.y - 40) {
      return -1;
    }
    if (candidate.run.x <= current.run.x - 20) return cursor;
  }
  return -1;
}
