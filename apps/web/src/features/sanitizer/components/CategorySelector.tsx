import type { JSX } from 'react';

import { PII_TYPES, PII_TYPE_LABELS, type DetectorCoverageDto, type PIIType } from '@sds/shared';

interface CategorySelectorProps {
  readonly enabledTypes: readonly PIIType[];
  readonly coverage: readonly DetectorCoverageDto[];
  readonly onToggle: (piiType: PIIType) => void;
}

/**
 * Step 2: choose what to sanitize.
 *
 * Each category is annotated with the maturity the server reports. A category
 * whose detector is a stub is shown as unavailable rather than hidden: the user
 * should be able to see that we know about addresses and have not built them
 * yet, instead of wondering why addresses came back untouched.
 */
export function CategorySelector({
  enabledTypes,
  coverage,
  onToggle,
}: CategorySelectorProps): JSX.Element {
  const byType = new Map(coverage.map((entry) => [entry.type, entry]));

  return (
    <section className="rounded border border-slate-300 p-4">
      <h2 className="font-semibold">2. Select information to sanitize</h2>

      <ul className="mt-2 space-y-1">
        {PII_TYPES.map((type) => {
          const entry = byType.get(type);
          const unavailable = entry === undefined || entry.maturity === 'stub';

          return (
            <li key={type}>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={enabledTypes.includes(type)}
                  disabled={unavailable}
                  onChange={() => {
                    onToggle(type);
                  }}
                />
                <span className={unavailable ? 'text-slate-400' : undefined}>
                  {PII_TYPE_LABELS[type]}
                </span>
                {unavailable && (
                  <span className="text-xs text-slate-400">(not implemented yet)</span>
                )}
                {entry?.maturity === 'experimental' && (
                  <span className="text-xs text-amber-600">(experimental)</span>
                )}
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
