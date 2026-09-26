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

  return (
    <section className="rounded border border-slate-300 p-4">
      <h2 className="font-semibold">1. Upload a document</h2>

      <input
        type="file"
        className="mt-2 block"
        accept={acceptedExtensions.join(',')}
        onChange={handleChange}
      />

      {file !== null && (
        <p className="mt-2 text-sm text-slate-600">
          {file.name} ({Math.ceil(file.size / 1024)} KB)
        </p>
      )}

      <p className="mt-2 text-xs text-slate-500">
        Your document is processed on our server and is never sent to an external AI service. It is
        held in memory only, and deleted once you download the sanitized version.
      </p>
    </section>
  );
}
