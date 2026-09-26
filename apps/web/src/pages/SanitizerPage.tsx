import type { JSX } from 'react';

import { FORMAT_EXTENSIONS } from '@cloakfile/shared';

import { CategorySelector } from '../features/sanitizer/components/CategorySelector.js';
import { DetectionList } from '../features/sanitizer/components/DetectionList.js';
import { UploadPanel } from '../features/sanitizer/components/UploadPanel.js';
import { VerificationSummary } from '../features/sanitizer/components/VerificationSummary.js';
import { useSanitizerWorkflow } from '../features/sanitizer/useSanitizerWorkflow.js';
import { canAnalyze, canSanitize } from '../features/sanitizer/workflow.js';

/**
 * Composes the four steps of the flow. Layout only — every decision about what
 * to show comes from the workflow state, and every decision about what is
 * permitted to be shown was already made on the server.
 */
export function SanitizerPage(): JSX.Element {
  const workflow = useSanitizerWorkflow();
  const { state, capabilities } = workflow;

  const acceptedExtensions = (capabilities?.formats ?? [])
    .filter((format) => format.extract && format.generate)
    .map((format) => FORMAT_EXTENSIONS[format.format]);

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6">
      <header>
        <h1 className="text-xl font-bold">CloakFile</h1>
        <p className="text-sm text-slate-600">
          Replace sensitive information with placeholders, so a document can be shared safely.
        </p>
      </header>

      {state.error !== null && (
        <p
          role="alert"
          className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800"
        >
          {state.error}
        </p>
      )}

      <UploadPanel
        file={state.file}
        acceptedExtensions={acceptedExtensions}
        onSelect={workflow.selectFile}
      />

      <CategorySelector
        enabledTypes={state.enabledTypes}
        coverage={capabilities?.detection ?? []}
        onToggle={workflow.toggleCategory}
      />

      <button
        type="button"
        className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-40"
        disabled={!canAnalyze(state)}
        onClick={() => {
          void workflow.analyze();
        }}
      >
        {state.step === 'analyzing' ? 'Analyzing...' : 'Analyze document'}
      </button>

      {state.analysis !== null && (
        <>
          {state.analysis.warnings.length > 0 && (
            <ul className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
              {state.analysis.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}

          <DetectionList
            groups={state.analysis.groups}
            excludedPlaceholders={state.excludedPlaceholders}
            onToggle={workflow.togglePlaceholder}
          />

          <button
            type="button"
            className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-40"
            disabled={!canSanitize(state)}
            onClick={() => {
              void workflow.sanitize();
            }}
          >
            {state.step === 'sanitizing' ? 'Generating...' : 'Generate sanitized document'}
          </button>
        </>
      )}

      {state.result !== null && (
        <VerificationSummary
          result={state.result}
          onDownload={() => {
            void workflow.download();
          }}
        />
      )}
    </main>
  );
}
