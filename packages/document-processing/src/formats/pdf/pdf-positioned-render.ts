import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from '@cantoo/pdf-lib';
import type { ExtractedDocument } from '@cloakfile/shared';

import { toEncodableText } from './pdf-fonts.js';
import type { PdfRebuildPlan } from './pdf-layout-store.js';
import { findOverflowContinuation, resolveDrawX } from './pdf-run-layout.js';
import { sanitizedBoundaries, type BoundaryReplacement } from './pdf-text-align.js';
import type { PdfShape } from './pdf-vector-paint.js';

/**
 * Draws a new PDF that keeps the original positions, sizes, colours and vector
 * rules, with sensitive runs already replaced in `sanitizedText`.
 *
 * Nothing is copied from the source content stream. Shapes are replayed as
 * plain paths and text is written with standard fonts, so subset-font glyph
 * ids and hidden objects from the upload cannot survive.
 */
export async function renderPositionedPdf(
  source: ExtractedDocument,
  sanitizedText: string,
  plan: PdfRebuildPlan,
  replacements: readonly BoundaryReplacement[] = [],
): Promise<{ bytes: Uint8Array; substituted: number }> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);
  const monoBold = await doc.embedFont(StandardFonts.CourierBold);
  const charset = new Set(regular.getCharacterSet());
  const boundaries = sanitizedBoundaries(source.text, sanitizedText, replacements);
  let substituted = 0;

  for (const pagePlan of plan.pages) {
    const page = doc.addPage([pagePlan.width, pagePlan.height]);
    for (const shape of pagePlan.shapes) drawShape(page, shape, pagePlan.height);

    const painted = pagePlan.runs
      .map((run) => ({
        run,
        text: sanitizedText.slice(boundaries[run.start] ?? 0, boundaries[run.end] ?? 0),
      }))
      .sort((a, b) => b.run.y - a.run.y || a.run.x - b.run.x);

    const pageRight = pagePlan.width - 36;
    relocateOverflowingPlaceholders(painted, pageRight, regular, bold, mono, monoBold);

    let previous: DrawCursor | null = null;

    for (const current of painted) {
      const prior: DrawCursor | null = previous;
      const startsLine =
        prior === null || Math.abs(current.run.y - prior.y) > 2 || current.run.x < prior.x - 1;

      if (current.text.length === 0) {
        previous = cursorAfterRemovedRun(prior, current.run, startsLine);
        continue;
      }

      const encoded = toEncodableText(current.text, charset);
      substituted += encoded.substituted;
      const font = pickFont(current.run.bold, current.run.mono, regular, bold, mono, monoBold);
      const size = current.run.size;
      const textWidth = font.widthOfTextAtSize(encoded.text, size);
      let x = resolveDrawX(
        current.run,
        prior === null || startsLine
          ? null
          : { run: prior, drawX: prior.drawX, drawnWidth: prior.drawnWidth },
        { textWidth, pageRight },
      );
      let drawSize = size;
      let drawWidth = textWidth;
      while (x + drawWidth > pageRight && drawSize > size * 0.55) {
        drawSize *= 0.9;
        drawWidth = font.widthOfTextAtSize(encoded.text, drawSize);
      }
      if (x + drawWidth > pageRight) {
        x = Math.max(36, pageRight - drawWidth);
      }

      page.drawText(encoded.text, {
        x,
        y: current.run.y,
        size: drawSize,
        font,
        color: rgb(current.run.color.r, current.run.color.g, current.run.color.b),
      });

      previous = {
        x: current.run.x,
        y: current.run.y,
        width: current.run.width,
        drawX: x,
        drawnWidth: drawWidth,
      };
    }
  }

  for (const segment of source.segments) {
    if (segment.region === 'body') continue;
    const text = sanitizedText.slice(boundaries[segment.start] ?? 0, boundaries[segment.end] ?? 0).trim();
    if (text.length === 0) continue;
    const page = doc.addPage();
    const encoded = toEncodableText(text, charset);
    substituted += encoded.substituted;
    page.drawText(encoded.text, { x: 54, y: 740, size: 11, font: regular, color: rgb(0, 0, 0), maxWidth: 500 });
  }

  const epoch = new Date(0);
  doc.setProducer('CloakFile');
  doc.setCreator('CloakFile');
  doc.setCreationDate(epoch);
  doc.setModificationDate(epoch);

  return { bytes: await doc.save({ useObjectStreams: true }), substituted };
}

interface DrawCursor {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly drawX: number;
  readonly drawnWidth: number;
}

interface MutablePainted {
  run: {
    readonly start: number;
    readonly end: number;
    readonly x: number;
    readonly y: number;
    readonly size: number;
    readonly width: number;
    readonly color: { readonly r: number; readonly g: number; readonly b: number };
    readonly bold: boolean;
    readonly mono: boolean;
  };
  text: string;
}

function relocateOverflowingPlaceholders(
  painted: MutablePainted[],
  pageRight: number,
  regular: PDFFont,
  bold: PDFFont,
  mono: PDFFont,
  monoBold: PDFFont,
): void {
  for (let index = 0; index < painted.length; index += 1) {
    const current = painted[index];
    if (current === undefined || current.text.length === 0) continue;
    if (!/\[[A-Z_]+_\d{3}\]/u.test(current.text) && !current.text.includes('[')) continue;

    const font = pickFont(current.run.bold, current.run.mono, regular, bold, mono, monoBold);
    const width = font.widthOfTextAtSize(current.text, current.run.size);
    if (current.run.x + width <= pageRight) continue;

    const target = findOverflowContinuation(painted, index);
    const destination = target >= 0 ? painted[target] : undefined;
    if (destination === undefined || destination.text.length > 0) continue;

    destination.text = current.text;
    current.text = '';
  }
}

function cursorAfterRemovedRun(
  prior: DrawCursor | null,
  run: { readonly x: number; readonly y: number; readonly width: number },
  startsLine: boolean,
): DrawCursor {
  const carried = prior === null ? run.x : prior.drawX + prior.drawnWidth;
  return {
    x: run.x,
    y: run.y,
    width: run.width,
    drawX: startsLine ? run.x : carried,
    drawnWidth: 0,
  };
}

function drawShape(page: PDFPage, shape: PdfShape, pageHeight: number): void {
  if (shape.kind !== 'path' || shape.svg.length === 0) return;
  if (shape.fill === null && shape.stroke === null) return;
  page.drawSvgPath(shape.svg, {
    x: 0,
    y: pageHeight,
    ...(shape.fill === null ? {} : { color: rgb(shape.fill.r, shape.fill.g, shape.fill.b) }),
    ...(shape.stroke === null
      ? { borderWidth: 0 }
      : {
          borderColor: rgb(shape.stroke.r, shape.stroke.g, shape.stroke.b),
          borderWidth: shape.lineWidth,
        }),
  });
}

function pickFont(
  isBold: boolean,
  isMono: boolean,
  regular: PDFFont,
  bold: PDFFont,
  mono: PDFFont,
  monoBold: PDFFont,
): PDFFont {
  if (isMono && isBold) return monoBold;
  if (isMono) return mono;
  if (isBold) return bold;
  return regular;
}
