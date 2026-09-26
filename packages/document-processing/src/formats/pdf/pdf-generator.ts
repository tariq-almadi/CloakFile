import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from '@cantoo/pdf-lib';
import { FORMAT_MEDIA_TYPES, type GeneratedDocument, type SanitizationMode } from '@cloakfile/shared';

import type { DocumentGenerator, GenerationInput } from '../../types.js';
import { toEncodableText } from './pdf-fonts.js';
import { splitSanitizedBlocks } from './text-blocks.js';

const PAGE_WIDTH = 612; // US Letter, 72dpi
const PAGE_HEIGHT = 792;
const MARGIN = 54;
const BODY_SIZE = 10.5;
const HEADING_SIZE = 11.5;
const LINE_HEIGHT = 14;
const BLOCK_GAP = 10;

/**
 * Builds a new PDF from sanitized text.
 *
 * ---------------------------------------------------------------------------
 * Why this authors a new document instead of editing the uploaded one
 * ---------------------------------------------------------------------------
 * Editing in place would preserve layout, and it was rejected. Two measured
 * facts decided it (docs/decisions/0003):
 *
 * 1. In a PDF with a subset font, the show-text operand is a sequence of glyph
 *    IDs — `<0001000200030004>` — not characters. Replacing text means decoding
 *    through the font's CMap and re-encoding into the same font, and a subset
 *    font does not contain glyphs for `[`, `]`, `_` or the digits a placeholder
 *    needs. There is nothing to write the replacement with.
 * 2. A pdf-lib load-and-save **retains unreferenced objects**. A prior version
 *    of the page, kept in the file but referenced from nowhere, survives it.
 *
 * Both failures are partial and silent: the document looks sanitized and is
 * not. Authoring a new document cannot fail that way. Nothing is carried over,
 * so nothing can survive — no annotations, no form objects, no attachments, no
 * XMP, no `/Info`, no outlines, no orphans, no earlier revisions.
 *
 * The cost is layout. `PDF_CAPABILITIES.preservesLayout` has been `false` since
 * Phase 1; this is the generator those flags were describing.
 */
export class PdfGenerator implements DocumentGenerator {
  readonly format = 'pdf' as const;
  readonly mode: SanitizationMode = 'content-removal';
  readonly implemented = true;

  async generate({ source, sanitizedText }: GenerationInput): Promise<GeneratedDocument> {
    const warnings: string[] = [];

    const blocks = splitSanitizedBlocks(sanitizedText, source.segments.length);
    if (blocks === null) {
      // Recoverable, but the user should know the page attribution is gone.
      warnings.push(
        'The sanitized text no longer matches the page structure of the original, so the output is laid out as one continuous document.',
      );
    }

    const doc = await PDFDocument.create();
    const body = await doc.embedFont(StandardFonts.Helvetica);
    const heading = await doc.embedFont(StandardFonts.HelveticaBold);
    const charset = new Set(body.getCharacterSet());

    const layout = new Layout(doc, body, heading);
    let substituted = 0;

    if (blocks === null) {
      substituted += layout.writeBlock(null, sanitizedText, charset);
    } else {
      for (const [index, blockText] of blocks.entries()) {
        const segment = source.segments[index];
        substituted += layout.writeBlock(headingFor(segment?.region, segment?.locator), blockText, charset);
      }
    }

    layout.finish();

    if (substituted > 0) {
      warnings.push(
        `${String(substituted)} character(s) could not be represented in the output font and were replaced with "?". ` +
          'Generated PDFs use a Latin alphabet font; text in other scripts is not preserved.',
      );
    }

    stripGeneratedMetadata(doc);

    const bytes = await doc.save({ useObjectStreams: true });

    return {
      format: 'pdf',
      bytes,
      mediaType: FORMAT_MEDIA_TYPES.pdf,
      mode: this.mode,
      warnings,
    };
  }
}

/**
 * Page bodies are written without a heading, because they are the document.
 * Annotations and form fields get one: their text would otherwise be
 * indistinguishable from body copy, and the reader deserves to know that a line
 * came from a comment rather than the page.
 */
function headingFor(region: string | undefined, locator: string | undefined): string | null {
  if (region === 'form-field') {
    return `Form field: ${locator?.split(':field:')[1] ?? 'unnamed'}`;
  }
  if (region === 'annotation') {
    return `Annotation: ${locator?.split(':annotation:')[1] ?? 'note'}`;
  }
  return null;
}

