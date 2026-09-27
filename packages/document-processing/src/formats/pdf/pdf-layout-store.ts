import type { ExtractedDocument } from '@cloakfile/shared';

import type { PdfShape, Rgb } from './pdf-vector-paint.js';

export interface PdfPlacedRun {
  readonly start: number;
  readonly end: number;
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly width: number;
  readonly color: Rgb;
  readonly bold: boolean;
  readonly mono: boolean;
}

export interface PdfPagePlan {
  readonly width: number;
  readonly height: number;
  readonly shapes: readonly PdfShape[];
  readonly runs: readonly PdfPlacedRun[];
}

export interface PdfRebuildPlan {
  readonly pages: readonly PdfPagePlan[];
}

const plans = new WeakMap<ExtractedDocument, PdfRebuildPlan>();

/** Keeps paint instructions off the wire format. They live only on this object. */
export function rememberPdfPlan(document: ExtractedDocument, plan: PdfRebuildPlan): void {
  plans.set(document, plan);
}

export function pdfPlanFor(document: ExtractedDocument): PdfRebuildPlan | undefined {
  return plans.get(document);
}
