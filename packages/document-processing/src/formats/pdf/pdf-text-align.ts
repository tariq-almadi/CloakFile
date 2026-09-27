export interface BoundaryReplacement {
  readonly start: number;
  readonly end: number;
  readonly placeholder: string;
}

/**
 * Maps boundaries in the original extracted text onto the sanitized string.
 *
 * `boundaries[k]` is the sanitized index after consuming `original[0, k)`.
 * A span `[start, end)` therefore becomes
 * `sanitized.slice(boundaries[start], boundaries[end])`.
 *
 * When a replacement covers several spans, the first span receives the whole
 * placeholder and the later spans receive an empty slice.
 */
export function sanitizedBoundaries(
  original: string,
  sanitized: string,
  replacements: readonly BoundaryReplacement[] = [],
): readonly number[] {
  if (replacements.length > 0) {
    return sanitizedBoundariesFromReplacements(original, sanitized, replacements);
  }

  const boundaries = new Array<number>(original.length + 1).fill(0);
  let originalIndex = 0;
  let sanitizedIndex = 0;
  boundaries[0] = 0;

  while (originalIndex < original.length && sanitizedIndex < sanitized.length) {
    if (original[originalIndex] === sanitized[sanitizedIndex]) {
      originalIndex += 1;
      sanitizedIndex += 1;
      boundaries[originalIndex] = sanitizedIndex;
      continue;
    }

    const sync = findSync(original, originalIndex, sanitized, sanitizedIndex);
    if (sync === null) break;

    originalIndex += 1;
    boundaries[originalIndex] = sync.sanitizedIndex;
    while (originalIndex < sync.originalIndex) {
      originalIndex += 1;
      boundaries[originalIndex] = sync.sanitizedIndex;
    }
    sanitizedIndex = sync.sanitizedIndex;
  }

  while (originalIndex < original.length) {
    originalIndex += 1;
    boundaries[originalIndex] = sanitized.length;
  }
  boundaries[original.length] = sanitized.length;
  return boundaries;
}

function sanitizedBoundariesFromReplacements(
  original: string,
  sanitized: string,
  replacements: readonly BoundaryReplacement[],
): readonly number[] {
  const sorted = [...replacements].sort((a, b) => a.start - b.start);
  const boundaries = new Array<number>(original.length + 1).fill(0);
  let originalIndex = 0;
  let sanitizedIndex = 0;
  let replacementIndex = 0;
  boundaries[0] = 0;

  while (originalIndex < original.length) {
    const next = sorted[replacementIndex];
    if (next !== undefined && originalIndex === next.start) {
      const placeholder = next.placeholder;
      if (sanitized.slice(sanitizedIndex, sanitizedIndex + placeholder.length) !== placeholder) {
        const found = sanitized.indexOf(placeholder, sanitizedIndex);
        if (found >= 0 && found - sanitizedIndex < 200) sanitizedIndex = found;
      }

      const after = sanitizedIndex + placeholder.length;
      boundaries[next.start] = sanitizedIndex;
      for (let cursor = next.start + 1; cursor <= next.end; cursor += 1) {
        boundaries[cursor] = after;
      }
      sanitizedIndex = after;
      originalIndex = next.end;
      replacementIndex += 1;
      continue;
    }

    if (original[originalIndex] === sanitized[sanitizedIndex]) {
      originalIndex += 1;
      sanitizedIndex += 1;
      boundaries[originalIndex] = sanitizedIndex;
      continue;
    }

    const sync = findSync(original, originalIndex, sanitized, sanitizedIndex);
    if (sync === null) break;

    originalIndex += 1;
    boundaries[originalIndex] = sync.sanitizedIndex;
    while (originalIndex < sync.originalIndex) {
      originalIndex += 1;
      boundaries[originalIndex] = sync.sanitizedIndex;
    }
    sanitizedIndex = sync.sanitizedIndex;
  }

  while (originalIndex <= original.length) {
    boundaries[originalIndex] = sanitized.length;
    originalIndex += 1;
  }
  return boundaries;
}

function findSync(
  original: string,
  originalIndex: number,
  sanitized: string,
  sanitizedIndex: number,
): { originalIndex: number; sanitizedIndex: number } | null {
  const limit = original.length;
  for (let cursor = originalIndex + 1; cursor < limit; cursor += 1) {
    const remaining = original.length - cursor;
    const needleLength = remaining < 12 ? remaining : 12;
    if (needleLength < 1) break;
    const needle = original.slice(cursor, cursor + needleLength);
    const found = sanitized.indexOf(needle, sanitizedIndex);
    if (found >= 0 && found - sanitizedIndex < 80) {
      return { originalIndex: cursor, sanitizedIndex: found };
    }
  }
  return null;
}
