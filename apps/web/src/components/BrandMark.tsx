import type { JSX } from 'react';

interface BrandMarkProps {
  readonly size?: 'sm' | 'lg';
}

/**
 * Product mark from the brand asset. Kept as one component so the glow and
 * wordmark stay consistent across the shell.
 */
export function BrandMark({ size = 'lg' }: BrandMarkProps): JSX.Element {
  const isLarge = size === 'lg';

  return (
    <div className={`flex items-center ${isLarge ? 'gap-4' : 'gap-3'}`}>
      <div
        className={`relative shrink-0 ${isLarge ? 'h-16 w-16 sm:h-20 sm:w-20' : 'h-11 w-11'}`}
      >
        <div
          aria-hidden
          className="absolute inset-[-18%] rounded-full bg-[radial-gradient(circle,rgb(183_168_245/0.35),transparent_68%)] blur-md"
        />
        <img
          src="/cloakfile-logo.jpg"
          alt="CloakFile"
          className="relative h-full w-full rounded-2xl object-cover shadow-[0_0_28px_rgb(183_168_245/0.25)]"
        />
      </div>
      <div>
        <p
          className={`font-display font-bold tracking-tight ${isLarge ? 'text-3xl sm:text-4xl' : 'text-xl'}`}
        >
          <span className="text-snow">Cloak</span>
          <span className="text-accent">File</span>
        </p>
        {isLarge && (
          <p className="mt-1 max-w-md text-sm leading-relaxed text-mist">
            Replace secrets with placeholders so a document can leave your desk safely.
          </p>
        )}
      </div>
    </div>
  );
}
