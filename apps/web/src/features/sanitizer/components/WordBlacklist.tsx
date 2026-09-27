import { useState, type FormEvent, type JSX, type KeyboardEvent } from 'react';

import { MAX_CUSTOM_PATTERNS } from '@cloakfile/shared';

import type { BlacklistWord } from '../word-blacklist.js';

interface WordBlacklistProps {
  readonly entries: readonly BlacklistWord[];
  readonly onChange: (entries: readonly BlacklistWord[]) => void;
  readonly locked?: boolean;
}

/**
 * Plain-language word/phrase blacklist.
 *
 * Users type words they want gone; we turn them into safe regex patterns for
 * the existing custom-pattern detector so TXT, PDF and DOCX all behave the same.
 */
export function WordBlacklist({
  entries,
  onChange,
  locked = false,
}: WordBlacklistProps): JSX.Element {
  const [draft, setDraft] = useState('');
  const [ignoreCase, setIgnoreCase] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const atLimit = entries.length >= MAX_CUSTOM_PATTERNS;
  const trimmed = draft.trim().replace(/\s+/gu, ' ');
  const duplicate = entries.some(
    (entry) => entry.word.toLowerCase() === trimmed.toLowerCase(),
  );
  const canAdd = !locked && !atLimit && trimmed.length > 0 && !duplicate;

  function addWord(): void {
    if (!canAdd) {
      if (duplicate) setError('That word is already on the list.');
      return;
    }

    onChange([...entries, { word: trimmed, ignoreCase }]);
    setDraft('');
    setError(null);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    addWord();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      addWord();
    }
  }

  return (
    <div className="mt-5 border-t border-line pt-5">
      <h3 className="font-semibold text-snow">Blocked words</h3>
      <p className="mt-1 text-sm text-mist-dim">
        Add any word or phrase to remove from the clean file — works for PDF, Word, and text.
      </p>

      {entries.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {entries.map((entry, index) => (
            <li key={`${entry.word}-${String(index)}`}>
              <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-accent/30 bg-[rgb(183_168_245/0.1)] px-3 py-1.5 text-sm text-snow">
                <span className="min-w-0 truncate font-medium">{entry.word}</span>
                {!entry.ignoreCase && (
                  <span className="shrink-0 text-[0.65rem] uppercase tracking-wide text-mist-dim">
                    Aa
                  </span>
                )}
                <button
                  type="button"
                  className="shrink-0 text-mist-dim transition hover:text-snow disabled:opacity-40"
                  disabled={locked}
                  aria-label={`Remove ${entry.word}`}
                  onClick={() => {
                    onChange(entries.filter((_, itemIndex) => itemIndex !== index));
                  }}
                >
                  ×
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <form className="mt-3 flex flex-col gap-3" onSubmit={onSubmit}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            className="min-w-0 flex-1 rounded-xl border border-line bg-black/25 px-3.5 py-2.5 text-sm text-snow outline-none transition placeholder:text-mist-dim focus:border-accent/60 disabled:opacity-50"
            value={draft}
            onChange={(event) => {
              setDraft(event.currentTarget.value);
              setError(null);
            }}
            onKeyDown={onKeyDown}
            maxLength={200}
            placeholder="e.g. Project Nightfall, CONFIDENTIAL"
            autoComplete="off"
            disabled={locked || atLimit}
            aria-label="Word or phrase to block"
          />
          <button type="submit" className="cf-btn cf-btn-primary shrink-0" disabled={!canAdd}>
            Add word
          </button>
        </div>

        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-mist">
          <input
            className="cf-check"
            type="checkbox"
            checked={ignoreCase}
            onChange={(event) => setIgnoreCase(event.currentTarget.checked)}
            disabled={locked || atLimit}
          />
          Ignore letter case
        </label>

        {error !== null && <p className="text-xs text-danger">{error}</p>}
        {atLimit && (
          <p className="text-xs text-mist-dim">
            Limit reached ({String(MAX_CUSTOM_PATTERNS)} words). Remove one to add another.
          </p>
        )}
      </form>
    </div>
  );
}
