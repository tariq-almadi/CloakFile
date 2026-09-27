import type { ChangeEvent, JSX } from 'react';

interface UploadPanelProps {
  readonly file: File | null;
  readonly acceptedExtensions: readonly string[];
  readonly onSelect: (file: File) => void;
}

/**
 * Step 1: choose a document.
 *
 * `accept` is a convenience for the file picker only. The server re-derives the
 * format from the bytes; nothing here is treated as a security control.
 */
export function UploadPanel({ file, acceptedExtensions, onSelect }: UploadPanelProps): JSX.Element {
  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    const selected = event.target.files?.[0];
    if (selected !== undefined) onSelect(selected);
  }

  const formats = acceptedExtensions.map((ext) => ext.replace(/^\./u, '').toUpperCase()).join(' · ');

  return (
    <section className="cf-panel p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-lg font-semibold text-snow">
          <span className="mr-2 text-accent">1.</span>
          Upload a document
        </h2>
        {formats.length > 0 && (
          <span className="cf-pill bg-[rgb(183_168_245/0.12)] text-accent">{formats}</span>
        )}
      </div>

      <label className="cf-file">
        <input
          type="file"
          className="sr-only"
          accept={acceptedExtensions.join(',')}
          onChange={handleChange}
        />
        <span
          className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[rgb(183_168_245/0.12)] text-xl text-accent shadow-[0_0_24px_rgb(183_168_245/0.15)]"
          aria-hidden
        >
          ↑
        </span>
        <span className="text-sm font-semibold text-snow">
          {file === null ? 'Choose a file' : 'Replace file'}
        </span>
        <span className="max-w-sm text-center text-xs leading-relaxed text-mist-dim">
          {file === null
            ? 'PDF, Word, or plain text'
            : `${file.name} · ${String(Math.ceil(file.size / 1024))} KB`}
        </span>
      </label>

      <aside className="mt-4 flex gap-3 rounded-2xl border border-line bg-[rgb(183_168_245/0.06)] p-4">
        <span
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[rgb(183_168_245/0.15)] text-sm text-accent"
          aria-hidden
        >
          ◎
        </span>
        <p className="text-sm leading-relaxed text-mist">
          Your document is processed on our server and is never sent to an external AI service. It is
          held in memory only, and deleted once you download the sanitized version.
        </p>
      </aside>
    </section>
  );
}
