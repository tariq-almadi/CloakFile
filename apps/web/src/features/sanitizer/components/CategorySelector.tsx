import type { JSX } from 'react';

import type { DetectorCoverageDto, PIIType } from '@cloakfile/shared';

import { CATEGORY_COPY } from '../category-copy.js';
import type { BlacklistWord } from '../word-blacklist.js';
import { WordBlacklist } from './WordBlacklist.js';

interface CategorySelectorProps {
  readonly enabledTypes: readonly PIIType[];
  readonly coverage: readonly DetectorCoverageDto[];
  readonly blacklistWords: readonly BlacklistWord[];
  readonly redactionTag: string;
  readonly onToggle: (piiType: PIIType) => void;
  readonly onBlacklistChange: (entries: readonly BlacklistWord[]) => void;
  readonly onRedactionTagChange: (tag: string) => void;
  readonly locked?: boolean;
}

/**
 * Step 2: choose what to remove.
 *
 * Only categories with a working detector are listed. Checked = remove from the
 * clean file. Unchecked = leave that kind of info alone. Blocked words are
 * extra literals the user wants removed in every supported format.
 */
export function CategorySelector({
  enabledTypes,
  coverage,
  blacklistWords,
  redactionTag,
  onToggle,
  onBlacklistChange,
  onRedactionTagChange,
  locked = false,
}: CategorySelectorProps): JSX.Element {
  // CUSTOM is driven by the word blacklist, not a category checkbox.
  const supported = coverage.filter(
    (entry) => entry.maturity !== 'stub' && entry.type !== 'CUSTOM',
  );
  const hasExperimental = supported.some((entry) => entry.maturity === 'experimental');

  return (
    <section
      className={`cf-panel relative p-5 sm:p-6 transition duration-300 ${
        locked ? 'cf-panel-locked' : ''
      }`}
      aria-disabled={locked || undefined}
    >
      <h2 className="font-display text-lg font-semibold text-snow">
        <span className="mr-2 text-accent">2.</span>
        What should we remove?
      </h2>
      <p className="mt-1 text-sm text-mist-dim">
        {locked
          ? 'Upload a document first — then pick what to hide.'
          : 'Check each category you want hidden in the clean file. Leave unchecked what should stay.'}
      </p>

      {!locked && supported.length === 0 && (
        <p className="mt-4 text-sm text-mist">Loading available options…</p>
      )}

      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {supported.map((entry) => {
          const copy = CATEGORY_COPY[entry.type];
          const checked = enabledTypes.includes(entry.type);
          const id = `category-${entry.type}`;
          return (
            <li key={entry.type}>
              <label
                htmlFor={id}
                className={`flex w-full cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3.5 text-left transition duration-200 ${
                  checked
                    ? 'border-accent/45 bg-[rgb(183_168_245/0.12)] shadow-[0_0_28px_rgb(183_168_245/0.1)]'
                    : 'border-line bg-black/25 hover:border-accent/30 hover:bg-[rgb(183_168_245/0.06)]'
                } ${locked ? 'pointer-events-none' : ''}`}
              >
                <input
                  id={id}
                  type="checkbox"
                  className="cf-check mt-0.5"
                  checked={checked}
                  disabled={locked}
                  onChange={() => {
                    onToggle(entry.type);
                  }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-snow">{copy.title}</span>
                  <span className="mt-1 block text-xs leading-relaxed text-mist-dim">
                    {copy.example}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      {!locked && hasExperimental && (
        <p className="mt-3 text-[0.7rem] leading-relaxed text-mist-dim">
          Some categories can miss matches — review the findings list before you create the clean
          file.
        </p>
      )}

      <WordBlacklist
        entries={blacklistWords}
        onChange={onBlacklistChange}
        redactionTag={redactionTag}
        onRedactionTagChange={onRedactionTagChange}
        locked={locked}
      />
    </section>
  );
}
