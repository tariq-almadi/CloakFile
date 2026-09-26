/**
 * PDF fixtures, built in code rather than committed as binaries.
 *
 * Two reasons this matters more than it looks:
 *
 * 1. **Reviewability.** A committed `.pdf` is opaque in a diff. Nobody can see
 *    what changed, and nobody can see what is in it. A builder function is
 *    readable, and the thing a reviewer is checking — "does this fixture
 *    contain real personal data?" — is answerable by reading it.
 * 2. **Intent.** Every hostile property below exists deliberately and is
 *    labelled. Downloading a scary PDF from somewhere would give us coverage we
 *    could not explain.
 *
 * As with all fixtures in this repository, every value is synthetic:
 * `4111 1111 1111 1111` is the documented Visa test number, phone numbers use
 * the reserved 555 block, and `example.com` is reserved by RFC 2606.
 */

import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib';

/** Values a sanitized derivative of `hostilePdf()` must not contain anywhere. */
export const HOSTILE_PDF_SECRETS = [
  'John Doe',
  '514-555-0132',
  '4111 1111 1111 1111',
  '4111111111111111',
  'john.doe@example.com',
  'ORPHAN-SECRET',
  'Acme Scanner Ltd',
  'attachment-secret-payload',
] as const;

/** An ordinary one-page PDF with selectable text. */
export async function simpleTextPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  page.drawText("John Doe's phone number is +1 514-555-0132.", { x: 54, y: 700, size: 12, font });
  page.drawText('Card 4111 1111 1111 1111, email john.doe@example.com', {
    x: 54,
    y: 680,
    size: 12,
    font,
  });
  // A second, plainly-worded mention. The NLP detector is lexicon-driven and
  // its recall depends on surrounding context, so a fixture that names someone
  // exactly once tests the detector's luck rather than the pipeline.
  page.drawText('John Doe signed the form on Tuesday.', { x: 54, y: 660, size: 12, font });
  doc.setTitle('John Doe record');
  doc.setAuthor('John Doe');
  return await doc.save();
}

export async function multiPagePdf(pageCount: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let index = 1; index <= pageCount; index += 1) {
    const page = doc.addPage([612, 792]);
    page.drawText(`Page ${String(index)}: contact john.doe@example.com`, {
      x: 54,
      y: 700,
      size: 12,
      font,
    });
  }
  return await doc.save();
}

/**
 * Every channel that can carry text past a naive sanitizer, in one file:
 *
 *   - visible page text
 *   - invisible text in render mode 3, i.e. an OCR layer
 *   - a text annotation
 *   - an AcroForm widget with a field value
 *   - `/Info` document properties
 *   - an XMP metadata packet
 *   - an embedded file
 *   - an object that nothing references, which pdf-lib's re-save would keep
 *
 * Hand-written rather than produced by a library, because no library will
 * cooperatively build something this badly behaved.
 */
