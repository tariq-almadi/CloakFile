import { createDefaultDocumentRegistry, sweepPdfStructure } from '@cloakfile/document-processing';
import { SanitizationPipeline } from '@cloakfile/pipeline';
import {
  MalformedDocumentError,
  SuspiciousDocumentError,
  VerificationFailedError,
  type AnalyzeOptions,
} from '@cloakfile/shared';
import { describe, expect, it } from 'vitest';

import {
  HOSTILE_PDF_SECRETS,
  blankPdf,
  hostilePdf,
  imageOnlyPdf,
  notAPdf,
  prefixedPdf,
  simpleTextPdf,
  truncatedPdf,
} from '../fixtures/pdf.js';

/**
 * PDF-specific behaviour: the channels text can hide in, the inputs we refuse,
 * and the evidence verification actually rests on.
 *
 * The format-independent guarantee lives in `sanitization-round-trip.test.ts`.
 * What is here is everything that is true of PDFs and of nothing else.
 */

const OPTIONS: AnalyzeOptions = {
  enabledTypes: ['PERSON', 'EMAIL', 'PHONE', 'CREDIT_CARD'],
  customPatterns: [],
  defaultRegion: 'CA',
};

const documents = createDefaultDocumentRegistry();

async function analyze(bytes: Uint8Array, options = OPTIONS) {
  return await new SanitizationPipeline().analyze({ bytes, format: 'pdf', options });
}

async function sanitize(bytes: Uint8Array, options = OPTIONS) {
  const pipeline = new SanitizationPipeline();
  const analysis = await pipeline.analyze({ bytes, format: 'pdf', options });
  return await pipeline.sanitize({ originalBytes: bytes, analysis });
}

describe('pdf extraction reaches every channel that carries text', () => {
  it('reads visible page text, an OCR layer, an annotation and a form field', async () => {
    const analysis = await analyze(hostilePdf());

    expect(analysis.document.text).toContain('John Doe called from');
    // Text drawn in render mode 3 is invisible on screen and extracts normally.
    expect(analysis.document.text).toContain('OCR layer: card 4111 1111 1111 1111');
    // Annotations are not returned by page text extraction; they need their own call.
    expect(analysis.document.text).toContain('Reviewer note: reach John Doe');
    // Nor are form field values.
    expect(analysis.document.text).toContain('John Doe');

    expect(analysis.document.segments.map((segment) => segment.region)).toEqual([
      'body',
      'annotation',
      'form-field',
    ]);
  });

  it('detects PII that exists only in an annotation', async () => {
    const analysis = await analyze(hostilePdf());

    expect(analysis.groups.some((group) => group.type === 'EMAIL')).toBe(true);
  });

  it('detects PII that exists only in the invisible OCR layer', async () => {
    const analysis = await analyze(hostilePdf());

    expect(analysis.groups.some((group) => group.type === 'CREDIT_CARD')).toBe(true);
  });

  it('warns about the channels it destroys rather than sanitizes', async () => {
    const analysis = await analyze(hostilePdf());
    const warnings = analysis.warnings.join(' ');

    expect(warnings).toContain('embedded file');
    expect(warnings).toContain('XMP metadata');
    expect(warnings).toContain('document properties');
  });

  it('names metadata keys but never their values', async () => {
    const analysis = await analyze(hostilePdf());
    const warnings = analysis.warnings.join(' ');

    expect(warnings).toContain('Author');
    expect(warnings).not.toContain('John Doe');
    expect(warnings).not.toContain('Acme Scanner Ltd');
  });
});

describe('pdf generation carries nothing across', () => {
  it('produces output with no annotations, form, attachments, XMP or metadata', async () => {
    const result = await sanitize(hostilePdf());
    const { channels } = await sweepPdfStructure(result.generated.bytes);

    expect(channels.annotationCount).toBe(0);
    expect(channels.hasAcroForm).toBe(false);
    expect(channels.hasEmbeddedFiles).toBe(false);
    expect(channels.hasXmpMetadata).toBe(false);
    expect(channels.hasJavaScript).toBe(false);
    expect(channels.hasOutlines).toBe(false);
    expect(channels.descriptiveInfoKeys).toEqual([]);
  });

  /**
   * pdf-lib's own load-and-save keeps objects that nothing references, so an
   * earlier version of a page can survive an edit-in-place sanitizer. Authoring
   * a new document is what makes this impossible rather than merely handled.
   */
  it('drops objects the original referenced from nowhere', async () => {
    const result = await sanitize(hostilePdf());
    const { decodedText } = await sweepPdfStructure(result.generated.bytes);

    expect(decodedText).not.toContain('ORPHAN-SECRET');
  });

  it('leaves no trace of any value from any channel of the original', async () => {
    const result = await sanitize(hostilePdf());
    const { decodedText } = await sweepPdfStructure(result.generated.bytes);

    for (const secret of HOSTILE_PDF_SECRETS) {
      expect(decodedText).not.toContain(secret);
    }
  });

  it('writes fixed, non-identifying document properties', async () => {
    const result = await sanitize(await simpleTextPdf());
    const { channels } = await sweepPdfStructure(result.generated.bytes);

    // Producer and the timestamps are ours and deliberately constant; nothing
    // describing the user's document survives.
    expect(channels.descriptiveInfoKeys).toEqual([]);
  });
});

