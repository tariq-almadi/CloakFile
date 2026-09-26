import { isAppError } from '@sds/shared';
import type { FastifyError, FastifyRequest, FastifyServerOptions } from 'fastify';

/**
 * Logging configuration for a product whose logs are a disclosure risk.
 *
 * The rule this encodes: log SHAPE, never CONTENT. A log line may say "a
 * 42 KiB PDF produced 7 detections across 3 categories". It may never contain
 * the document, a detected value, the filename the user chose, or a placeholder
 * mapping.
 *
 * Three mechanisms, because one is not enough:
 *   1. Request and response bodies are never serialised — the serialisers below
 *      pick fields explicitly rather than spreading the object.
 *   2. Known-sensitive paths are redacted by pino even if something does try to
 *      log them.
 *   3. `no-console` is enforced by ESLint inside `packages/`, so library code
 *      has no way to print at all.
 *
 * See docs/SECURITY.md, "Logging".
 */
export function buildLoggerOptions(
  logLevel: string,
): Exclude<FastifyServerOptions['logger'], undefined | boolean> {
  return {
    level: logLevel,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-api-key"]',
        'res.headers["set-cookie"]',
        // Defence in depth: if any of these names ever appear on a logged
        // object, they are removed rather than printed.
        '*.originalValue',
        '*.value',
        '*.detections',
        '*.text',
        '*.bytes',
        '*.filename',
      ],
      censor: '[redacted]',
    },
    serializers: {
      // Explicitly constructed, never spread. A raw URL carries a query string
      // that may contain user input, so only the matched route is logged.
      req(request: FastifyRequest) {
        return {
          id: request.id,
          method: request.method,
          route: request.routeOptions.url ?? 'unmatched',
        };
      },
      // Typed structurally: Fastify hands the response serialiser a narrowed
      // reply, and the status code is the only field worth logging anyway.
      res(reply: { statusCode: number }) {
        return { statusCode: reply.statusCode };
      },
      err(error: FastifyError) {
        return {
          type: error.name,
          code: error.code,
          // Only messages this codebase wrote deliberately are printable. A
          // message from a document parser routinely quotes the bytes that
          // failed to parse, which here means quoting the user's document.
          message: isAppError(error) ? error.message : '[redacted: may contain document content]',
          // The stack is genuinely useful and contains only code locations —
          // except for its first line, which repeats the message.
          stack: stripStackHeader(error.stack),
        };
      },
    },
  };
}

function stripStackHeader(stack: string | undefined): string {
  if (stack === undefined) return '';
  const firstFrame = stack.indexOf('\n    at ');
  return firstFrame === -1 ? '' : stack.slice(firstFrame + 1);
}
