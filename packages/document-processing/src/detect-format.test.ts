import { UnsupportedFormatError } from '@cloakfile/shared';
import { describe, expect, it } from 'vitest';

import { detectFormat } from './detect-format.js';

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe('detectFormat', () => {
  it('identifies a PDF by signature regardless of its extension', () => {
    const result = detectFormat(bytes('%PDF-1.7\n...'), { declaredExtension: 'txt' });

    expect(result.format).toBe('pdf');
    expect(result.evidence).toBe('signature');
    expect(result.declarationMismatch).toBe(true);
  });

  it('identifies JSON by parsing it, not by its extension', () => {
    expect(detectFormat(bytes('{"a":1}'), { declaredExtension: 'txt' }).format).toBe('json');
  });

  it('treats a .json file that is not valid JSON as text', () => {
    expect(detectFormat(bytes('not json at all'), { declaredExtension: 'json' }).format).toBe(
      'txt',
    );
  });

  it('rejects a ZIP that is not a Word document', () => {
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
    expect(() => detectFormat(zip)).toThrow(UnsupportedFormatError);
  });

  it('rejects binary content wearing a text extension', () => {
    // Lone continuation bytes are not valid UTF-8.
    const binary = new Uint8Array([0x80, 0x81, 0x82, 0xfe, 0xff]);
    expect(() => detectFormat(binary, { declaredExtension: 'txt' })).toThrow(
      UnsupportedFormatError,
    );
  });

  it('rejects text containing null bytes', () => {
    expect(() => detectFormat(bytes('hello\u0000world'))).toThrow(UnsupportedFormatError);
  });

  it('recognises CSV shape when no extension is supplied', () => {
    expect(detectFormat(bytes('a,b,c\n1,2,3\n4,5,6')).format).toBe('csv');
  });

  it('does not mistake ordinary prose for CSV', () => {
    expect(detectFormat(bytes('Hello there.\nThis is a note.')).format).toBe('txt');
  });
});