export function hostilePdf(): Uint8Array {
  const content =
    'BT /F1 12 Tf 54 700 Td (John Doe called from +1 514-555-0132.) Tj ET\n' +
    'BT 3 Tr /F1 12 Tf 54 680 Td (OCR layer: card 4111 1111 1111 1111) Tj ET\n';
  const xmp =
    '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>' +
    '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
    '<rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>John Doe</dc:creator></rdf:Description>' +
    '</rdf:RDF></x:xmpmeta><?xpacket end="w"?>';
  const attachment = 'attachment-secret-payload';
  const orphan = 'BT /F1 12 Tf 54 600 Td (ORPHAN-SECRET John Doe) Tj ET\n';

  return assemble([
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R /Metadata 9 0 R /AcroForm << /Fields [ 12 0 R ] >> ' +
      '/Names << /EmbeddedFiles << /Names [ (secret.txt) 10 0 R ] >> >> >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [ 3 0 R ] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ' +
      '/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R /Annots [ 6 0 R 12 0 R ] >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    `5 0 obj\n<< /Length ${String(content.length)} >>\nstream\n${content}endstream\nendobj\n`,
    '6 0 obj\n<< /Type /Annot /Subtype /Text /Rect [100 100 200 200] ' +
      '/Contents (Reviewer note: reach John Doe at john.doe@example.com) >>\nendobj\n',
    `7 0 obj\n<< /Length ${String(orphan.length)} >>\nstream\n${orphan}endstream\nendobj\n`,
    '8 0 obj\n<< /Producer (Acme Scanner Ltd) /Author (John Doe) /Title (John Doe medical record) >>\nendobj\n',
    `9 0 obj\n<< /Type /Metadata /Subtype /XML /Length ${String(xmp.length)} >>\nstream\n${xmp}\nendstream\nendobj\n`,
    '10 0 obj\n<< /Type /Filespec /F (secret.txt) /EF << /F 11 0 R >> >>\nendobj\n',
    `11 0 obj\n<< /Length ${String(attachment.length)} >>\nstream\n${attachment}\nendstream\nendobj\n`,
    '12 0 obj\n<< /Type /Annot /Subtype /Widget /FT /Tx /T (patient_name) /V (John Doe) ' +
      '/Rect [54 500 300 520] >>\nendobj\n',
  ]);
}

/**
 * A page that paints an image and shows no text — what a scan looks like.
 *
 * The "image" is a single grey pixel. What matters is the `/Subtype /Image`
 * XObject in the page resources, because that is the signal the extractor
 * reads to decide a page is unreadable rather than merely blank.
 */
export function imageOnlyPdf(): Uint8Array {
  const pixel = '\u00ff\u00ff\u00ff';
  const content = 'q 612 0 0 792 0 0 cm /Im1 Do Q\n';

  return assemble([
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [ 3 0 R ] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ' +
      '/Resources << /XObject << /Im1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n',
    `4 0 obj\n<< /Length ${String(content.length)} >>\nstream\n${content}endstream\nendobj\n`,
    '5 0 obj\n<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB ' +
      `/BitsPerComponent 8 /Length ${String(pixel.length)} >>\nstream\n${pixel}\nendstream\nendobj\n`,
  ]);
}

/** A page with no text and no images: genuinely blank, not a scan. */
export function blankPdf(): Uint8Array {
  return assemble([
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [ 3 0 R ] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n',
    '4 0 obj\n<< /Length 0 >>\nstream\n\nendstream\nendobj\n',
  ]);
}

/** Bytes that are not a PDF at all. */
export function notAPdf(): Uint8Array {
  return new TextEncoder().encode('This is a plain text file pretending to be a PDF.');
}

/** A real PDF with junk in front of the header, so two parsers could disagree. */
export function prefixedPdf(prefix: string): Uint8Array {
  const body = hostilePdf();
  const out = new Uint8Array(prefix.length + body.length);
  out.set(new TextEncoder().encode(prefix), 0);
  out.set(body, prefix.length);
  return out;
}

/** A PDF header followed by nothing usable. */
export function truncatedPdf(): Uint8Array {
  return latin1('%PDF-1.7\n1 0 obj\n<< /Type /Catalog');
}

function assemble(objects: readonly string[]): Uint8Array {
  let pdf = '%PDF-1.7\n';
  const offsets: number[] = [];
  for (const object of objects) {
    offsets.push(pdf.length);
    pdf += object;
  }

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${String(objects.length + 1)}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;

  const info = objects.some((object) => object.startsWith('8 0 obj')) ? ' /Info 8 0 R' : '';
  pdf += `trailer\n<< /Size ${String(objects.length + 1)} /Root 1 0 R${info} >>\n`;
  pdf += `startxref\n${String(xrefStart)}\n%%EOF\n`;

  return latin1(pdf);
}

/** PDF syntax is byte-oriented; a UTF-8 encoder would corrupt stream lengths. */
function latin1(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) {
    bytes[index] = text.charCodeAt(index) & 0xff;
  }
  return bytes;
}
