import type { RawDetection } from '@cloakfile/shared';

import type { DetectionInput, Detector } from '../types.js';

const ROUTING_PATTERN = /(?<![\d-])(\d{9})(?![\d-])/gu;
const ACCOUNT_PATTERN = /(?:account number|acct\.?)\s+(\d{6,17})(?![\d-])/giu;
const ROUTING_CONTEXT = /\b(?:routing|transit|aba|rtn)\b/iu;
const CONTEXT_WINDOW = 48;

/**
 * US routing numbers (ABA checksum) and account numbers that sit next to an
 * explicit label. A bare 9- or 10-digit run is not enough: those collide with
 * order ids and phones.
 */
export class BankAccountDetector implements Detector {
  readonly name = 'bank-account';
  readonly types = ['BANK_ACCOUNT'] as const;
  readonly maturity = 'reference' as const;

  detect({ text }: DetectionInput): readonly RawDetection[] {
    const detections: RawDetection[] = [];

    for (const match of text.matchAll(ROUTING_PATTERN)) {
      const value = match[1];
      const start = match.index;
      if (value === undefined || start === undefined || !isAbaRouting(value)) continue;
      if (!ROUTING_CONTEXT.test(text.slice(Math.max(0, start - CONTEXT_WINDOW), start))) continue;

      detections.push({
        type: 'BANK_ACCOUNT',
        start,
        end: start + value.length,
        value,
        confidence: 0.9,
        detector: this.name,
      });
    }

    for (const match of text.matchAll(ACCOUNT_PATTERN)) {
      const value = match[1];
      const full = match[0];
      const start = match.index;
      if (value === undefined || start === undefined) continue;
      const digitStart = start + full.lastIndexOf(value);

      detections.push({
        type: 'BANK_ACCOUNT',
        start: digitStart,
        end: digitStart + value.length,
        value,
        confidence: 0.85,
        detector: this.name,
      });
    }

    return detections;
  }
}

function isAbaRouting(digits: string): boolean {
  if (!/^\d{9}$/u.test(digits)) return false;
  const weights = [3, 7, 1, 3, 7, 1, 3, 7, 1];
  const sum = [...digits].reduce((total, digit, index) => total + Number(digit) * (weights[index] ?? 0), 0);
  return sum % 10 === 0 && digits !== '000000000';
}
