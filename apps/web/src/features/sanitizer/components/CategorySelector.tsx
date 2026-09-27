import { useState, type JSX } from 'react';

import {
  MAX_CUSTOM_PATTERNS,
  MAX_CUSTOM_PATTERN_LENGTH,
  type CustomPatternInput,
  type DetectorCoverageDto,
  type PIIType,
} from '@cloakfile/shared';

import { CATEGORY_COPY } from '../category-copy.js';

interface CategorySelectorProps {
  readonly enabledTypes: readonly PIIType[];
  readonly coverage: readonly DetectorCoverageDto[];
  readonly customPatterns: readonly CustomPatternInput[];
  readonly onToggle: (piiType: PIIType) => void;
  readonly onCustomPatternsChange: (patterns: readonly CustomPatternInput[]) => void;
  readonly locked?: boolean;
}

/**
 * Step 2: choose what to remove.
 *
 * Only categories with a working detector are listed. Checked = remove from the
 * clean file. Unchecked = leave that kind of info alone.
 */
export function CategorySelector({
  enabledTypes,
  coverage,
  customPatterns,
  onToggle,
  onCustomPatternsChange,
  locked = false,
}: CategorySelectorProps): JSX.Element {
  const [patternName, setPatternName] = useState('');
  const [pattern, setPattern] = useState('');
  const [ignoreCase, setIgnoreCase] = useState(false);
  const supported = coverage.filter((entry) => entry.maturity !== 'stub');
  const hasExperimental = supported.some((entry) => entry.maturity === 'experimental');
  const trimmedName = patternName.trim();
  const trimmedPattern = pattern.trim();
  const validName = /^[A-Z][A-Z0-9_]{0,31}$/u.test(trimmedName);
  const duplicateName = customPatterns.some((entry) => entry.name === trimmedName);
  const canAddPattern =
    !locked &&
    customPatterns.length < MAX_CUSTOM_PATTERNS &&
    validName &&
    !duplicateName &&
    trimmedPattern.length > 0 &&
    trimmedPattern.length <= MAX_CUSTOM_PATTERN_LENGTH;

  function addPattern(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!canAddPattern) return;

    onCustomPatternsChange([
      ...customPatterns,
      { name: trimmedName, pattern: trimmedPattern, ignoreCase },
    ]);
    setPatternName('');
    setPattern('');
    setIgnoreCase(false);
  }

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

      <div className="mt-5 border-t border-line pt-5">
        <h3 className="font-semibold text-snow">Custom patterns</h3>
        <p className="mt-1 text-sm text-mist-dim">
          Add words, phrases, or regex rules to find additional information.
        </p>

        {customPatterns.length > 0 && (
          <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-black/20">
            {customPatterns.map((entry, index) => (
              <li
                key={`${entry.name}-${String(index)}`}
                className="flex min-w-0 items-center justify-between gap-3 px-3 py-2.5"
              >
                <span className="min-w-0">
                  <span className="block font-medium text-snow">{entry.name}</span>
                  <code className="block truncate text-xs text-mist-dim">{entry.pattern}</code>
                </span>
                <button
                  type="button"
                  className="shrink-0 text-sm text-mist-dim underline underline-offset-4 hover:text-snow disabled:opacity-50"
                  disabled={locked}
                  aria-label={`Remove ${entry.name} pattern`}
                  onClick={() => {
                    onCustomPatternsChange(customPatterns.filter((_, itemIndex) => itemIndex !== index));
                  }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <form className="mt-3 grid gap-3" onSubmit={addPattern}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm text-mist">
              Placeholder label
              <input
                className="w-full rounded-xl border border-line bg-black/25 px-3 py-2.5 text-sm text-snow outline-none focus:border-accent/60 disabled:opacity-50"
                value={patternName}
                onChange={(event) => setPatternName(event.currentTarget.value.toUpperCase())}
                maxLength={32}
                placeholder="EXAMPLE_ID"
                autoComplete="off"
                disabled={locked || customPatterns.length >= MAX_CUSTOM_PATTERNS}
              />
            </label>
            <label className="grid gap-1.5 text-sm text-mist">
              Word, phrase, or regex
              <input
                className="w-full rounded-xl border border-line bg-black/25 px-3 py-2.5 text-sm text-snow outline-none focus:border-accent/60 disabled:opacity-50"
                value={pattern}
                onChange={(event) => setPattern(event.currentTarget.value)}
                maxLength={MAX_CUSTOM_PATTERN_LENGTH}
                placeholder="\\bEMP-\\d{6}\\b"
                autoComplete="off"
                disabled={locked || customPatterns.length >= MAX_CUSTOM_PATTERNS}
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-mist">
              <input
                className="cf-check"
                type="checkbox"
                checked={ignoreCase}
                onChange={(event) => setIgnoreCase(event.currentTarget.checked)}
                disabled={locked || customPatterns.length >= MAX_CUSTOM_PATTERNS}
              />
              Ignore letter case
            </label>
            <button type="submit" className="cf-btn cf-btn-primary" disabled={!canAddPattern}>
              Add pattern
            </button>
          </div>

          {duplicateName && <p className="text-xs text-danger">Use a unique label.</p>}
          {customPatterns.length >= MAX_CUSTOM_PATTERNS && (
            <p className="text-xs text-mist-dim">You have reached the pattern limit.</p>
          )}
        </form>
      </div>
    </section>
  );
}
