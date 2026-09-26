import { InvalidInputError, MAX_CUSTOM_PATTERN_LENGTH } from '@cloakfile/shared';

/**
 * A quantified group whose body is itself quantified or alternated — `(a+)+`,
 * `(a|a)*`, `(\s*\w+)+`. Matching these against a crafted string backtracks
 * exponentially.
 */
const NESTED_QUANTIFIER = /\((?:\?:)?[^()]*[*+][^()]*\)\s*[*+{]/u;
const QUANTIFIED_ALTERNATION = /\((?:\?:)?[^()]*\|[^()]*\)\s*[*+{]/u;

export interface SafePatternOptions {
  readonly ignoreCase?: boolean;
}

/**
 * Compile a user-supplied regular expression, rejecting shapes that are known
 * ReDoS hazards.
 *
 * This is a heuristic, not a proof, and it is only one layer. The others are
 * the cap on extracted text length and the cap on pattern length. Note that a
 * synchronous regex cannot be interrupted once running, so prevention is the
 * only real defence available in-process — see docs/THREAT-MODEL.md (T-07) for
 * why worker-thread isolation is on the Phase 2 list.
 */
export function compileSafePattern(source: string, options: SafePatternOptions = {}): RegExp {
  if (source.length === 0 || source.length > MAX_CUSTOM_PATTERN_LENGTH) {
    throw new InvalidInputError(
      `Custom patterns must be between 1 and ${String(MAX_CUSTOM_PATTERN_LENGTH)} characters.`,
    );
  }

  if (NESTED_QUANTIFIER.test(source) || QUANTIFIED_ALTERNATION.test(source)) {
    throw new InvalidInputError(
      'This pattern repeats a group that already repeats, which can hang the server. ' +
        'Rewrite it without a repeated group that itself repeats or alternates.',
    );
  }

  // Backreferences and lookbehind are not inherently unsafe, but they defeat the
  // reasoning above. Keeping the accepted grammar small is deliberate.
  if (/\\[1-9]/u.test(source) || source.includes('(?<')) {
    throw new InvalidInputError(
      'Backreferences and lookbehind are not supported in custom patterns.',
    );
  }

  const flags = options.ignoreCase === true ? 'giu' : 'gu';

  try {
    return new RegExp(source, flags);
  } catch (cause) {
    throw new InvalidInputError('This is not a valid regular expression.', { cause });
  }
}
