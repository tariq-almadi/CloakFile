import type { PIIType, RawDetection } from '@sds/shared';
import nlp from 'compromise';

import { findLiteralOccurrences } from '../internal/text.js';
import type { DetectionInput, Detector } from '../types.js';

/**
 * Names and organizations, via compromise.
 *
 * compromise is ONE detector among many, not the PII engine. It is a
 * rules-and-lexicon NLP library, so it is fast, fully offline and dependency
 * free — which is exactly what this product needs — but it is also the least
 * precise detector here. It will miss names absent from its lexicon and will
 * occasionally promote a capitalised common noun to a person. Its output is
 * therefore marked `experimental`, scored well below the checksum-backed
 * detectors, and always surfaced for user review.
 *
 * Offsets: rather than trusting compromise's internal term offsets, we take the
 * matched surface text and re-locate it in the original string. That keeps this
 * detector correct regardless of how compromise tokenises or normalises, and it
 * has the useful side effect of catching every repeat of a name it recognised
 * once.
 */
export class NlpEntityDetector implements Detector {
  readonly name = 'nlp-entity';
  readonly types = ['PERSON', 'ORGANIZATION'] as const;
  readonly maturity = 'experimental' as const;

  detect({ text }: DetectionInput): readonly RawDetection[] {
    const document = nlp(text);

    return [
      ...this.#collect(text, toStringArray(document.people().out('array')), 'PERSON', 0.6),
      ...this.#collect(
        text,
        toStringArray(document.organizations().out('array')),
        'ORGANIZATION',
        0.55,
      ),
    ];
  }

  #collect(
    text: string,
    surfaces: readonly string[],
    type: PIIType,
    confidence: number,
  ): RawDetection[] {
    const detections: RawDetection[] = [];
    const seen = new Set<string>();

    for (const raw of surfaces) {
      const surface = trimSurface(raw);
      // One or two characters is noise; it would match half the document.
      if (surface.length < 3 || seen.has(surface)) continue;
      seen.add(surface);

      for (const occurrence of findLiteralOccurrences(text, surface)) {
        detections.push({
          type,
          start: occurrence.start,
          end: occurrence.end,
          value: surface,
          confidence,
          detector: this.name,
        });
      }
    }

    return detections;
  }
}

/**
 * compromise types `.out('array')` loosely, so the result is validated at the
 * boundary rather than asserted. A library returning an unexpected shape should
 * degrade to "no detections", not crash the sanitization of a document.
 */
function toStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

/**
 * Reduce a compromise match to just the entity.
 *
 * compromise hands back surrounding punctuation: sentence-final stops ("Jane
 * Smith."), possessive clitics ("John Doe's"), and — critically for this
 * product — the quotation marks around a value inside a JSON document
 * (`"John Doe`). Replacing a leading quote along with the name would produce
 * structurally invalid JSON, so both ends are trimmed to the entity itself.
 *
 * Note that compromise often returns both "John" and "John Doe" for the same
 * text. Both are kept: the engine's overlap resolution prefers the longer span,
 * which is the correct reading, and arriving there by a general rule is better
 * than special-casing it here.
 */
function trimSurface(raw: string): string {
  return raw
    .trim()
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .replace(/['\u2019]s$/u, '')
    .replace(/[^\p{L}\p{N}]+$/u, '');
}
