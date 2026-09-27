import type { JSX } from 'react';

export type FlowStep = 1 | 2 | 3 | 4;

interface StepProgressProps {
  readonly current: FlowStep;
}

const STEPS: readonly { readonly id: FlowStep; readonly label: string }[] = [
  { id: 1, label: 'Upload' },
  { id: 2, label: 'Choose' },
  { id: 3, label: 'Review' },
  { id: 4, label: 'Download' },
];

/**
 * Shows where the user is in the flow. Later steps stay visually locked until
 * earlier work is done, which avoids the “step 2 suddenly unlocked” feeling
 * when capabilities finish loading on a refresh.
 */
export function StepProgress({ current }: StepProgressProps): JSX.Element {
  return (
    <ol className="flex items-center gap-1 sm:gap-2" aria-label="Progress">
      {STEPS.map((step, index) => {
        const done = step.id < current;
        const active = step.id === current;
        return (
          <li key={step.id} className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
            <div
              className={`flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-2xl px-1 py-2 transition duration-300 ${
                active
                  ? 'bg-[rgb(183_168_245/0.12)] shadow-[0_0_24px_rgb(183_168_245/0.12)]'
                  : done
                    ? 'bg-white/[0.03]'
                    : 'opacity-45'
              }`}
            >
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition duration-300 ${
                  active
                    ? 'bg-accent text-ink shadow-[0_0_18px_rgb(183_168_245/0.45)]'
                    : done
                      ? 'bg-ok/20 text-ok'
                      : 'border border-line bg-black/30 text-mist-dim'
                }`}
              >
                {done ? '✓' : step.id}
              </span>
              <span
                className={`truncate text-[0.68rem] font-semibold tracking-wide uppercase ${
                  active ? 'text-accent-bright' : done ? 'text-mist' : 'text-mist-dim'
                }`}
              >
                {step.label}
              </span>
            </div>
            {index < STEPS.length - 1 && (
              <div
                aria-hidden
                className={`hidden h-px w-3 shrink-0 sm:block ${
                  done ? 'bg-accent/50' : 'bg-line'
                }`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
