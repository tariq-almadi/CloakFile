import { isAppError, type ErrorCode, type ErrorResponse } from '@cloakfile/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

const STATUS_BY_CODE: Readonly<Record<ErrorCode, number>> = {
  INVALID_INPUT: 400,
  UNSUPPORTED_FORMAT: 415,
  FILE_TOO_LARGE: 413,
  MALFORMED_DOCUMENT: 422,
  SUSPICIOUS_DOCUMENT: 422,
  NOT_IMPLEMENTED: 501,
  SESSION_NOT_FOUND: 404,
  SESSION_EXPIRED: 410,
  CAPACITY_EXCEEDED: 503,
  VERIFICATION_FAILED: 422,
  INTERNAL_ERROR: 500,
};

/**
 * The single exit point for every error.
 *
 * Two rules:
 *
 *   1. Only errors this codebase raised on purpose (`AppError`) get their
 *      message through to the client. Anything else — a parser throwing on
 *      malformed input, a library assertion — is reported generically, because
 *      such messages routinely quote the input that caused them, and the input
 *      here is a sensitive document.
 *
 *   2. Every response carries the request id, so a user can report a failure and
 *      an operator can find the corresponding log line without the log line
 *      needing to contain anything about the document.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: unknown, request: FastifyRequest, reply: FastifyReply) => {
    const requestId = request.id;

    if (isAppError(error)) {
      const status = STATUS_BY_CODE[error.code];

      request.log.warn({ err: error, code: error.code, status }, 'request rejected');

      const body: ErrorResponse = {
        error: {
          code: error.code,
          message: error.safeToExpose ? error.message : 'The request could not be completed.',
          ...(error.details === undefined ? {} : { details: { ...error.details } }),
          requestId,
        },
      };
      return reply.status(status).send(body);
    }

    // Fastify's own errors (payload too large, malformed multipart) carry a
    // statusCode and a message written for developers, not an echo of input.
    const fastifyStatus = readFastifyStatus(error);
    if (fastifyStatus !== undefined && fastifyStatus < 500) {
      request.log.warn({ err: error, status: fastifyStatus }, 'request rejected by framework');
      return reply.status(fastifyStatus).send({
        error: {
          code: fastifyStatus === 413 ? 'FILE_TOO_LARGE' : 'INVALID_INPUT',
          message:
            fastifyStatus === 413
              ? 'The uploaded file exceeds the size limit.'
              : 'The request was malformed.',
          requestId,
        },
      } satisfies ErrorResponse);
    }

    request.log.error({ err: error }, 'unhandled error');

    return reply.status(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong while processing the document.',
        requestId,
      },
    } satisfies ErrorResponse);
  });

  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) =>
    reply.status(404).send({
      error: { code: 'INVALID_INPUT', message: 'No such endpoint.', requestId: request.id },
    } satisfies ErrorResponse),
  );
}

function readFastifyStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const status = (error as { statusCode?: unknown }).statusCode;
  return typeof status === 'number' ? status : undefined;
}
