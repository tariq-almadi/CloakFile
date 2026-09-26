import type { RawDetection } from '@sds/shared';

import { identifyCardNetwork } from '../internal/card-networks.js';
import { isLuhnValid } from '../internal/luhn.js';
import type { DetectionInput, Detector } from '../types.js';

/**
 * Candidate extraction: runs of digits optionally separated by single spaces or
 * hyphens. This intentionally over-matches — validation does the real filtering.
 * Bounded quantifiers keep it linear.
 */
const CANDIDATE_PATTERN = /\d(?:[ -]?\d){11,21}/gu;

/**
 * Credit card detection, by validation rather than by shape.
 *
 * A "13-19 digit number" rule would flag order numbers, ISBNs, tracking numbers
 * and timestamps. The pipeline here is:
 *
 *   1. extract a generous candidate span
 *   2. normalise away spaces and hyphens
 *   3. reject on length
 *   4. reject on the Luhn checksum        <- eliminates ~90% of false positives
 *   5. reject obvious non-cards (repeated or sequential digits)
 *   6. identify the issuing network       <- raises confidence, labels the preview
 *
 * A Luhn-valid number from an unrecognised network is still reported, at lower
 * confidence: failing to redact a real card is far worse than one extra
 * placeholder, and the user reviews the results anyway.
 */
export class CreditCardDetector implements Detector {
  readonly name = 'credit-card';
  readonly types = ['CREDIT_CARD'] as const;
  readonly maturity = 'reference' as const;

  detect({ text }: DetectionInput): readonly RawDetection[] {
    const detections: RawDetection[] = [];
    CANDIDATE_PATTERN.lastIndex = 0;

    for (const match of text.matchAll(CANDIDATE_PATTERN)) {
      const candidate = match[0];
      const start = match.index;

      for (const window of windowsOf(candidate, start)) {
        const digits = window.value.replace(/[ -]/gu, '');

        if (digits.length < 13 || digits.length > 19) continue;
        if (!isLuhnValid(digits)) continue;
        if (isImplausible(digits)) continue;

        const brand = identifyCardNetwork(digits);

        detections.push({
          type: 'CREDIT_CARD',
          start: window.start,
          end: window.start + window.value.length,
          value: window.value,
          confidence: brand === undefined ? 0.75 : 0.98,
          detector: this.name,
          // Safe metadata only: the brand and the last four digits are what the
          // preview policy permits showing. The full number stays server-side.
          metadata:
            brand === undefined
              ? { last4: digits.slice(-4) }
              : { cardBrand: brand, last4: digits.slice(-4) },
        });
        break; // One card per candidate run; take the longest valid reading.
      }
    }

    return detections;
  }
}

interface Window {
  readonly value: string;
  readonly start: number;
}

/**
 * A long digit run can contain a card plus surrounding noise (`ref 4111...`
 * concatenated into an id). Try the full candidate first, then progressively
 * shorter prefixes and suffixes, so the longest Luhn-valid reading wins.
 */
function windowsOf(candidate: string, offset: number): Window[] {
  const windows: Window[] = [{ value: candidate, start: offset }];

  const digitPositions: number[] = [];
  for (let index = 0; index < candidate.length; index += 1) {
    const character = candidate[index];
    if (character !== undefined && character >= '0' && character <= '9') {
      digitPositions.push(index);
    }
  }

  if (digitPositions.length <= 19) return windows;

  // Slide a 16-digit window (the overwhelmingly common length) across the run.
  for (let first = 0; first + 16 <= digitPositions.length; first += 1) {
    const from = digitPositions[first];
    const to = digitPositions[first + 15];
    if (from === undefined || to === undefined) continue;
    windows.push({ value: candidate.slice(from, to + 1), start: offset + from });
  }

  return windows;
}

/**
 * Numbers that pass Luhn by coincidence. `0000000000000000` is Luhn-valid, and
 * so are many placeholder/sequential values that appear in test data.
 */
function isImplausible(digits: string): boolean {
  const first = digits[0];
  if (first !== undefined && digits.split('').every((digit) => digit === first)) return true;

  let ascending = true;
  for (let index = 1; index < digits.length; index += 1) {
    const previous = digits.charCodeAt(index - 1);
    const current = digits.charCodeAt(index);
    if (current !== previous + 1) {
      ascending = false;
      break;
    }
  }
  return ascending;
}
