import { MalformedDocumentError, SuspiciousDocumentError } from '@cloakfile/shared';

/** `%PDF-` — the only header a PDF may begin with. */
const PDF_HEADER = [0x25, 0x50, 0x44, 0x46, 0x2d] as const;

/**
 * Readers tolerate junk before `%PDF-`; so do we, but only a little. An
 * arbitrarily long prefix is a way to smuggle a second file format into the
 * same bytes and have two parsers disagree about what they are looking at.
 */
const MAX_HEADER_OFFSET = 1024;

/**
 * Cheap structural checks that run *before* the file reaches a parser.
 *
 * The expensive limits (page count, object count) cannot be known without
 * parsing, so they live in `assertParsedWithinLimits` and run as soon as the
 * document object exists — but these run on raw bytes, where the cost of being
 * wrong is lowest.
 */
export function assertPlausiblePdf(bytes: Uint8Array): void {
  if (bytes.length < PDF_HEADER.length) {
    throw new MalformedDocumentError('This file is too small to be a PDF.');
  }

  const headerAt = findHeader(bytes);
  if (headerAt < 0) {
    throw new MalformedDocumentError('This file does not start with a PDF header.');
  }
  if (headerAt > 0) {
    throw new SuspiciousDocumentError(
      'This file has data before its PDF header, which can make different readers disagree about its contents.',
    );
  }
}

function findHeader(bytes: Uint8Array): number {
  const limit = Math.min(bytes.length - PDF_HEADER.length, MAX_HEADER_OFFSET);
  outer: for (let offset = 0; offset <= limit; offset += 1) {
    for (let i = 0; i < PDF_HEADER.length; i += 1) {
      if (bytes[offset + i] !== PDF_HEADER[i]) continue outer;
    }
    return offset;
  }
  return -1;
}

/**
 * Runs a promise against a wall-clock budget.
 *
 * Parsing a hostile PDF can take unbounded time without allocating enough
 * memory to trip any other limit, so a timeout is the backstop. Note the honest
 * limitation: this *reports* the timeout, it does not stop the work. Genuine
 * containment needs a worker thread, which is recorded in THREAT-MODEL T-08.
 */
export async function withTimeout<T>(
  work: Promise<T>,
  budgetMs: number,
  what: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const expiry = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(
        new SuspiciousDocumentError(
          `${what} took longer than ${String(budgetMs)}ms and was abandoned.`,
        ),
      );
    }, budgetMs);
    timer.unref();
  });

  try {
    return await Promise.race([work, expiry]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
