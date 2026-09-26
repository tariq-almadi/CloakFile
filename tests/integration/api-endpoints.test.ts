import { createApp } from '@sds/api/app';
import { loadConfig } from '@sds/api/config';
import type { AnalyzeResponse, CapabilitiesResponse, SanitizeResponse } from '@sds/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SAMPLE_TEXT } from '../fixtures/index.js';

/**
 * Drives the real Fastify app through `inject`, so routing, multipart parsing,
 * validation and error mapping are all exercised without opening a socket.
 */

const BOUNDARY = '----SecureDocumentSanitizerTestBoundary';

/**
 * Builds a multipart body by hand rather than pulling in a form-data library.
 * The wire format is simple, and for a security-sensitive project a test-only
 * dependency is still a supply-chain dependency.
 */
function multipartBody(options: {
  fileName: string;
  contentType: string;
  content: string;
  options?: string;
}): Buffer {
  const parts = [
    `--${BOUNDARY}\r\n`,
    `Content-Disposition: form-data; name="file"; filename="${options.fileName}"\r\n`,
    `Content-Type: ${options.contentType}\r\n\r\n`,
    options.content,
    '\r\n',
  ];

  if (options.options !== undefined) {
    parts.push(
      `--${BOUNDARY}\r\n`,
      'Content-Disposition: form-data; name="options"\r\n\r\n',
      options.options,
      '\r\n',
    );
  }

  parts.push(`--${BOUNDARY}--\r\n`);
  return Buffer.from(parts.join(''), 'utf8');
}

const MULTIPART_HEADERS = { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` };

const DEFAULT_OPTIONS = JSON.stringify({
  enabledTypes: ['PERSON', 'EMAIL', 'PHONE', 'CREDIT_CARD', 'SSN'],
});

describe('API endpoints', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    // `LOG_LEVEL=silent` is not a valid level for this config, so tests run at
    // the configured default and pino writes to stdout. That is safe precisely
    // because the serialisers never include document content.
    app = await createApp(loadConfig({ ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'fatal' }));
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports health', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(response.statusCode).toBe(200);
  });

  it('advertises which formats and detectors actually work', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/capabilities' });
    expect(response.statusCode).toBe(200);

    const body = response.json<CapabilitiesResponse>();

    const txt = body.formats.find((format) => format.format === 'txt');
    expect(txt?.extract).toBe(true);
    expect(txt?.generate).toBe(true);

    // PDF is registered but unimplemented, and says so rather than staying silent.
    const pdf = body.formats.find((format) => format.format === 'pdf');
    expect(pdf?.extract).toBe(false);
    expect(pdf?.capabilities?.mayContainHiddenText).toBe(true);

    const address = body.detection.find((entry) => entry.type === 'ADDRESS');
    expect(address?.maturity).toBe('stub');
  });

  it('runs the full analyze, sanitize and download flow', async () => {
    const analyzeResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/documents/analyze',
      headers: MULTIPART_HEADERS,
      payload: multipartBody({
        fileName: 'notes.txt',
        contentType: 'text/plain',
        content: SAMPLE_TEXT,
        options: DEFAULT_OPTIONS,
      }),
    });

    expect(analyzeResponse.statusCode).toBe(201);
    const analysis = analyzeResponse.json<AnalyzeResponse>();
    expect(analysis.groups.length).toBeGreaterThan(0);

    // The privacy invariant, asserted on the actual HTTP payload.
    expect(analyzeResponse.body).not.toContain('john.doe@example.com');
    expect(analyzeResponse.body).not.toContain('4111 1111 1111 1111');
    expect(analyzeResponse.body).not.toContain('123-45-6789');

    const sanitizeResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/${analysis.sessionId}/sanitize`,
      payload: { excludedPlaceholders: [] },
    });

    expect(sanitizeResponse.statusCode).toBe(200);
    const sanitized = sanitizeResponse.json<SanitizeResponse>();
    expect(sanitized.verification.status).toBe('pass');

    const downloadResponse = await app.inject({
      method: 'GET',
      url: `/api/v1/documents/${analysis.sessionId}/download`,
    });

    expect(downloadResponse.statusCode).toBe(200);
    expect(downloadResponse.headers['content-disposition']).toContain('attachment');
    expect(downloadResponse.headers['cache-control']).toContain('no-store');
    expect(downloadResponse.body).not.toContain('john.doe@example.com');
    expect(downloadResponse.body).toContain('[EMAIL_001]');

    // The user can make the server forget the document immediately.
    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: `/api/v1/documents/${analysis.sessionId}`,
    });
    expect(deleteResponse.statusCode).toBe(204);

    const afterDelete = await app.inject({
      method: 'GET',
      url: `/api/v1/documents/${analysis.sessionId}/download`,
    });
    expect(afterDelete.statusCode).toBe(404);
  });

  it('rejects an upload with no category selected', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/documents/analyze',
      headers: MULTIPART_HEADERS,
      payload: multipartBody({
        fileName: 'notes.txt',
        contentType: 'text/plain',
        content: 'hello',
        options: JSON.stringify({ enabledTypes: [] }),
      }),
    });

    expect(response.statusCode).toBe(400);
  });

  it('refuses a PDF with a specific not-implemented error rather than a generic failure', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/documents/analyze',
      headers: MULTIPART_HEADERS,
      payload: multipartBody({
        fileName: 'report.pdf',
        contentType: 'application/pdf',
        content: '%PDF-1.7\nnot a real pdf',
        options: DEFAULT_OPTIONS,
      }),
    });

    expect(response.statusCode).toBe(501);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('NOT_IMPLEMENTED');
  });

  it('rejects a file whose bytes are not a supported document, despite its extension', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/documents/analyze',
      headers: MULTIPART_HEADERS,
      payload: multipartBody({
        fileName: 'notes.txt',
        contentType: 'text/plain',
        content: '\u0000\u0000binary payload',
        options: DEFAULT_OPTIONS,
      }),
    });

    expect(response.statusCode).toBe(415);
  });

  it('returns 404 for an unknown session without leaking whether it ever existed', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/documents/00000000-0000-4000-8000-000000000000/sanitize',
      payload: { excludedPlaceholders: [] },
    });

    expect(response.statusCode).toBe(404);
  });
});
