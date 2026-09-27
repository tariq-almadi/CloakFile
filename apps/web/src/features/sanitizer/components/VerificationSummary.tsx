import type { JSX } from 'react';

import type { SanitizeResponse, VerificationCheck } from '@cloakfile/shared';

interface VerificationSummaryProps {
  readonly result: SanitizeResponse;
  readonly onDownload: () => void;
}

/**
 * Step 4: plain-language result, then download.
 */
export function VerificationSummary({ result, onDownload }: VerificationSummaryProps): JSX.Element {
  const { verification } = result;
  const passed = verification.status === 'pass';

  return (
    <section className="cf-panel relative overflow-hidden p-5 sm:p-7">
      <div
        aria-hidden
        className={`pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full blur-3xl ${
          passed ? 'bg-ok/20' : 'bg-warn/20'
        }`}
      />

      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-snow">
            <span className="mr-2 text-accent">4.</span>
            {passed ? 'Ready to download' : 'Could not finish safely'}
          </h2>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-mist">
            {passed
              ? `We hid ${String(result.replacedOccurrences)} item${result.replacedOccurrences === 1 ? '' : 's'} in your file and double-checked that the originals are gone.`
              : 'Something still looked unsafe in the result, so download is blocked until that is fixed.'}
          </p>
        </div>
        <span className={`cf-pill relative ${passed ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn'}`}>
          {passed ? 'Success' : 'Blocked'}
        </span>
      </div>

      <ul className="relative mt-5 space-y-2">
        {verification.checks.map((check) => (
          <li
            key={check.id}
            className="rounded-2xl border border-line bg-black/25 px-4 py-3 text-sm text-mist"
          >
            <div className="mb-1 flex items-center gap-2">
              <span
                className={`cf-pill ${
                  check.status === 'pass'
                    ? 'bg-ok-soft text-ok'
                    : check.status === 'fail'
                      ? 'bg-danger-soft text-danger'
                      : 'bg-warn-soft text-warn'
                }`}
              >
                {check.status === 'pass' ? 'OK' : check.status === 'fail' ? 'Problem' : 'Unclear'}
              </span>
              <span className="font-medium text-snow">{checkHeadline(check)}</span>
            </div>
            <p className="text-mist-dim">{plainCheckDetail(check)}</p>
          </li>
        ))}
      </ul>

      {!passed && (
        <p className="relative mt-4 rounded-2xl border border-[rgb(230_192_123/0.35)] bg-warn-soft p-3.5 text-sm text-warn">
          Do not share this file externally until the problems above are resolved.
        </p>
      )}

      {passed && (
        <button type="button" className="cf-btn cf-btn-primary relative mt-6" onClick={onDownload}>
          Download clean file
        </button>
      )}
    </section>
  );
}

function checkHeadline(check: VerificationCheck): string {
  switch (check.id) {
    case 'residual-values':
      return check.status === 'pass' ? 'Original secrets are gone' : 'Some original values remain';
    case 'placeholders-present':
      return check.status === 'pass' ? 'Replacements are in place' : 'Some replacements did not land';
    case 'deep-streams':
      return check.status === 'pass' ? 'Hidden PDF layers look clean' : 'Hidden PDF content still has secrets';
    case 'structural-channels':
      return check.status === 'pass' ? 'Extra PDF extras were removed' : 'The PDF still has leftover metadata';
    case 'unreadable-content':
      return 'Some pages could not be read';
    case 'output-parses':
      return 'The output file could not be re-opened';
    default:
      return check.id;
  }
}

function plainCheckDetail(check: VerificationCheck): string {
  if (check.status === 'pass') {
    switch (check.id) {
      case 'residual-values':
        return 'We searched the new file and did not find the values you asked us to remove.';
      case 'placeholders-present':
        return 'Every chosen placeholder shows up where the secret used to be.';
      case 'deep-streams':
        return 'We also searched inside compressed PDF objects, not only the visible text.';
      case 'structural-channels':
        return 'Things like author fields and attachments were stripped out.';
      default:
        return check.summary;
    }
  }

  if (check.id === 'unreadable-content') {
    return 'Parts of the original looked like images only. We cannot promise those were cleaned.';
  }

  if (check.offendingPlaceholders.length > 0) {
    return `Related to: ${check.offendingPlaceholders.join(', ')}.`;
  }

  return check.summary;
}
