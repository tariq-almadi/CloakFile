import type { JSX } from 'react';

import type { SanitizeResponse } from '@sds/shared';

interface VerificationSummaryProps {
  readonly result: SanitizeResponse;
  readonly onDownload: () => void;
}

/**
 * Step 4: the verification verdict, then download.
 *
 * The verdict is shown before the download button, and `inconclusive` is
 * presented as a warning rather than a success. Users of a privacy tool deserve
 * to know the difference between "we checked and it is clean" and "we could not
 * check".
 */
export function VerificationSummary({ result, onDownload }: VerificationSummaryProps): JSX.Element {
  const { verification } = result;

  return (
    <section className="rounded border border-slate-300 p-4">
      <h2 className="font-semibold">4. Verification</h2>

      <p className="mt-2 text-sm">
        Status: <strong>{verification.status.toUpperCase()}</strong> &mdash; replaced{' '}
        {result.replacedOccurrences} occurrence(s) across {result.replacedGroups} distinct value(s).
      </p>

      <ul className="mt-2 space-y-1 text-sm text-slate-600">
        {verification.checks.map((check) => (
          <li key={check.id}>
            [{check.status}] {check.summary}
          </li>
        ))}
      </ul>

      {verification.status !== 'pass' && (
        <p className="mt-2 text-sm text-amber-700">
          We could not confirm this document is fully sanitized. Do not share it externally.
        </p>
      )}

      <button
        type="button"
        className="mt-3 rounded bg-slate-900 px-3 py-1.5 text-sm text-white"
        onClick={onDownload}
      >
        Download {result.download.fileName}
      </button>
    </section>
  );
}
