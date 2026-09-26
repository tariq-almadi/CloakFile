import { createDefaultRegistry } from '@sds/detection';
import { createDefaultDocumentRegistry } from '@sds/document-processing';
import { PII_TYPE_LABELS, type CapabilitiesResponse } from '@sds/shared';
import type { FastifyInstance } from 'fastify';

import type { AppConfig } from '../config.js';

/**
 * Tells the client what this deployment can actually do.
 *
 * This endpoint is how the product stays honest. The UI builds its category
 * checkboxes and its format list from this response, so a `stub` detector or an
 * unimplemented format shows up as such in the interface rather than as a
 * checkbox that quietly does nothing. Hard-coding the list in the frontend
 * would let the two drift, and the drift would always fail in the dangerous
 * direction: claiming more coverage than exists.
 */
export function registerCapabilitiesRoutes(app: FastifyInstance, config: AppConfig): void {
  app.get('/api/v1/capabilities', (): CapabilitiesResponse => {
    const detectors = createDefaultRegistry();
    const documents = createDefaultDocumentRegistry();

    return {
      formats: documents.support(),
      detection: detectors.coverage().map((coverage) => ({
        type: coverage.type,
        label: PII_TYPE_LABELS[coverage.type],
        maturity: coverage.maturity,
        detectors: coverage.detectors,
      })),
      limits: {
        maxFileBytes: config.env.UPLOAD_MAX_FILE_BYTES,
        sessionTtlSeconds: config.env.SESSION_TTL_SECONDS,
      },
    };
  });
}
