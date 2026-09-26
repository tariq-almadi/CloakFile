import { useCallback, useEffect, useReducer, useState } from 'react';

import type { CapabilitiesResponse, PIIType } from '@cloakfile/shared';

import { ApiError, apiClient } from '../../lib/api-client.js';
import { initialWorkflowState, workflowReducer, type WorkflowState } from './workflow.js';

/**
 * Callbacks are declared as properties rather than methods because they are
 * passed directly as props. Method syntax would imply a `this` binding these
 * `useCallback` functions do not have.
 */
export interface SanitizerWorkflow {
  readonly state: WorkflowState;
  readonly capabilities: CapabilitiesResponse | null;
  readonly selectFile: (file: File) => void;
  readonly toggleCategory: (piiType: PIIType) => void;
  readonly togglePlaceholder: (placeholder: string) => void;
  readonly analyze: () => Promise<void>;
  readonly sanitize: () => Promise<void>;
  readonly download: () => Promise<void>;
  readonly reset: () => void;
}

/**
 * Binds the pure workflow reducer to the API client.
 *
 * All asynchronous work lives here so that components stay render-only. The
 * reducer stays testable without mocking `fetch`.
 */
export function useSanitizerWorkflow(): SanitizerWorkflow {
  const [state, dispatch] = useReducer(workflowReducer, initialWorkflowState);
  const [capabilities, setCapabilities] = useState<CapabilitiesResponse | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    apiClient.capabilities(controller.signal).then(setCapabilities, () => {
      // A missing capabilities response is not fatal: the UI falls back to the
      // static category list and the user still gets a real error on analyze.
      setCapabilities(null);
    });
    return () => {
      controller.abort();
    };
  }, []);

  const run = useCallback(async (work: () => Promise<void>): Promise<void> => {
    try {
      await work();
    } catch (error: unknown) {
      dispatch({ type: 'failed', message: toMessage(error) });
    }
  }, []);

  const analyze = useCallback(async (): Promise<void> => {
    const { file, enabledTypes } = state;
    if (file === null) return;

    dispatch({ type: 'analysis-started' });
    await run(async () => {
      const analysis = await apiClient.analyze(file, { enabledTypes: [...enabledTypes] });
      dispatch({ type: 'analysis-succeeded', analysis });
    });
  }, [run, state]);

  const sanitize = useCallback(async (): Promise<void> => {
    const { analysis, excludedPlaceholders } = state;
    if (analysis === null) return;

    dispatch({ type: 'sanitization-started' });
    await run(async () => {
      const result = await apiClient.sanitize(analysis.sessionId, excludedPlaceholders);
      dispatch({ type: 'sanitization-succeeded', result });
    });
  }, [run, state]);

  const download = useCallback(async (): Promise<void> => {
    const { analysis, result } = state;
    if (analysis === null || result === null) return;

    await run(async () => {
      const blob = await apiClient.download(analysis.sessionId);
      triggerBrowserDownload(blob, result.download.fileName);
      // The user has the file; the server has no further reason to hold it.
      await apiClient.discard(analysis.sessionId);
    });
  }, [run, state]);

  return {
    state,
    capabilities,
    selectFile: useCallback((file: File) => {
      dispatch({ type: 'file-selected', file });
    }, []),
    toggleCategory: useCallback((piiType: PIIType) => {
      dispatch({ type: 'category-toggled', piiType });
    }, []),
    togglePlaceholder: useCallback((placeholder: string) => {
      dispatch({ type: 'placeholder-toggled', placeholder });
    }, []),
    analyze,
    sanitize,
    download,
    reset: useCallback(() => {
      dispatch({ type: 'reset' });
    }, []),
  };
}

function toMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong.';
}

function triggerBrowserDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  // Revoking releases the blob; without it the sanitized document stays in
  // browser memory for the life of the tab.
  URL.revokeObjectURL(url);
}
