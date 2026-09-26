import type { AnalyzeResponse, PIIType, SanitizeResponse } from '@cloakfile/shared';

/**
 * The steps the user moves through. Modelled explicitly so the UI renders from
 * one known state rather than from a handful of independent booleans, where
 * "analyzing" and "ready to download" can both be true at once.
 */
export type WorkflowStep = 'select' | 'analyzing' | 'review' | 'sanitizing' | 'complete';

export interface WorkflowState {
  readonly step: WorkflowStep;
  readonly file: File | null;
  readonly enabledTypes: readonly PIIType[];
  readonly analysis: AnalyzeResponse | null;
  /** Placeholders the user unticked during review; these are left as-is. */
  readonly excludedPlaceholders: readonly string[];
  readonly result: SanitizeResponse | null;
  readonly error: string | null;
}

export type WorkflowAction =
  | { type: 'file-selected'; file: File }
  | { type: 'file-cleared' }
  | { type: 'category-toggled'; piiType: PIIType }
  | { type: 'analysis-started' }
  | { type: 'analysis-succeeded'; analysis: AnalyzeResponse }
  | { type: 'placeholder-toggled'; placeholder: string }
  | { type: 'sanitization-started' }
  | { type: 'sanitization-succeeded'; result: SanitizeResponse }
  | { type: 'failed'; message: string }
  | { type: 'reset' };

/**
 * Categories ticked on first load.
 *
 * The four that are on by default are the ones with deterministic, validated
 * detectors behind them. Categories whose detectors are stubs start unticked so
 * the default experience does not imply coverage that does not exist.
 */
export const DEFAULT_ENABLED_TYPES: readonly PIIType[] = [
  'PERSON',
  'PHONE',
  'EMAIL',
  'CREDIT_CARD',
];

export const initialWorkflowState: WorkflowState = {
  step: 'select',
  file: null,
  enabledTypes: DEFAULT_ENABLED_TYPES,
  analysis: null,
  excludedPlaceholders: [],
  result: null,
  error: null,
};

/**
 * Pure transition function.
 *
 * Kept free of React and of the API client so the flow can be tested as data.
 * This is the "business logic out of components" rule applied to the frontend.
 */
export function workflowReducer(state: WorkflowState, action: WorkflowAction): WorkflowState {
  switch (action.type) {
    case 'file-selected':
      // Choosing a new file invalidates any previous analysis.
      return { ...initialWorkflowState, enabledTypes: state.enabledTypes, file: action.file };

    case 'file-cleared':
      return { ...initialWorkflowState, enabledTypes: state.enabledTypes };

    case 'category-toggled': {
      const isEnabled = state.enabledTypes.includes(action.piiType);
      return {
        ...state,
        enabledTypes: isEnabled
          ? state.enabledTypes.filter((type) => type !== action.piiType)
          : [...state.enabledTypes, action.piiType],
        // Categories changed, so the previous detection results no longer apply.
        step: 'select',
        analysis: null,
        result: null,
        error: null,
      };
    }

    case 'analysis-started':
      return { ...state, step: 'analyzing', error: null, analysis: null, result: null };

    case 'analysis-succeeded':
      return { ...state, step: 'review', analysis: action.analysis, excludedPlaceholders: [] };

    case 'placeholder-toggled': {
      const isExcluded = state.excludedPlaceholders.includes(action.placeholder);
      return {
        ...state,
        excludedPlaceholders: isExcluded
          ? state.excludedPlaceholders.filter((placeholder) => placeholder !== action.placeholder)
          : [...state.excludedPlaceholders, action.placeholder],
      };
    }

    case 'sanitization-started':
      return { ...state, step: 'sanitizing', error: null };

    case 'sanitization-succeeded':
      return { ...state, step: 'complete', result: action.result };

    case 'failed':
      // Return to the last step the user can act from, rather than a dead end.
      return {
        ...state,
        step: state.analysis === null ? 'select' : 'review',
        error: action.message,
      };

    case 'reset':
      return initialWorkflowState;
  }
}

export function canAnalyze(state: WorkflowState): boolean {
  return state.file !== null && state.enabledTypes.length > 0 && state.step === 'select';
}

export function canSanitize(state: WorkflowState): boolean {
  return state.step === 'review' && state.analysis !== null;
}
