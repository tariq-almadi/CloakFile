import { createDefaultDocumentRegistry } from '@cloakfile/document-processing';
import { describe, expect, it } from 'vitest';

import { DefaultSanitizationVerifier } from './verifier.js';

describe('DefaultSanitizationVerifier residual checks', () => {
  it('does not treat a blocked word as residual inside its own placeholder', async () => {
    const registry = createDefaultDocumentRegistry();
    const verifier = new DefaultSanitizationVerifier(registry);
    const text = 'The [AUDIT_001] review was initiated by staff.';
    const bytes = new TextEncoder().encode(text);

    const report = await verifier.verify({
      generated: {
        bytes,
        format: 'txt',
        mediaType: 'text/plain',
        mode: 'text-replacement',
        warnings: [],
      },
      applied: [
        {
          id: 'd1',
          type: 'CUSTOM',
          start: 0,
          end: 5,
          value: 'audit',
          confidence: 1,
          detector: 'custom-regex',
          placeholder: '[AUDIT_001]',
          groupId: 'AUDIT_001',
        },
      ],
      skipped: [],
      unreadable: [],
    });

    const residual = report.checks.find((check) => check.id === 'residual-values');
    expect(residual?.status).toBe('pass');
    expect(residual?.offendingPlaceholders).toEqual([]);
  });

  it('still fails when the blocked word remains outside the placeholder', async () => {
    const registry = createDefaultDocumentRegistry();
    const verifier = new DefaultSanitizationVerifier(registry);
    const text = 'The audit review became [AUDIT_001].';
    const bytes = new TextEncoder().encode(text);

    const report = await verifier.verify({
      generated: {
        bytes,
        format: 'txt',
        mediaType: 'text/plain',
        mode: 'text-replacement',
        warnings: [],
      },
      applied: [
        {
          id: 'd1',
          type: 'CUSTOM',
          start: 0,
          end: 5,
          value: 'audit',
          confidence: 1,
          detector: 'custom-regex',
          placeholder: '[AUDIT_001]',
          groupId: 'AUDIT_001',
        },
      ],
      skipped: [],
      unreadable: [],
    });

    const residual = report.checks.find((check) => check.id === 'residual-values');
    expect(residual?.status).toBe('fail');
    expect(residual?.offendingPlaceholders).toEqual(['[AUDIT_001]']);
  });
});
