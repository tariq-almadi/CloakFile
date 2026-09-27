import type { JSX } from 'react';

import { FORMAT_EXTENSIONS } from '@cloakfile/shared';

import { BrandMark } from '../components/BrandMark.js';
import { StepProgress, type FlowStep } from '../components/StepProgress.js';
import { CategorySelector } from '../features/sanitizer/components/CategorySelector.js';
import { DetectionList } from '../features/sanitizer/components/DetectionList.js';
import { UploadPanel } from '../features/sanitizer/components/UploadPanel.js';
import { VerificationSummary } from '../features/sanitizer/components/VerificationSummary.js';
import { useSanitizerWorkflow } from '../features/sanitizer/useSanitizerWorkflow.js';
import {
  analysisWarningsBlockRelease,
  canAnalyze,
  canSanitize,
} from '../features/sanitizer/workflow.js';

/**
 * Composes the four steps of the flow. Layout only — every decision about what
 * to show comes from the workflow state, and every decision about what is
 * permitted to be shown was already made on the server.
 */
export function SanitizerPage(): JSX.Element {
  const workflow = useSanitizerWorkflow();
  const { state, capabilities } = workflow;

  const offeredFormats = new Set(['txt', 'pdf', 'docx']);
  const acceptedExtensions = (capabilities?.formats ?? [])
    .filter((format) => format.extract && format.generate && offeredFormats.has(format.format))
    .map((format) => FORMAT_EXTENSIONS[format.format]);

  const hasFile = state.file !== null;
  const hasAnalysis = state.analysis !== null;
  const hasResult = state.result !== null;
  const flowStep = currentFlowStep(hasFile, hasAnalysis, hasResult);

  return (
    <div className="cf-shell">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-8 sm:gap-6 sm:px-6 sm:py-12">
        <header className="cf-panel overflow-hidden p-5 sm:p-8">
          <BrandMark size="lg" />
          <div className="mt-6 border-t border-line pt-5">
            <StepProgress current={flowStep} />
          </div>
        </header>

        {state.error !== null && (
          <p
            role="alert"
            className="rounded-2xl border border-[rgb(240_113_120/0.4)] bg-danger-soft px-4 py-3.5 text-sm leading-relaxed text-danger"
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
          customPatterns={state.customPatterns}
          onToggle={workflow.toggleCategory}
          onCustomPatternsChange={workflow.setCustomPatterns}
          locked={!hasFile}
        />

        {hasFile && (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="cf-btn cf-btn-primary"
              disabled={!canAnalyze(state)}
              onClick={() => {
                void workflow.analyze();
              }}
            >
              {state.step === 'analyzing' ? 'Searching…' : 'Find sensitive info'}
            </button>
            {state.step === 'select' && state.enabledTypes.length === 0 && (
              <p className="text-sm text-mist-dim">Turn on at least one category above.</p>
            )}
          </div>
        )}

        {(() => {
          const analysis = state.analysis;
          if (analysis === null) return null;
          return (
            <>
              {analysis.warnings.length > 0 && (
                <ul className="rounded-2xl border border-[rgb(230_192_123/0.35)] bg-warn-soft px-4 py-3.5 text-sm leading-relaxed text-warn">
                  {analysis.warnings.map((warning) => (
                    <li key={warning} className="py-0.5">
                      {plainWarning(warning)}
                    </li>
                  ))}
                </ul>
              )}

              <DetectionList
                groups={analysis.groups}
                excludedPlaceholders={state.excludedPlaceholders}
                onToggle={workflow.togglePlaceholder}
              />

              {analysisWarningsBlockRelease(analysis.warnings) && (
                <p className="rounded-2xl border border-line bg-black/25 px-4 py-3.5 text-sm leading-relaxed text-mist">
                  Some pages look like scanned images, so we cannot safely clean this file. Try a
                  normal PDF with selectable text, or a Word / text file.
                </p>
              )}

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className="cf-btn cf-btn-primary"
                  disabled={!canSanitize(state) || state.step === 'sanitizing'}
                  onClick={() => {
                    void workflow.sanitize();
                  }}
                >
                  {state.step === 'sanitizing' ? 'Creating clean file…' : 'Create clean file'}
                </button>
              </div>
            </>
          );
        })()}

        {state.result !== null && (
          <VerificationSummary
            result={state.result}
            onDownload={() => {
              void workflow.download();
            }}
          />
        )}

        <footer className="pb-6 pt-2 text-center text-xs leading-relaxed text-mist-dim">
          Your document stays on our server, in memory only — never sent to an external AI — and is
          deleted after you download the clean version.
        </footer>
      </main>
    </div>
  );
}

function currentFlowStep(hasFile: boolean, hasAnalysis: boolean, hasResult: boolean): FlowStep {
  if (hasResult) return 4;
  if (hasAnalysis) return 3;
  if (hasFile) return 2;
  return 1;
}

function plainWarning(warning: string): string {
  if (warning.includes('cannot be verified as sanitized')) {
    return 'Some pages could not be read as text (often scans). A clean download will not be possible for this file.';
  }
  if (warning.includes('no detector is implemented')) {
    return 'One of the categories you picked is not available yet.';
  }
  return warning;
}