/**
 * Even a freshly authored document gets metadata: pdf-lib stamps its own name
 * and the current time. The name is noise, but the timestamps say when a user
 * processed a document, which is not ours to record.
 *
 * The Unix epoch is used as an obvious sentinel rather than a plausible-looking
 * lie, and it also makes generated output byte-reproducible, which the
 * determinism test depends on.
 */
function stripGeneratedMetadata(doc: PDFDocument): void {
  const epoch = new Date(0);
  doc.setProducer('CloakFile');
  doc.setCreator('CloakFile');
  doc.setCreationDate(epoch);
  doc.setModificationDate(epoch);

  // Title, Author, Subject and Keywords are deliberately NOT set. A freshly
  // created document has no such entries, and setting them to "" would add
  // them: pdf-lib writes an empty text string as a UTF-16 byte-order mark,
  // which is a present-but-blank entry rather than an absent one. Clearing
  // metadata by writing to it is how metadata gets written.
}

/** Word wrapping and pagination. Deliberately ours, so overflow cannot go unnoticed. */
class Layout {
  readonly #doc: PDFDocument;
  readonly #body: PDFFont;
  readonly #heading: PDFFont;
  #page: PDFPage | null = null;
  #y = 0;

  constructor(doc: PDFDocument, body: PDFFont, heading: PDFFont) {
    this.#doc = doc;
    this.#body = body;
    this.#heading = heading;
  }

  /** Returns the number of characters that had to be substituted. */
  writeBlock(heading: string | null, text: string, charset: ReadonlySet<number>): number {
    const encoded = toEncodableText(text, charset);

    if (heading !== null) {
      this.#advance(BLOCK_GAP);
      this.#writeLine(toEncodableText(heading, charset).text, this.#heading, HEADING_SIZE);
    }

    for (const paragraph of encoded.text.split('\n')) {
      const lines = wrap(paragraph, this.#body, BODY_SIZE, PAGE_WIDTH - MARGIN * 2);
      for (const line of lines) {
        this.#writeLine(line, this.#body, BODY_SIZE);
      }
    }

    return encoded.substituted;
  }

  /** A document with no text at all still has to be a valid PDF. */
  finish(): void {
    if (this.#page === null) this.#newPage();
  }

  #writeLine(line: string, font: PDFFont, size: number): void {
    if (this.#page === null || this.#y < MARGIN) this.#newPage();
    // `#newPage` always assigns, but the compiler cannot see through it.
    this.#page?.drawText(line, { x: MARGIN, y: this.#y, size, font });
    this.#y -= LINE_HEIGHT;
  }

  #advance(points: number): void {
    if (this.#page !== null) this.#y -= points;
  }

  #newPage(): void {
    this.#page = this.#doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.#y = PAGE_HEIGHT - MARGIN;
  }
}

/**
 * Greedy word wrap. Words longer than a line — a long URL, or a base64 blob
 * that survived sanitization — are split by character rather than allowed to
 * run off the page.
 */
function wrap(paragraph: string, font: PDFFont, size: number, maxWidth: number): readonly string[] {
  if (paragraph === '') return [''];

  const lines: string[] = [];
  let current = '';

  for (const word of paragraph.split(/(\s+)/u)) {
    if (word === '') continue;
    const candidate = current + word;

    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current.trim() !== '') {
      lines.push(current.trimEnd());
      current = '';
    }
    if (word.trim() === '') continue;

    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      current = word;
      continue;
    }
    for (const chunk of breakLongWord(word, font, size, maxWidth)) {
      if (font.widthOfTextAtSize(chunk, size) <= maxWidth) {
        current = chunk;
      } else {
        lines.push(chunk);
      }
    }
  }

  if (current !== '') lines.push(current.trimEnd());
  return lines.length > 0 ? lines : [''];
}

function breakLongWord(
  word: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): readonly string[] {
  const chunks: string[] = [];
  let chunk = '';

  for (const character of word) {
    if (chunk !== '' && font.widthOfTextAtSize(chunk + character, size) > maxWidth) {
      chunks.push(chunk);
      chunk = '';
    }
    chunk += character;
  }
  if (chunk !== '') chunks.push(chunk);
  return chunks;
}
