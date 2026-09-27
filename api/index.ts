/**
 * Vercel serverless entry: one warm Fastify instance handles `/api/*`.
 *
 * Sessions live in memory on that instance. Analyze → sanitize → download must
 * hit a warm function; a cold start between steps will look like an expired
 * session.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { FastifyInstance } from 'fastify';

import { createApp } from '../apps/api/dist/app.js';
import { loadConfig } from '../apps/api/dist/config.js';

let appPromise: Promise<FastifyInstance> | undefined;

async function getApp(): Promise<FastifyInstance> {
  if (appPromise === undefined) {
    appPromise = createApp(
      loadConfig({
        ...process.env,
        NODE_ENV: process.env['NODE_ENV'] ?? 'production',
        API_TRUST_PROXY: process.env['API_TRUST_PROXY'] ?? 'true',
        API_HOST: process.env['API_HOST'] ?? '0.0.0.0',
        API_PORT: process.env['API_PORT'] ?? '3001',
      }),
    );
  }
  return await appPromise;
}

function restoreApiUrl(req: VercelRequest): void {
  const candidates = [
    req.headers['x-forwarded-uri'],
    req.headers['x-vercel-forwarded-uri'],
    req.headers['x-invoke-path'],
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.startsWith('/api/')) {
      const queryIndex = typeof req.url === 'string' ? req.url.indexOf('?') : -1;
      const query = queryIndex >= 0 && typeof req.url === 'string' ? req.url.slice(queryIndex) : '';
      req.url = candidate.includes('?') ? candidate : `${candidate}${query}`;
      return;
    }
  }

  // Rewrite destination is `/api` — rebuild from the matched path group if present.
  if (typeof req.url === 'string' && !req.url.startsWith('/api/v1')) {
    const match = /\/api(?:\/index)?\/?(.*)$/u.exec(req.url);
    if (match?.[1] !== undefined && match[1].length > 0) {
      req.url = `/api/${match[1]}`;
    }
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  restoreApiUrl(req);
  const app = await getApp();
  await app.ready();
  app.server.emit('request', req, res);
}
