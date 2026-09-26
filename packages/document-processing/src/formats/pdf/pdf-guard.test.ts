import { MalformedDocumentError, SuspiciousDocumentError } from '@cloakfile/shared';
import { describe, expect, it } from 'vitest';

import { assertPlausiblePdf, withTimeout } from './pdf-guard.js';

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe('assertPlausiblePdf', () => {
  it('accepts a file that begins with the PDF header', () => {
    expect(() => {
      assertPlausiblePdf(bytes('%PDF-1.7\nrest of the file'));
    }).not.toThrow();
  });

  it('rejects a file that is not a PDF', () => {
    expect(() => {
      assertPlausiblePdf(bytes('GIF89a...'));
    }).toThrow(MalformedDocumentError);
  });

  it('rejects a file too short to carry a header', () => {
    expect(() => {
      assertPlausiblePdf(bytes('%PD'));
    }).toThrow(MalformedDocumentError);
  });

  /**
   * Readers tolerate junk before `%PDF-`, which is precisely the problem: our
   * parser and the recipient's may disagree about where the document starts,
   * and about what it is. We would rather refuse than sanitize the half of the
   * file we happened to look at.
   */
  it('rejects a PDF hidden behind leading data', () => {
    expect(() => {
      assertPlausiblePdf(bytes('GIF89a junk junk %PDF-1.7\n'));
    }).toThrow(SuspiciousDocumentError);
  });
});

describe('withTimeout', () => {
  it('passes a result through when the work finishes in time', async () => {
    await expect(withTimeout(Promise.resolve('done'), 1000, 'Working')).resolves.toBe('done');
  });

  it('rejects when the budget is exceeded', async () => {
    const slow = new Promise<string>((resolve) => setTimeout(() => resolve('late'), 500));

    await expect(withTimeout(slow, 10, 'Reading this PDF')).rejects.toThrow(
      SuspiciousDocumentError,
    );
  });

  it('propagates the original failure rather than masking it as a timeout', async () => {
    const failing = Promise.reject(new MalformedDocumentError('broken'));

    await expect(withTimeout(failing, 1000, 'Working')).rejects.toThrow(MalformedDocumentError);
  });
});
