import { describe, expect, it } from 'vitest';

import { readDocxPackage, writeSanitizedDocx } from './docx-package.js';
import {
  CELL_BREAK,
  decodeXmlText,
  readWordprocessingPart,
  rewriteXmlText,
  textForNode,
} from './docx-text.js';
import { readZip, writeZip } from './docx-zip.js';

const BODY = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Jo</w:t></w:r><w:r><w:t>hn Doe called.</w:t></w:r></w:p>
    <w:tbl><w:tr>
      <w:tc><w:p><w:r><w:t>Genevieve Beaumont</w:t></w:r></w:p></w:tc>
      <w:tc><w:p><w:r><w:t>Research &amp; Development</w:t></w:r></w:p></w:tc>
    </w:tr></w:tbl>
    <w:p><w:del w:author="Jane Roe"><w:r><w:delText>Jane Roe</w:delText></w:r></w:del></w:p>
  </w:body>
</w:document>`;

describe('docx text nodes', () => {
  it('decodes only predefined entities', () => {
    expect(decodeXmlText('A &amp; B &xxe; &lt;')).toBe('A & B &xxe; <');
  });

  it('keeps table cells apart and gives a split name one placeholder', () => {
    const read = readWordprocessingPart('word/document.xml', BODY, 'body', '');
    expect(read.text).toContain(`Genevieve Beaumont${CELL_BREAK}Research & Development`);

    const nameEnd = read.text.indexOf(' called.');
    const rewritten = rewriteXmlText(
      BODY,
      read.nodes,
      read.text,
      [{ start: 0, end: nameEnd, placeholder: '[PERSON_001]' }],
    );

    expect(rewritten).toContain('<w:t>[PERSON_001]</w:t>');
    expect(rewritten).not.toContain('>hn Doe');
    expect(rewritten).toContain('called.');
    expect(rewritten).toContain('Research &amp; Development');
    expect(rewritten).not.toContain('\u001f');
  });

  it('puts the placeholder on the first run of a multi-run match', () => {
    expect(textForNode('John Doe', 0, 2, [{ start: 0, end: 8, placeholder: '[PERSON_001]' }])).toBe(
      '[PERSON_001]',
    );
    expect(textForNode('John Doe', 2, 8, [{ start: 0, end: 8, placeholder: '[PERSON_001]' }])).toBe('');
  });

  it('clears tracked-change authors and replaces deleted text', () => {
    const read = readWordprocessingPart('word/document.xml', BODY, 'body', '');
    const start = read.text.indexOf('Jane Roe');
    const rewritten = rewriteXmlText(BODY, read.nodes, read.text, [
      { start, end: start + 'Jane Roe'.length, placeholder: '[PERSON_002]' },
    ]);

    expect(rewritten).toContain('<w:delText>[PERSON_002]</w:delText>');
    expect(rewritten).toContain('w:author=""');
    expect(rewritten).not.toContain('Jane Roe');
  });
});

describe('docx zip', () => {
  it('round-trips a part through deflate', () => {
    const packed = writeZip([{ name: 'word/document.xml', data: new TextEncoder().encode(BODY) }]);
    const parts = readZip(packed);
    expect(new TextDecoder().decode(parts[0]?.data)).toBe(BODY);
  });

  it('drops embedded objects and keeps the table text in its cell', () => {
    const packed = writeZip([
      { name: '[Content_Types].xml', data: new TextEncoder().encode('<Types/>') },
      { name: 'word/document.xml', data: new TextEncoder().encode(BODY) },
      { name: 'word/embeddings/oleObject1.bin', data: new Uint8Array([1, 2, 3]) },
      {
        name: 'word/_rels/document.xml.rels',
        data: new TextEncoder().encode(
          '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/oleObject" Target="embeddings/oleObject1.bin"/></Relationships>',
        ),
      },
    ]);

    const source = readDocxPackage(packed);
    const sanitized = writeSanitizedDocx(source, []);
    const names = readZip(sanitized).map((part) => part.name);
    expect(names).not.toContain('word/embeddings/oleObject1.bin');

    const rels = readZip(sanitized).find((part) => part.name.endsWith('.rels'));
    expect(new TextDecoder().decode(rels?.data)).not.toContain('embeddings/');

    const body = readZip(sanitized).find((part) => part.name === 'word/document.xml');
    const xml = new TextDecoder().decode(body?.data);
    expect(xml).toContain('Genevieve Beaumont');
    expect(xml).toContain('Research &amp; Development');
  });
});
