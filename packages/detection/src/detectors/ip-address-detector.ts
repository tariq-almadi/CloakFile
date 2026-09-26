import type { RawDetection } from '@sds/shared';

import type { DetectionInput, Detector } from '../types.js';

/** Dotted quad with a range-checked octet, so `999.1.1.1` and version numbers are excluded. */
const OCTET = '(?:25[0-5]|2[0-4]\\d|1\\d{2}|[1-9]?\\d)';
const IPV4_PATTERN = new RegExp(`(?<![\\d.])${OCTET}(?:\\.${OCTET}){3}(?![\\d.])`, 'gu');

/** Full-form IPv6 plus the common compressed forms. Bounded quantifiers only. */
const IPV6_PATTERN = /(?<![:\w])(?:[0-9A-Fa-f]{1,4}:){2,7}[0-9A-Fa-f]{1,4}(?![:\w])/gu;

export class IPAddressDetector implements Detector {
  readonly name = 'ip-address';
  readonly types = ['IP_ADDRESS'] as const;
  readonly maturity = 'reference' as const;

  detect({ text }: DetectionInput): readonly RawDetection[] {
    const detections: RawDetection[] = [];

    for (const match of text.matchAll(IPV4_PATTERN)) {
      detections.push({
        type: 'IP_ADDRESS',
        start: match.index,
        end: match.index + match[0].length,
        value: match[0],
        // Dotted quads collide with software version numbers, so this is not 0.95.
        confidence: 0.85,
        detector: this.name,
        metadata: { version: 4 },
      });
    }

    for (const match of text.matchAll(IPV6_PATTERN)) {
      detections.push({
        type: 'IP_ADDRESS',
        start: match.index,
        end: match.index + match[0].length,
        value: match[0],
        confidence: 0.9,
        detector: this.name,
        metadata: { version: 6 },
      });
    }

    return detections;
  }
}
