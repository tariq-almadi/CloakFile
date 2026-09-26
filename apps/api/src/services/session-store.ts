import { randomUUID } from 'node:crypto';

import type { AnalysisResult } from '@cloakfile/pipeline';
import {
  CapacityExceededError,
  SessionNotFoundError,
  type DocumentFormat,
  type GeneratedDocument,
} from '@cloakfile/shared';

export interface SessionRecord {
  readonly id: string;
  readonly format: DocumentFormat;
  readonly safeFileName: string;
  /**
   * The original upload. Held ONLY until a verified sanitized output exists —
   * generation needs it, and discarding it earlier would make failure
   * unrecoverable for the user.
   */
  readonly originalBytes: Uint8Array;
  /** BACKEND-ONLY: carries original values. Never serialised to a client. */
  readonly analysis: AnalysisResult;
  readonly createdAt: number;
  readonly expiresAt: number;
  /** Populated by `sanitize`, read once by `download`. */
  generated?: GeneratedDocument;
}

export interface SessionStoreOptions {
  readonly ttlSeconds: number;
  readonly maxEntries: number;
}

/**
 * In-memory, TTL-bounded storage for in-flight documents.
 *
 * WHY MEMORY AND NOT DISK
 * Phase 1 deliberately never writes an uploaded document to the filesystem.
 * That single decision removes a whole class of problems at once: insecure
 * temporary file permissions, temp files surviving a crash, path traversal via
 * filenames, and files left behind on a shared host. It costs us the ability to
 * process very large documents, which is why `UPLOAD_MAX_FILE_BYTES` exists and
 * is small.
 *
 * WHAT THIS IS NOT
 * It is not a database and must not grow into one. There is no persistence, no
 * cross-request reuse and no history. A restart loses everything, which is the
 * correct behaviour for this product.
 *
 * SCALING LIMIT (must be resolved before multi-instance deployment)
 * Because state lives in one process, a horizontally scaled deployment would
 * need sticky sessions or a shared store — and a shared store would reintroduce
 * exactly the retention risk this design avoids. See
 * docs/THREAT-MODEL.md (T-05).
 */
export class EphemeralSessionStore {
  readonly #sessions = new Map<string, SessionRecord>();
  readonly #ttlMs: number;
  readonly #maxEntries: number;

  constructor(options: SessionStoreOptions) {
    this.#ttlMs = options.ttlSeconds * 1000;
    this.#maxEntries = options.maxEntries;
  }

  create(input: {
    format: DocumentFormat;
    safeFileName: string;
    originalBytes: Uint8Array;
    analysis: AnalysisResult;
  }): SessionRecord {
    this.pruneExpired();

    if (this.#sessions.size >= this.#maxEntries) {
      // Refuse rather than evict. Evicting someone else's in-flight document to
      // make room turns a load spike into data loss for an unrelated user.
      throw new CapacityExceededError(
        'The server is processing its maximum number of documents. Try again shortly.',
      );
    }

    const now = Date.now();
    const record: SessionRecord = {
      id: randomUUID(),
      format: input.format,
      safeFileName: input.safeFileName,
      originalBytes: input.originalBytes,
      analysis: input.analysis,
      createdAt: now,
      expiresAt: now + this.#ttlMs,
    };

    this.#sessions.set(record.id, record);
    return record;
  }

  get(id: string): SessionRecord {
    const record = this.#sessions.get(id);

    if (record === undefined) throw new SessionNotFoundError();
    if (record.expiresAt <= Date.now()) {
      this.delete(id);
      throw new SessionNotFoundError('This analysis session has expired. Please upload again.');
    }

    return record;
  }

  attachGenerated(id: string, generated: GeneratedDocument): void {
    const record = this.get(id);
    record.generated = generated;
  }

  delete(id: string): void {
    this.#sessions.delete(id);
  }

  pruneExpired(): number {
    const now = Date.now();
    let removed = 0;
    for (const [id, record] of this.#sessions) {
      if (record.expiresAt <= now) {
        this.#sessions.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  get size(): number {
    return this.#sessions.size;
  }

  clear(): void {
    this.#sessions.clear();
  }
}
