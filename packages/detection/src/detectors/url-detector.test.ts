import { describe, expect, it } from 'vitest';

import { UrlDetector } from './url-detector.js';

describe('UrlDetector', () => {
  const detector = new UrlDetector();

  it('stops at the PDF block separator so the next cell is not part of the URL', () => {
    const text = 'Client Portal URL\u001fhttps://example.com/account\u001fWeb Link';
    const hits = detector.detect({ text });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.value).toBe('https://example.com/account');
    expect(hits[0]?.end).toBe(text.indexOf('\u001fWeb'));
  });
});
