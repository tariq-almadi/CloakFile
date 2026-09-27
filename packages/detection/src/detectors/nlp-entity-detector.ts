import type { PIIType, RawDetection } from '@cloakfile/shared';
import nlp from 'compromise';

import { findLiteralOccurrences } from '../internal/text.js';
import type { DetectionInput, Detector } from '../types.js';
import {
  clipPersonSurface,
  extendPersonSpan,
  isHeadingPhrase,
  stripPossessiveSuffix,
} from './person-name-heuristics.js';

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
      const surface = type === 'PERSON' ? clipPersonSurface(trimSurface(raw)) : trimSurface(raw);
      // One or two characters is noise; it would match half the document.
      if (surface.length < 3 || surface.includes('\u001f') || seen.has(surface)) continue;
      if (isHeadingPhrase(surface)) continue;
      // PDF/NLP artifacts: section titles glued across newlines or ampersands.
      if (type === 'ORGANIZATION' && !isPlausibleOrganization(surface)) continue;
      seen.add(surface);

      for (const occurrence of findLiteralOccurrences(text, surface)) {
        const span =
          type === 'PERSON'
            ? extendPersonSpan(text, occurrence.start, occurrence.end)
            : { start: occurrence.start, end: occurrence.end, value: surface };

        if (span.value.includes('\u001f') || isHeadingPhrase(span.value)) continue;

        const kind = type === 'PERSON' && ORG_SUFFIX.test(span.value) ? 'ORGANIZATION' : type;

        detections.push({
          type: kind,
          start: span.start,
          end: span.end,
          value: span.value,
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
const ORG_SUFFIX = /\b(?:Bank|Inc|Corp|Corporation|LLC|Ltd|University|Laboratories|Holdings)\b/u;

function trimSurface(raw: string): string {
  return stripPossessiveSuffix(
    raw
      .trim()
      .replace(/^[^\p{L}\p{N}]+/u, '')
      .replace(/[^\p{L}\p{N}]+$/u, ''),
  );
}

/** Drop NLP org hits that are clearly section titles, not company names. */
function isPlausibleOrganization(surface: string): boolean {
  if (/[\n\r]|\s{2,}/u.test(surface)) return false;
  if (surface.includes('&')) return false;
  const words = surface.split(/\s+/u).filter((word) => word.length > 0);
  if (words.length < 2 || words.length > 4) return false;
  return true;
}
