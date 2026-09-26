import { PDFDict, PDFDocument, PDFName, PDFRawStream } from '@cantoo/pdf-lib';
import { MalformedDocumentError, PDF_MAX_INDIRECT_OBJECTS, SuspiciousDocumentError } from '@cloakfile/shared';

/**
 * Structural inspection of an *uploaded* PDF, using pdf-lib's object parser.
 *
 * ---------------------------------------------------------------------------
 * Why not just ask pdf.js
 * ---------------------------------------------------------------------------
 * The obvious way to find out whether a page is a scan is to build its operator
 * list and look for image-painting operators. Doing that decodes the images —
 * pdf.js would run its JBIG2 and JPEG2000 decoders over attacker-controlled
 * bytes, and those are historically the most vulnerable parts of any PDF stack.
 * We need one bit of information ("is there an image here"), not the pixels.
 *
 * Reading the resource dictionary answers the question without decoding
 * anything, so the image decoders are never entered at all.
 */

export interface PdfStructure {
  readonly objectCount: number;
  /** One-based page numbers that reference at least one image XObject. */
  readonly pagesWithImages: ReadonlySet<number>;
}

export async function inspectPdfStructure(bytes: Uint8Array): Promise<PdfStructure> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, {
      ignoreEncryption: false,
      throwOnInvalidObject: false,
      updateMetadata: false,
    });
  } catch {
    // Cause dropped: pdf-lib errors quote the offending bytes, which here are
    // the user's document (ARCHITECTURE §10).
    throw new MalformedDocumentError('This PDF could not be parsed.');
  }

  const objectCount = doc.context.enumerateIndirectObjects().length;
  if (objectCount > PDF_MAX_INDIRECT_OBJECTS) {
    throw new SuspiciousDocumentError(
      `This PDF contains ${String(objectCount)} objects, above the ${String(PDF_MAX_INDIRECT_OBJECTS)} processing limit.`,
    );
  }

  const pagesWithImages = new Set<number>();
  try {
    for (const [index, page] of doc.getPages().entries()) {
      const resources = page.node.lookupMaybe(PDFName.of('Resources'), PDFDict);
      if (resources !== undefined && hasImageXObject(resources, new Set())) {
        pagesWithImages.add(index + 1);
      }
    }
  } catch {
    // `load` succeeds on a file whose page tree is broken or missing, and the
    // failure only surfaces on traversal. A document we cannot walk is one we
    // cannot make promises about, so it is refused here rather than partially
    // processed. Cause dropped for the usual reason: it quotes the bytes.
    throw new MalformedDocumentError('This PDF could not be parsed.');
  }

  return { objectCount, pagesWithImages };
}

/**
 * An image can sit directly in the page's resources or inside a nested Form
 * XObject, so this recurses — bounded by a visited set, because a hostile file
 * can make the resource graph cyclic.
 */
function hasImageXObject(resources: PDFDict, seen: Set<PDFDict>): boolean {
  if (seen.has(resources)) return false;
  seen.add(resources);

  const xObjects = resources.lookupMaybe(PDFName.of('XObject'), PDFDict);
  if (xObjects === undefined) return false;

  for (const [, ref] of xObjects.entries()) {
    const entry: unknown = resources.context.lookup(ref);
    if (!(entry instanceof PDFRawStream)) continue;

    const subtype = entry.dict.get(PDFName.of('Subtype'));
    if (subtype === PDFName.of('Image')) return true;

    if (subtype === PDFName.of('Form')) {
      const nested = entry.dict.lookupMaybe(PDFName.of('Resources'), PDFDict);
      if (nested !== undefined && hasImageXObject(nested, seen)) return true;
    }
  }

  return false;
}
