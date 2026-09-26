import type { FastifyInstance } from 'fastify';

/**
 * Liveness endpoint. Deliberately says nothing about load, sessions in flight
 * or configuration — that is operational detail an unauthenticated caller has
 * no business learning.
 */
export function registerHealthRoutes(app: FastifyInstance): void {
  app.get('/api/v1/health', () => ({ status: 'ok' as const }));
}
