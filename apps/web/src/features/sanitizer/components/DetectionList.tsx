import type { JSX } from 'react';

import { PII_TYPE_LABELS, type PlaceholderGroupDto } from '@sds/shared';

interface DetectionListProps {
  readonly groups: readonly PlaceholderGroupDto[];
  readonly excludedPlaceholders: readonly string[];
  readonly onToggle: (placeholder: string) => void;
}

/**
 * Step 3: review what was found.
 *
 * PRIVACY: this component cannot display an original value, because the API
 * never sends one. `group.preview` is the masked hint produced by the server's
 * preview policy — `Visa •••• 1111`, never `4111 1111 1111 1111`. If a raw
 * value ever appears on this screen, the defect is on the server, in
 * `buildPreview` or in whatever bypassed it.
 */
export function DetectionList({
  groups,
  excludedPlaceholders,
  onToggle,
}: DetectionListProps): JSX.Element {
  if (groups.length === 0) {
    return (
      <section className="rounded border border-slate-300 p-4">
        <h2 className="font-semibold">3. Detected information</h2>
        <p className="mt-2 text-sm text-slate-600">
          Nothing was detected in the categories you selected.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded border border-slate-300 p-4">
      <h2 className="font-semibold">3. Detected information</h2>
      <p className="mt-1 text-xs text-slate-500">
        Untick anything you would rather keep in the document.
      </p>

      <ul className="mt-2 divide-y divide-slate-200">
        {groups.map((group) => (
          <li key={group.placeholder} className="flex items-center gap-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={!excludedPlaceholders.includes(group.placeholder)}
              onChange={() => {
                onToggle(group.placeholder);
              }}
            />
            <span className="w-40 shrink-0 text-xs uppercase text-slate-500">
              {PII_TYPE_LABELS[group.type]}
            </span>
            <code className="shrink-0">{group.placeholder}</code>
            <span className="text-slate-600">{group.preview}</span>
            {group.occurrences > 1 && (
              <span className="text-xs text-slate-400">x{group.occurrences}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
