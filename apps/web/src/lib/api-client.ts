import type {
  AnalyzeOptionsInput,
  AnalyzeResponse,
  CapabilitiesResponse,
  ErrorResponse,
  SanitizeResponse,
} from '@sds/shared';

/**
 * Vite's `import.meta.env` is typed with an index signature returning `any`,
 * so the value is validated rather than trusted. A misconfigured build should
 * fall back to the local API instead of producing `undefined` in a URL.
 */
function resolveApiBaseUrl(): string {
  const configured: unknown = import.meta.env['VITE_API_BASE_URL'];
  return typeof configured === 'string' && configured.length > 0
    ? configured.replace(/\/$/u, '')
    : 'http://localhost:3001';
}

const API_BASE_URL = resolveApiBaseUrl();

/** A failure the API described deliberately, with its machine-readable code. */
export class ApiError extends Error {
  readonly code: string;
  readonly requestId: string | undefined;

  constructor(code: string, message: string, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.requestId = requestId;
  }
}

/**
 * The only module that talks to the API.
 *
 * Centralised so that request shape, error translation and the base URL live in
 * one place, and so components never touch `fetch` directly. Response bodies
 * are already privacy-safe by construction — the wire schemas have no field for
 * an original value — so there is nothing to strip here.
 */
export const apiClient = {
  async capabilities(signal?: AbortSignal): Promise<CapabilitiesResponse> {
    return await request<CapabilitiesResponse>(
      '/api/v1/capabilities',
      withSignal({ method: 'GET' }, signal),
    );
  },

  async analyze(
    file: File,
    options: AnalyzeOptionsInput,
    signal?: AbortSignal,
  ): Promise<AnalyzeResponse> {
    const body = new FormData();
    body.append('file', file);
    body.append('options', JSON.stringify(options));

    return await request<AnalyzeResponse>(
      '/api/v1/documents/analyze',
      withSignal({ method: 'POST', body }, signal),
    );
  },

  async sanitize(
    sessionId: string,
    excludedPlaceholders: readonly string[],
    signal?: AbortSignal,
  ): Promise<SanitizeResponse> {
    return await request<SanitizeResponse>(
      `/api/v1/documents/${encodeURIComponent(sessionId)}/sanitize`,
      withSignal(
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ excludedPlaceholders }),
        },
        signal,
      ),
    );
  },

  /**
   * Fetches the sanitized bytes as a blob rather than navigating to the URL, so
   * the download works with the same-origin rules the API enforces and the file
   * never opens in a tab.
   */
  async download(sessionId: string, signal?: AbortSignal): Promise<Blob> {
    const response = await fetch(
      `${API_BASE_URL}/api/v1/documents/${encodeURIComponent(sessionId)}/download`,
      withSignal({ method: 'GET' }, signal),
    );

    if (!response.ok) throw await toApiError(response);
    return await response.blob();
  },

  /** Tells the server to forget the document now, rather than at TTL expiry. */
  async discard(sessionId: string): Promise<void> {
    await fetch(`${API_BASE_URL}/api/v1/documents/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
      keepalive: true,
    });
  },
};

/**
 * `exactOptionalPropertyTypes` distinguishes "absent" from "present and
 * undefined", and `RequestInit.signal` accepts `AbortSignal | null` but not
 * `undefined`. So the property is added only when there is a signal.
 */
function withSignal(init: RequestInit, signal: AbortSignal | undefined): RequestInit {
  return signal === undefined ? init : { ...init, signal };
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, init);
  if (!response.ok) throw await toApiError(response);
  return (await response.json()) as T;
}

async function toApiError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as ErrorResponse;
    return new ApiError(body.error.code, body.error.message, body.error.requestId);
  } catch {
    return new ApiError('INTERNAL_ERROR', `Request failed with status ${String(response.status)}.`);
  }
}
