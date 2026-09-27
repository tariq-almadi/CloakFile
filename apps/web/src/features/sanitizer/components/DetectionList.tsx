import type { JSX } from 'react';

import type { PlaceholderGroupDto } from '@cloakfile/shared';

import { categoryTitle } from '../category-copy.js';

interface DetectionListProps {
  readonly groups: readonly PlaceholderGroupDto[];
  readonly excludedPlaceholders: readonly string[];
  readonly onToggle: (placeholder: string) => void;
}

/**
 * Step 3: review what was found.
 *
 * Checked items are removed from the clean file. Unchecked items stay as they
 * appear in the original. The preview is the found text itself.
 */
export function DetectionList({
  groups,
  excludedPlaceholders,
  onToggle,
}: DetectionListProps): JSX.Element {
  if (groups.length === 0) {
    return (
      <section className="cf-panel p-5 sm:p-6">
        <h2 className="font-display text-lg font-semibold text-snow">
          <span className="mr-2 text-accent">3.</span>
          Review findings
        </h2>
        <p className="mt-3 text-sm text-mist">
          Nothing matching your choices was found in this document.
        </p>
      </section>
    );
  }

  const removeCount = groups.filter(
    (group) => !excludedPlaceholders.includes(group.placeholder),
  ).length;

  return (
    <section className="cf-panel p-5 sm:p-6">
      <h2 className="font-display text-lg font-semibold text-snow">
        <span className="mr-2 text-accent">3.</span>
        Review findings
      </h2>
      <p className="mt-1 text-sm text-mist-dim">
        Checked items will be hidden. Uncheck anything that should stay in the file.
      </p>
      <p className="mt-1 text-xs text-mist-dim">
        {String(removeCount)} of {String(groups.length)} selected to remove
      </p>

      <ul className="mt-4 max-h-[28rem] space-y-1.5 overflow-y-auto pr-1">
        {groups.map((group) => {
          const willRemove = !excludedPlaceholders.includes(group.placeholder);
          const id = `finding-${group.placeholder}`;
          return (
            <li key={group.placeholder}>
              <label
                htmlFor={id}
                className={`flex w-full cursor-pointer items-start gap-3 rounded-2xl border px-3.5 py-3 text-left text-sm transition duration-200 ${
                  willRemove
                    ? 'border-accent/25 bg-[rgb(183_168_245/0.08)] hover:border-accent/40'
                    : 'border-line bg-black/15 opacity-80 hover:opacity-100'
                }`}
              >
                <input
                  id={id}
                  type="checkbox"
                  className="cf-check mt-0.5"
                  checked={willRemove}
                  onChange={() => {
                    onToggle(group.placeholder);
                  }}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-mist-dim">
                      {categoryTitle(group.type, group.metadata)}
                    </span>
                    {group.occurrences > 1 && (
                      <span className="cf-pill bg-white/5 text-mist-dim">
                        {group.occurrences}× in file
                      </span>
                    )}
                    <span
                      className={`cf-pill ${
                        willRemove ? 'bg-ok-soft text-ok' : 'bg-white/5 text-mist-dim'
                      }`}
                    >
                      {willRemove ? 'Will remove' : 'Will keep'}
                    </span>
                  </span>
                  <span className="mt-1.5 block break-words font-medium text-snow">
                    {group.preview}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
