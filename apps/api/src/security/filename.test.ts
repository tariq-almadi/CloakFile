import { describe, expect, it } from 'vitest';

import { toSafeFileName } from './filename.js';

describe('toSafeFileName', () => {
  it('strips path components', () => {
    expect(toSafeFileName('../../etc/passwd', 'txt')).toBe('passwd.txt');
    expect(toSafeFileName('C:\\Windows\\System32\\notes.txt', 'txt')).toBe('notes.txt');
  });

  it('removes characters that could break a header or the DOM', () => {
    expect(toSafeFileName('re"port\r\nX-Evil: 1.txt', 'txt')).not.toMatch(/["\r\n]/u);
    expect(toSafeFileName('<script>alert(1)</script>.txt', 'txt')).not.toMatch(/[<>]/u);
  });

  it('uses the detected format for the extension, not the uploaded one', () => {
    expect(toSafeFileName('invoice.pdf', 'txt')).toBe('invoice.txt');
  });

  it('never produces a hidden or empty filename', () => {
    expect(toSafeFileName('...', 'txt')).toBe('document.txt');
    expect(toSafeFileName('', 'txt')).toBe('document.txt');
    expect(toSafeFileName('.env', 'txt')).toBe('document.txt');
  });

  it('bounds the length', () => {
    expect(toSafeFileName(`${'a'.repeat(500)}.txt`, 'txt').length).toBeLessThanOrEqual(84);
  });
});
