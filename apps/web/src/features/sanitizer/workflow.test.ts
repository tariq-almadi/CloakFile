import { describe, expect, it } from 'vitest';

import {
  analysisWarningsBlockRelease,
  buildAnalyzeOptions,
  canSanitize,
  initialWorkflowState,
  workflowReducer,
  type WorkflowState,
} from './workflow.js';

function stateWithAnalysis(): WorkflowState {
  return workflowReducer(
    { ...initialWorkflowState, step: 'analyzing' },
    {
      type: 'analysis-succeeded',
      analysis: {
        sessionId: 'session-1',
        expiresAt: new Date().toISOString(),
        document: {
          format: 'txt',
          safeFileName: 'notes.txt',
          byteLength: 42,
          capabilities: {
            trueTextReplacement: true,
            preservesLayout: true,
            supportsVerification: true,
            mayContainHiddenText: false,
            mayContainEmbeddedFiles: false,
            supportedModes: ['text-replacement'],
          },
        },
        groups: [],
        warnings: [],
      },
    },
  );
}

describe('workflow reducer', () => {
  it('discards a previous analysis when a new file is chosen', () => {
    const analysed = stateWithAnalysis();
    const next = workflowReducer(analysed, {
      type: 'file-selected',
      file: new File(['hello'], 'notes.txt'),
    });

    expect(next.analysis).toBeNull();
    expect(next.step).toBe('select');
  });

  it('keeps category selections across a file change', () => {
    const withCategory = workflowReducer(initialWorkflowState, {
      type: 'category-toggled',
      piiType: 'IP_ADDRESS',
    });
    const next = workflowReducer(withCategory, {
      type: 'file-selected',
      file: new File(['hello'], 'notes.txt'),
    });

    expect(next.enabledTypes).toContain('IP_ADDRESS');
  });

  it('keeps blacklist words across a file change', () => {
    const withWords = workflowReducer(initialWorkflowState, {
      type: 'blacklist-changed',
      blacklistWords: [{ word: 'Project Nightfall', ignoreCase: true }],
    });
    const next = workflowReducer(withWords, {
      type: 'file-selected',
      file: new File(['hello'], 'notes.txt'),
    });

    expect(next.blacklistWords).toEqual(withWords.blacklistWords);
  });

  it('includes CUSTOM and escaped patterns in analyze options', () => {
    const options = buildAnalyzeOptions({
      enabledTypes: ['EMAIL'],
      blacklistWords: [{ word: 'Project Nightfall', ignoreCase: true }],
    });

    expect(options.enabledTypes).toEqual(['EMAIL', 'CUSTOM']);
    expect(options.customPatterns).toHaveLength(1);
    expect(options.customPatterns[0]?.name).toBe('PROJECT_NIGHTFALL');
    expect(options.customPatterns[0]?.pattern).toBe('\\bProject\\s+Nightfall\\b');
    expect(options.customPatterns[0]?.ignoreCase).toBe(true);
  });

  it('invalidates analysis when the blacklist changes', () => {
    const next = workflowReducer(stateWithAnalysis(), {
      type: 'blacklist-changed',
      blacklistWords: [{ word: 'secret', ignoreCase: true }],
    });

    expect(next.analysis).toBeNull();
    expect(next.step).toBe('select');
  });

  it('invalidates the analysis when the selected categories change', () => {
    const next = workflowReducer(stateWithAnalysis(), {
      type: 'category-toggled',
      piiType: 'URL',
    });

    expect(next.analysis).toBeNull();
    expect(next.step).toBe('select');
  });

  it('toggles a placeholder exclusion on and off', () => {
    const excluded = workflowReducer(stateWithAnalysis(), {
      type: 'placeholder-toggled',
      placeholder: '[PERSON_001]',
    });
    expect(excluded.excludedPlaceholders).toEqual(['[PERSON_001]']);

    const restored = workflowReducer(excluded, {
      type: 'placeholder-toggled',
      placeholder: '[PERSON_001]',
    });
    expect(restored.excludedPlaceholders).toEqual([]);
  });

  it('blocks generate when analyze warned about unscannable pages', () => {
    const review = workflowReducer(
      { ...initialWorkflowState, step: 'analyzing' },
      {
        type: 'analysis-succeeded',
        analysis: {
          ...stateWithAnalysis().analysis!,
          warnings: ['Page 1 cannot be verified as sanitized.'],
        },
      },
    );

    expect(analysisWarningsBlockRelease(review.analysis!.warnings)).toBe(true);
    expect(canSanitize(review)).toBe(false);
  });

  it('returns to review rather than a dead end when sanitization fails', () => {
    const sanitizing = workflowReducer(stateWithAnalysis(), { type: 'sanitization-started' });
    const failed = workflowReducer(sanitizing, { type: 'failed', message: 'nope' });

    expect(failed.step).toBe('review');
    expect(failed.error).toBe('nope');
  });
});
