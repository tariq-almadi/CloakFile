import Fastify, { type FastifyInstance } from 'fastify';

import { loadConfig, type AppConfig } from './config.js';
import { DocumentsController } from './controllers/documents-controller.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { registerSecurityPlugins } from './plugins/security.js';
import { registerCapabilitiesRoutes } from './routes/capabilities.js';
import { registerDocumentRoutes } from './routes/documents.js';
import { registerHealthRoutes } from './routes/health.js';
import { buildLoggerOptions } from './security/logging.js';
import { EphemeralSessionStore } from './services/session-store.js';

/**
 * Builds the server without starting it, so tests can drive it through
 * `app.inject()` and never open a port.
 */
export async function createApp(config: AppConfig = loadConfig()): Promise<FastifyInstance> {
  const app = Fastify({
    logger: buildLoggerOptions(config.env.LOG_LEVEL),
    // Fastify generates request ids; trusting a client-supplied one would let a
    // caller forge or collide log correlation ids.
    requestIdHeader: false,
    // A hard ceiling below the multipart limit for anything that is not a file
    // upload, so a JSON body cannot be used to exhaust memory.
    bodyLimit: 1024 * 1024,
    // `trustProxy` stays off: rate limiting keys on the peer address, and
    // trusting X-Forwarded-For without a known proxy in front lets a client
    // spoof its identity. Turn this on only together with a real proxy config.
    trustProxy: false,
  });

  await registerSecurityPlugins(app, config);
  registerErrorHandler(app);

  const sessions = new EphemeralSessionStore({
    ttlSeconds: config.env.SESSION_TTL_SECONDS,
    maxEntries: config.env.SESSION_MAX_ENTRIES,
  });
  const controller = new DocumentsController(sessions, config);

  registerHealthRoutes(app);
  registerCapabilitiesRoutes(app, config);
  registerDocumentRoutes(app, controller);

  // Expired sessions are swept on write, but an idle server would otherwise
  // hold a document in memory until the next upload. `unref` keeps the timer
  // from holding the process open.
  const sweeper = setInterval(() => {
    sessions.pruneExpired();
  }, 60_000);
  sweeper.unref();

  app.addHook('onClose', () => {
    clearInterval(sweeper);
    sessions.clear();
  });

  return app;
}
