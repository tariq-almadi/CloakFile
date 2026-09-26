import type { AnalysisResult } from '@cloakfile/pipeline';
import { CapacityExceededError, SessionNotFoundError } from '@cloakfile/shared';
import { describe, expect, it } from 'vitest';

import { EphemeralSessionStore } from './session-store.js';

const analysis = {
  document: {
    format: 'txt',
    text: '',
    segments: [],
    capabilities: {
      trueTextReplacement: true,
      preservesLayout: true,
      supportsVerification: true,
      mayContainHiddenText: false,
      mayContainEmbeddedFiles: false,
      supportedModes: ['text-replacement'],
    },
    warnings: [],
  },
  detections: [],
  groups: [],
  warnings: [],
  detectorsRun: [],
} satisfies AnalysisResult;

function create(store: EphemeralSessionStore) {
  return store.create({
    format: 'txt',
    safeFileName: 'notes.txt',
    originalBytes: new Uint8Array([1, 2, 3]),
    analysis,
  });
}

describe('EphemeralSessionStore', () => {
  it('issues unguessable ids', () => {
    const store = new EphemeralSessionStore({ ttlSeconds: 60, maxEntries: 10 });
    const first = create(store);
    const second = create(store);

    expect(first.id).not.toBe(second.id);
    expect(first.id).toMatch(/^[0-9a-f-]{36}$/u);
  });

  it('refuses a session that has passed its TTL, and forgets it', () => {
    const store = new EphemeralSessionStore({ ttlSeconds: 0.001, maxEntries: 10 });
    const session = create(store);

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(() => store.get(session.id)).toThrow(SessionNotFoundError);
        expect(store.size).toBe(0);
        resolve();
      }, 20);
    });
  });

  it('refuses new work at capacity rather than evicting someone else', () => {
    const store = new EphemeralSessionStore({ ttlSeconds: 60, maxEntries: 1 });
    const existing = create(store);

    expect(() => create(store)).toThrow(CapacityExceededError);
    // The in-flight document survived the rejection.
    expect(store.get(existing.id).id).toBe(existing.id);
  });

  it('forgets a session on explicit discard', () => {
    const store = new EphemeralSessionStore({ ttlSeconds: 60, maxEntries: 10 });
    const session = create(store);

    store.delete(session.id);
    expect(() => store.get(session.id)).toThrow(SessionNotFoundError);
  });
});
