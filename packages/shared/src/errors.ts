/**
 * Machine-readable error codes. The API maps these to HTTP statuses; the web
 * client maps them to copy. Never widen this to a bare `string`.
 */
export const ERROR_CODES = [
  'INVALID_INPUT',
  'UNSUPPORTED_FORMAT',
  'FILE_TOO_LARGE',
  'MALFORMED_DOCUMENT',
  'SUSPICIOUS_DOCUMENT',
  'NOT_IMPLEMENTED',
  'SESSION_NOT_FOUND',
  'SESSION_EXPIRED',
  'CAPACITY_EXCEEDED',
  'VERIFICATION_FAILED',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * Details attached to an error for the client.
 *
 * SECURITY: this object is serialised into HTTP responses and log lines. It
 * must never contain document contents or detected values. Use counts, types,
 * byte sizes and placeholders instead.
 */
export type ErrorDetails = Readonly<Record<string, string | number | boolean | readonly string[]>>;

export interface AppErrorOptions {
  readonly details?: ErrorDetails;
  readonly cause?: unknown;
  /**
   * When false, the message is treated as potentially revealing and is replaced
   * by a generic message before reaching the client. Defaults to true, because
   * every error constructed in this codebase is expected to be written with a
   * client audience in mind.
   */
  readonly safeToExpose?: boolean;
}

/**
 * Base class for every error this system raises deliberately.
 *
 * Anything that is *not* an `AppError` reaching the HTTP layer is treated as an
 * unexpected fault: it is logged with a request id and reported to the client as
 * a generic `INTERNAL_ERROR` with no message passthrough.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details: ErrorDetails | undefined;
  readonly safeToExpose: boolean;

  constructor(code: ErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.code = code;
    this.details = options.details;
    this.safeToExpose = options.safeToExpose ?? true;
  }
}

export class InvalidInputError extends AppError {
  constructor(message: string, options?: AppErrorOptions) {
    super('INVALID_INPUT', message, options);
  }
}

export class UnsupportedFormatError extends AppError {
  constructor(message: string, options?: AppErrorOptions) {
    super('UNSUPPORTED_FORMAT', message, options);
  }
}

export class FileTooLargeError extends AppError {
  constructor(message: string, options?: AppErrorOptions) {
    super('FILE_TOO_LARGE', message, options);
  }
}

export class MalformedDocumentError extends AppError {
  constructor(message: string, options?: AppErrorOptions) {
    super('MALFORMED_DOCUMENT', message, options);
  }
}

/** Raised when a file's structure suggests an attack (e.g. decompression bomb). */
export class SuspiciousDocumentError extends AppError {
  constructor(message: string, options?: AppErrorOptions) {
    super('SUSPICIOUS_DOCUMENT', message, options);
  }
}

/**
 * Thrown by deliberately unimplemented capabilities.
 *
 * This exists so the architecture can be complete and wired end to end while
 * individual format handlers are still stubs. An unimplemented capability must
 * fail loudly; it must never silently return unsanitized content.
 */
export class NotImplementedError extends AppError {
  constructor(capability: string, reason?: string) {
    super(
      'NOT_IMPLEMENTED',
      reason === undefined
        ? `${capability} is not implemented yet.`
        : `${capability} is not implemented yet: ${reason}`,
      { details: { capability } },
    );
  }
}

export class SessionNotFoundError extends AppError {
  constructor(message = 'No such analysis session. It may have expired.') {
    super('SESSION_NOT_FOUND', message);
  }
}

export class CapacityExceededError extends AppError {
  constructor(message: string, options?: AppErrorOptions) {
    super('CAPACITY_EXCEEDED', message, options);
  }
}

/** Raised when the generated document still contains values we promised to remove. */
export class VerificationFailedError extends AppError {
  constructor(message: string, options?: AppErrorOptions) {
    super('VERIFICATION_FAILED', message, options);
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Describe an unknown thrown value without leaking its contents.
 *
 * Used at logging boundaries. Deliberately does not stringify arbitrary objects,
 * because a thrown object could carry document text.
 */
export function describeUnknownError(error: unknown): string {
  if (isAppError(error)) return `${error.name}(${error.code})`;
  if (error instanceof Error) return error.name;
  return typeof error;
}
