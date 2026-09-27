import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  decodePDFRawStream,
} from '@cantoo/pdf-lib';

/**
 * Vector graphics and text styling read out of a PDF content stream.
 *
 * The bytes of the original page are never copied into the output. Text
 * showing operators are glyph ids, so they are used only as position and
 * colour anchors; the characters themselves come from pdf.js. Image XObjects
 * are skipped so their decoders never run.
 */
export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface PdfTextAnchor {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly color: Rgb;
  readonly bold: boolean;
  readonly mono: boolean;
}

export type PdfShape =
  | {
      readonly kind: 'rect';
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
      readonly fill: Rgb | null;
      readonly stroke: Rgb | null;
      readonly lineWidth: number;
    }
  | {
      readonly kind: 'path';
      /** SVG path in a y-down space whose origin is the top of the page. */
      readonly svg: string;
      readonly fill: Rgb | null;
      readonly stroke: Rgb | null;
      readonly lineWidth: number;
    };

export interface PdfPagePaint {
  readonly width: number;
  readonly height: number;
  readonly shapes: readonly PdfShape[];
  readonly anchors: readonly PdfTextAnchor[];
}

type Matrix = [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export async function readPdfPaint(bytes: Uint8Array): Promise<readonly PdfPagePaint[]> {
  const doc = await PDFDocument.load(bytes, {
    ignoreEncryption: false,
    throwOnInvalidObject: false,
    updateMetadata: false,
  });

  return doc.getPages().map((page) =>
    readPage(doc, page.node, page.getWidth(), page.getHeight()),
  );
}

function readPage(
  doc: PDFDocument,
  pageNode: PDFDict,
  width: number,
  height: number,
): PdfPagePaint {
  const resources = pageNode.lookupMaybe(PDFName.of('Resources'), PDFDict);
  const fonts = fontStyles(doc, resources);
  const shapes: PdfShape[] = [];
  const anchors: PdfTextAnchor[] = [];
  const source = decodeContents(doc, pageNode);

  interpret(doc, source, resources, fonts, IDENTITY, width, height, shapes, anchors, new Set());

  return { width, height, shapes, anchors };
}

function fontStyles(
  doc: PDFDocument,
  resources: PDFDict | undefined,
): ReadonlyMap<string, { bold: boolean; mono: boolean }> {
  const styles = new Map<string, { bold: boolean; mono: boolean }>();
  if (resources === undefined) return styles;
  const fonts = resources.lookupMaybe(PDFName.of('Font'), PDFDict);
  if (fonts === undefined) return styles;

  for (const [name, ref] of fonts.entries()) {
    const font = doc.context.lookup(ref);
    if (!(font instanceof PDFDict)) continue;
    const base = String(font.lookup(PDFName.of('BaseFont')) ?? '');
    styles.set(name.toString(), {
      bold: /bold/iu.test(base),
      mono: /consolas|courier|mono/iu.test(base),
    });
  }
  return styles;
}

function decodeContents(doc: PDFDocument, node: PDFDict): string {
  const contents = node.lookup(PDFName.of('Contents'));
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  let text = '';
  for (const ref of refs) {
    const stream = doc.context.lookup(ref);
    if (!(stream instanceof PDFRawStream)) continue;
    text += Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1');
  }
  return text;
}

interface GraphicsState {
  ctm: Matrix;
  fill: Rgb;
  stroke: Rgb;
  lineWidth: number;
  fontName: string;
  fontSize: number;
  tm: Matrix;
  tlm: Matrix;
}

function interpret(
  doc: PDFDocument,
  source: string,
  resources: PDFDict | undefined,
  fonts: ReadonlyMap<string, { bold: boolean; mono: boolean }>,
  baseCtm: Matrix,
  pageWidth: number,
  pageHeight: number,
  shapes: PdfShape[],
  anchors: PdfTextAnchor[],
  seenForms: Set<PDFDict>,
): void {
  const stack: GraphicsState[] = [];
  const state: GraphicsState = {
    ctm: baseCtm,
    fill: { r: 0, g: 0, b: 0 },
    stroke: { r: 0, g: 0, b: 0 },
    lineWidth: 1,
    fontName: '',
    fontSize: 12,
    tm: IDENTITY,
    tlm: IDENTITY,
  };
  let path: Array<{ op: 'm' | 'l' | 'c'; args: number[] }> = [];
  const operands: unknown[] = [];

  for (const token of tokenize(source)) {
    if (token.kind !== 'op') {
      operands.push(token.value);
      continue;
    }

    const op = token.value;
    const args = operands.splice(0, operands.length);

    switch (op) {
      case 'q':
        stack.push(cloneState(state));
        break;
      case 'Q': {
        const previous = stack.pop();
        if (previous !== undefined) Object.assign(state, previous);
        break;
      }
      case 'cm':
        // Subsequent coordinates are in the new user space, so the operand
        // applies before the CTM already in effect: CTM' = CTM × M.
        if (args.length >= 6) state.ctm = multiply([...state.ctm], nums(args));
        break;
      case 'w':
        state.lineWidth = num(args[0], 1);
        break;
      case 'rg':
      case 'RG': {
        const color = rgbOf(args);
        if (op === 'rg') state.fill = color;
        else state.stroke = color;
        break;
      }
      case 'g':
      case 'G': {
        const gray = num(args[0], 0);
        const color = { r: gray, g: gray, b: gray };
        if (op === 'g') state.fill = color;
        else state.stroke = color;
        break;
      }
      case 'k':
      case 'K': {
        const color = cmykToRgb(args);
        if (op === 'k') state.fill = color;
        else state.stroke = color;
        break;
      }
      case 're':
        path.push({ op: 'm', args: nums(args).slice(0, 2) });
        path.push({
          op: 'l',
          args: [num(args[0]) + num(args[2]), num(args[1])],
        });
        path.push({
          op: 'l',
          args: [num(args[0]) + num(args[2]), num(args[1]) + num(args[3])],
        });
        path.push({ op: 'l', args: [num(args[0]), num(args[1]) + num(args[3])] });
        break;
      case 'm':
        path.push({ op: 'm', args: nums(args).slice(0, 2) });
        break;
      case 'l':
        path.push({ op: 'l', args: nums(args).slice(0, 2) });
        break;
      case 'c':
        path.push({ op: 'c', args: nums(args).slice(0, 6) });
        break;
      case 'h':
        path.push({ op: 'l', args: path.find((entry) => entry.op === 'm')?.args.slice(0, 2) ?? [0, 0] });
        break;
      case 'f':
      case 'F':
      case 'f*':
        commitPath(path, state, pageWidth, pageHeight, true, false, shapes);
        path = [];
        break;
      case 'S':
        commitPath(path, state, pageWidth, pageHeight, false, true, shapes);
        path = [];
        break;
      case 'B':
      case 'B*':
      case 'b':
      case 'b*':
        commitPath(path, state, pageWidth, pageHeight, true, true, shapes);
        path = [];
        break;
      case 'n':
      case 'W':
      case 'W*':
        path = [];
        break;
      case 'BT':
        state.tm = IDENTITY;
        state.tlm = IDENTITY;
        break;
      case 'ET':
        break;
      case 'Tf':
        state.fontName = String(args[0] ?? '');
        state.fontSize = num(args[1], state.fontSize);
        break;
      case 'Tm':
        state.tm = nums(args).slice(0, 6) as Matrix;
        state.tlm = state.tm;
        break;
      case 'Td':
      case 'TD': {
        const [dx, dy] = [num(args[0]), num(args[1])];
        state.tlm = multiply([1, 0, 0, 1, dx, dy], state.tlm);
        state.tm = state.tlm;
        break;
      }
      case 'Tj':
      case 'TJ':
      case "'":
      case '"':
        anchors.push(textAnchor(state, fonts));
        break;
      case 'Do':
        paintForm(doc, resources, String(args[0] ?? ''), state, pageWidth, pageHeight, shapes, anchors, seenForms);
        break;
      default:
        break;
    }
  }
}

function textAnchor(
  state: GraphicsState,
  fonts: ReadonlyMap<string, { bold: boolean; mono: boolean }>,
): PdfTextAnchor {
  const [x, y] = apply(state.ctm, state.tm[4], state.tm[5]);
  const textScale = Math.hypot(state.tm[2], state.tm[3]) || Math.hypot(state.tm[0], state.tm[1]) || 1;
  const ctmScale = Math.hypot(state.ctm[2], state.ctm[3]) || Math.hypot(state.ctm[0], state.ctm[1]) || 1;
  const style = fonts.get(state.fontName) ?? { bold: false, mono: false };
  return {
    x,
    y,
    size: state.fontSize * textScale * ctmScale,
    color: state.fill,
    bold: style.bold,
    mono: style.mono,
  };
}

function commitPath(
  path: readonly { op: 'm' | 'l' | 'c'; args: number[] }[],
  state: GraphicsState,
  pageWidth: number,
  pageHeight: number,
  fill: boolean,
  stroke: boolean,
  shapes: PdfShape[],
): void {
  if (path.length === 0) return;
  const points: Array<{ x: number; y: number }> = [];
  const svg: string[] = [];
  for (const entry of path) {
    const user = entry.args.reduce<number[]>((coords, _value, index) => {
      if (index % 2 === 0) {
        const [x, y] = apply(state.ctm, entry.args[index] ?? 0, entry.args[index + 1] ?? 0);
        coords.push(x, y);
        points.push({ x, y });
      }
      return coords;
    }, []);
    if (entry.op === 'm') svg.push(`M ${svgPoint(user[0] ?? 0, user[1] ?? 0, pageHeight)}`);
    if (entry.op === 'l') svg.push(`L ${svgPoint(user[0] ?? 0, user[1] ?? 0, pageHeight)}`);
    if (entry.op === 'c') {
      svg.push(
        `C ${svgPoint(user[0] ?? 0, user[1] ?? 0, pageHeight)} ${svgPoint(user[2] ?? 0, user[3] ?? 0, pageHeight)} ${svgPoint(user[4] ?? 0, user[5] ?? 0, pageHeight)}`,
      );
    }
  }

  if (points.every((point) => outside(point, pageWidth, pageHeight))) return;

  const scale = Math.hypot(state.ctm[0], state.ctm[1]) || 1;
  shapes.push({
    kind: 'path',
    svg: `${svg.join(' ')} Z`,
    fill: fill ? state.fill : null,
    stroke: stroke ? state.stroke : null,
    lineWidth: Math.max(0.4, state.lineWidth * scale),
  });
}

function outside(point: { x: number; y: number }, width: number, height: number): boolean {
  return point.x < -40 || point.y < -40 || point.x > width + 40 || point.y > height + 40;
}

function svgPoint(x: number, y: number, pageHeight: number): string {
  return `${x.toFixed(2)} ${(pageHeight - y).toFixed(2)}`;
}

function paintForm(
  doc: PDFDocument,
  resources: PDFDict | undefined,
  name: string,
  state: GraphicsState,
  pageWidth: number,
  pageHeight: number,
  shapes: PdfShape[],
  anchors: PdfTextAnchor[],
  seenForms: Set<PDFDict>,
): void {
  if (resources === undefined || !name.startsWith('/')) return;
  const xObjects = resources.lookupMaybe(PDFName.of('XObject'), PDFDict);
  if (xObjects === undefined) return;
  let ref: unknown;
  for (const [key, value] of xObjects.entries()) {
    if (key.toString() === name) ref = value;
  }
  if (ref === undefined) return;
  const stream: unknown = doc.context.lookup(ref as never);
  if (!(stream instanceof PDFRawStream)) return;
  const subtype = stream.dict.lookup(PDFName.of('Subtype'));
  if (String(subtype) !== '/Form') return;
  if (seenForms.has(stream.dict)) return;
  seenForms.add(stream.dict);
  const nestedResources = stream.dict.lookupMaybe(PDFName.of('Resources'), PDFDict) ?? resources;
  const nestedFonts = fontStyles(doc, nestedResources);
  const source = Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1');
  interpret(
    doc,
    source,
    nestedResources,
    nestedFonts,
    state.ctm,
    pageWidth,
    pageHeight,
    shapes,
    anchors,
    seenForms,
  );
}

function cloneState(state: GraphicsState): GraphicsState {
  return {
    ...state,
    fill: state.fill,
    stroke: state.stroke,
    tm: state.tm,
    tlm: state.tlm,
    ctm: state.ctm,
  };
}

function rgbOf(args: readonly unknown[]): Rgb {
  return { r: clamp(num(args[0])), g: clamp(num(args[1])), b: clamp(num(args[2])) };
}

function cmykToRgb(args: readonly unknown[]): Rgb {
  const c = clamp(num(args[0]));
  const m = clamp(num(args[1]));
  const y = clamp(num(args[2]));
  const k = clamp(num(args[3]));
  return {
    r: (1 - c) * (1 - k),
    g: (1 - m) * (1 - k),
    b: (1 - y) * (1 - k),
  };
}

function clamp(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function nums(args: readonly unknown[]): number[] {
  return args.map((value) => num(value));
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** CTM' = M × CTM, matching the PDF `cm` operator for column vectors. */
function multiply(left: number[], right: number[]): Matrix {
  const a = left[0] ?? 1;
  const b = left[1] ?? 0;
  const c = left[2] ?? 0;
  const d = left[3] ?? 1;
  const e = left[4] ?? 0;
  const f = left[5] ?? 0;
  const rightMatrix: Matrix = [
    right[0] ?? 1,
    right[1] ?? 0,
    right[2] ?? 0,
    right[3] ?? 1,
    right[4] ?? 0,
    right[5] ?? 0,
  ];
  return [
    a * rightMatrix[0] + c * rightMatrix[1],
    b * rightMatrix[0] + d * rightMatrix[1],
    a * rightMatrix[2] + c * rightMatrix[3],
    b * rightMatrix[2] + d * rightMatrix[3],
    a * rightMatrix[4] + c * rightMatrix[5] + e,
    b * rightMatrix[4] + d * rightMatrix[5] + f,
  ];
}

function apply(matrix: Matrix, x: number, y: number): [number, number] {
  return [matrix[0] * x + matrix[2] * y + matrix[4], matrix[1] * x + matrix[3] * y + matrix[5]];
}

type Token = { kind: 'val'; value: unknown } | { kind: 'op'; value: string };

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < source.length) {
    const char = source[index] ?? '';
    if (/\s/u.test(char)) {
      index += 1;
      continue;
    }
    if (char === '%') {
      while (index < source.length && source[index] !== '\n' && source[index] !== '\r') index += 1;
      continue;
    }
    if (char === '(') {
      const literal = readLiteral(source, index);
      tokens.push({ kind: 'val', value: literal.value });
      index = literal.index;
      continue;
    }
    if (char === '<') {
      const hex = readHex(source, index);
      tokens.push({ kind: 'val', value: hex.value });
      index = hex.index;
      continue;
    }
    if (char === '[') {
      const array = readArray(source, index);
      tokens.push({ kind: 'val', value: array.value });
      index = array.index;
      continue;
    }
    if (char === ']' || char === '>' || char === ')') {
      index += 1;
      continue;
    }
    if (char === '/') {
      const start = index;
      index += 1;
      while (index < source.length && !isDelimiter(source[index] ?? '')) index += 1;
      tokens.push({ kind: 'val', value: source.slice(start, index) });
      continue;
    }
    if (/[0-9+\-.]/u.test(char)) {
      const start = index;
      index += 1;
      while (index < source.length && /[0-9.+\-eE]/u.test(source[index] ?? '')) index += 1;
      const value = Number(source.slice(start, index));
      if (Number.isFinite(value)) tokens.push({ kind: 'val', value });
      continue;
    }
    const start = index;
    while (index < source.length && !isDelimiter(source[index] ?? '')) index += 1;
    const word = source.slice(start, index);
    if (word.length > 0) tokens.push({ kind: 'op', value: word });
  }

  return tokens;
}

function isDelimiter(char: string): boolean {
  return /[\s()<>[\]{}/%]/u.test(char);
}

function readLiteral(source: string, start: number): { value: string; index: number } {
  let index = start + 1;
  let value = '';
  let depth = 1;
  while (index < source.length && depth > 0) {
    const char = source[index] ?? '';
    if (char === '\\') {
      value += source[index + 1] ?? '';
      index += 2;
      continue;
    }
    if (char === '(') depth += 1;
    if (char === ')') {
      depth -= 1;
      if (depth === 0) break;
    }
    value += char;
    index += 1;
  }
  return { value, index: index + 1 };
}

function readHex(source: string, start: number): { value: string; index: number } {
  const end = source.indexOf('>', start + 1);
  const raw = source.slice(start + 1, end === -1 ? source.length : end);
  return { value: raw, index: end === -1 ? source.length : end + 1 };
}

function readArray(source: string, start: number): { value: unknown[]; index: number } {
  const inner: unknown[] = [];
  let index = start + 1;
  let token = '';
  while (index < source.length && source[index] !== ']') {
    const char = source[index] ?? '';
    if (/\s/u.test(char)) {
      if (token.length > 0) {
        inner.push(Number(token));
        token = '';
      }
      index += 1;
      continue;
    }
    token += char;
    index += 1;
  }
  if (token.length > 0) inner.push(Number(token));
  return { value: inner, index: index + 1 };
}