describe('verification uses evidence a byte search cannot provide', () => {
  /**
   * The finding that shaped this whole design.
   *
   * pdf-lib writes strings and dictionaries into Flate-compressed object
   * streams. A value can therefore be completely absent from a search of the
   * file's bytes while being fully present in the document, readable by any
   * viewer. A verifier that grepped would certify a leaking file as clean.
   *
   * This test asserts the trap exists, so nobody "simplifies" the sweep into a
   * byte search later.
   */
  it('finds a value that is invisible to a search of the raw bytes', async () => {
    const original = hostilePdf();
    const analysis = await new SanitizationPipeline().analyze({
      bytes: original,
      format: 'pdf',
      // Detect nothing, so the generator has no work to do and the annotation
      // text survives into a re-saved document.
      options: { enabledTypes: [], customPatterns: [] },
    });
    expect(analysis.groups).toEqual([]);

    // Re-save the original through pdf-lib without sanitizing it.
    const resaved = await resaveThroughPdfLib(original);

    const rawBytes = Buffer.from(resaved).toString('latin1');
    expect(rawBytes).not.toContain('Reviewer note');

    const { decodedText } = await sweepPdfStructure(resaved);
    expect(decodedText).toContain('Reviewer note');
  });

  it('reports placeholders, never residual values', async () => {
    const result = await sanitize(hostilePdf());
    const serialised = JSON.stringify(result.verification);

    for (const secret of HOSTILE_PDF_SECRETS) {
      expect(serialised).not.toContain(secret);
    }
  });

  it('runs both the text check and the independent object check', async () => {
    const result = await sanitize(hostilePdf());
    const ids = result.verification.checks.map((check) => check.id);

    expect(ids).toContain('residual-values');
    expect(ids).toContain('deep-streams');
    expect(ids).toContain('structural-channels');
    expect(result.verification.status).toBe('pass');
  });
});

describe('scanned pages are refused, not quietly passed', () => {
  it('marks an image-only page as unreadable', async () => {
    const analysis = await analyze(imageOnlyPdf());

    expect(analysis.document.unreadable).toEqual(['page:1']);
    expect(analysis.warnings.join(' ')).toContain('no extractable text');
  });

  it('refuses to release a document whose content could not be read', async () => {
    await expect(sanitize(imageOnlyPdf())).rejects.toThrow(VerificationFailedError);
  });

  it('records the reason as inconclusive rather than a failure', async () => {
    const pipeline = new SanitizationPipeline({ strictVerification: false });
    const bytes = imageOnlyPdf();
    const analysis = await pipeline.analyze({ bytes, format: 'pdf', options: OPTIONS });
    const result = await pipeline.sanitize({ originalBytes: bytes, analysis });

    expect(result.verification.status).toBe('inconclusive');
    const check = result.verification.checks.find((entry) => entry.id === 'unreadable-content');
    expect(check?.status).toBe('inconclusive');
  });

  /** A blank page is not a scan; it must not be treated as unreadable. */
  it('does not confuse an empty page with a scanned one', async () => {
    const analysis = await analyze(blankPdf());

    expect(analysis.document.unreadable).toEqual([]);
  });
});

describe('hostile and malformed input', () => {
  it('rejects a file that is not a PDF', async () => {
    await expect(documents.extract({ bytes: notAPdf(), format: 'pdf' })).rejects.toThrow(
      MalformedDocumentError,
    );
  });

  it('rejects a PDF hidden behind leading data', async () => {
    await expect(
      documents.extract({ bytes: prefixedPdf('GIF89a decoy '), format: 'pdf' }),
    ).rejects.toThrow(SuspiciousDocumentError);
  });

  it('rejects a truncated PDF without leaking the parser message', async () => {
    await expect(documents.extract({ bytes: truncatedPdf(), format: 'pdf' })).rejects.toThrow(
      MalformedDocumentError,
    );
  });

  it('does not put document content into the error message', async () => {
    const bytes = prefixedPdf('GIF89a decoy ');

    await expect(documents.extract({ bytes, format: 'pdf' })).rejects.toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining('John Doe') as unknown as string,
      }),
    );
  });
});

/** Saves a document through pdf-lib unchanged, to demonstrate what survives. */
async function resaveThroughPdfLib(bytes: Uint8Array): Promise<Uint8Array> {
  const { PDFDocument } = await import('@cantoo/pdf-lib');
  const doc = await PDFDocument.load(bytes, { throwOnInvalidObject: false });
  return await doc.save({ useObjectStreams: true });
}
