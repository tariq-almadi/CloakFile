import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';

import type { AppConfig } from '../config.js';

/**
 * HTTP-layer hardening. Each plugin here addresses a specific entry in
 * docs/THREAT-MODEL.md.
 */
export async function registerSecurityPlugins(
  app: FastifyInstance,
  config: AppConfig,
): Promise<void> {
  await app.register(helmet, {
    // The API serves JSON and file downloads, never HTML, so the strictest
    // possible policy applies: nothing may be loaded or executed from a
    // response. This is the main defence if a malicious document's contents
    // ever reached a response body.
    contentSecurityPolicy: {
      directives: {
        'default-src': ["'none'"],
        'frame-ancestors': ["'none'"],
        'base-uri': ["'none'"],
        'form-action': ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'no-referrer' },
  });

  await app.register(cors, {
    // `true` reflects the request Origin — used on Vercel where preview URLs
    // change per deployment. Locally we stick to an explicit allow-list.
    origin: config.env.API_TRUST_PROXY ? true : [...config.corsOrigins],
    methods: ['GET', 'POST', 'DELETE'],
    // No cookies are used, which is what keeps this API free of CSRF exposure:
    // a cross-site request cannot carry ambient credentials, so there is nothing
    // for an attacker to ride. Session ids travel in the URL path and are
    // unguessable UUIDs held only by the client that created them.
    credentials: false,
    maxAge: 600,
  });

  await app.register(rateLimit, {
    max: config.env.RATE_LIMIT_MAX_REQUESTS,
    timeWindow: config.env.RATE_LIMIT_WINDOW,
  });

  await app.register(multipart, {
    limits: {
      // Enforced by the framework as the stream arrives, before we allocate a
      // buffer. The application-level check in `validateUpload` is a second
      // layer, not the first.
      fileSize: config.env.UPLOAD_MAX_FILE_BYTES,
      files: config.env.UPLOAD_MAX_FILES,
      // A multipart body with thousands of tiny fields is its own DoS vector.
      fields: 10,
      fieldSize: 64 * 1024,
      headerPairs: 64,
    },
    // Never write to disk. See `EphemeralSessionStore` for the reasoning.
    attachFieldsToBody: false,
  });
}
