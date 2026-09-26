import type { DetectionMetadata } from '../types/detection.js';
import type { PIIType } from '../types/pii.js';

/**
 * How much of an original value may ever cross the network boundary to the
 * browser.
 *
 * - `masked`     a heavily reduced hint (first character + bullets). Enough for
 *                a human to recognise "yes, that's the name I meant".
 * - `suffix`     a short non-identifying suffix plus a network/brand hint,
 *                e.g. `Visa •••• 1111`. Used where the suffix is industry
 *                standard and not independently identifying.
 * - `type-only`  nothing derived from the value at all. Used for credentials
 *                and government-issued identifiers.
 */
export type PreviewPolicy = 'masked' | 'suffix' | 'type-only';

/**
 * The single source of truth for what the frontend is permitted to see.
 *
 * This is an exhaustive `Record`, so adding a `PIIType` without assigning it a
 * policy is a compile error. That is deliberate: the decision must be made
 * consciously rather than inherited from a default.
 */
export const PREVIEW_POLICY: Readonly<Record<PIIType, PreviewPolicy>> = {
  PERSON: 'masked',
  ORGANIZATION: 'masked',
  ADDRESS: 'masked',
  EMAIL: 'masked',
  URL: 'masked',
  PHONE: 'suffix',
  IP_ADDRESS: 'suffix',
  CREDIT_CARD: 'suffix',
  DATE_OF_BIRTH: 'type-only',
  SSN: 'type-only',
  GOVERNMENT_ID: 'type-only',
  BANK_ACCOUNT: 'type-only',
  CUSTOM: 'type-only',
};

const BULLET = '\u2022';

function bullets(count: number): string {
  return BULLET.repeat(Math.max(1, Math.min(count, 4)));
}

function maskToken(token: string): string {
  // Code points rather than UTF-16 units, so an accented or non-Latin first
  // character is not split in half by the mask.
  const characters = Array.from(token);
  const first = characters[0];
  if (first === undefined) return '';
  if (characters.length === 1) return first;
  return `${first}${bullets(characters.length - 1)}`;
}

function maskWords(value: string): string {
  const masked = value.trim().split(/\s+/u).map(maskToken).join(' ');
  return masked === '' ? bullets(3) : masked;
}

function maskHost(hostname: string): string {
  const labels = hostname.split('.');
  // Keep the public suffix; a second-level domain can identify an employer.
  return labels
    .map((label, index) => (index === labels.length - 1 ? label : maskToken(label)))
    .join('.');
}

function maskEmail(value: string): string {
  const at = value.lastIndexOf('@');
  if (at <= 0) return maskWords(value);
  return `${maskToken(value.slice(0, at))}@${maskHost(value.slice(at + 1))}`;
}

function maskUrl(value: string): string {
  try {
    const { protocol, hostname } = new URL(value);
    return `${protocol}//${maskHost(hostname)}`;
  } catch {
    return maskWords(value);
  }
}

function digitSuffix(value: string, length: number): string {
  const digits = value.replace(/\D/gu, '');
  return digits.length >= length ? digits.slice(-length) : '';
}

function suffixPreview(
  type: PIIType,
  value: string,
  metadata: DetectionMetadata | undefined,
): string {
  if (type === 'CREDIT_CARD') {
    const brandValue = metadata?.['cardBrand'];
    const brand = typeof brandValue === 'string' ? brandValue : 'Card';
    const last4 = digitSuffix(value, 4);
    return last4 === '' ? `${brand} ${bullets(4)}` : `${brand} ${bullets(4)} ${last4}`;
  }

  if (type === 'IP_ADDRESS') {
    const octets = value.split('.');
    if (octets.length !== 4) return bullets(4);
    return `${octets[0] ?? ''}.${octets[1] ?? ''}.${bullets(3)}.${bullets(3)}`;
  }

  const last2 = digitSuffix(value, 2);
  return last2 === '' ? bullets(4) : `${bullets(3)} ${bullets(3)} ${bullets(2)}${last2}`;
}

/**
 * Convert an original sensitive value into a string that is safe to show.
 *
 * This is the ONLY sanctioned way to derive client-visible text from an
 * original value. Nothing else in the codebase may place a raw detected value
 * into an API response. Reviewers: treat any other path as a defect.
 */
export function buildPreview(type: PIIType, value: string, metadata?: DetectionMetadata): string {
  switch (PREVIEW_POLICY[type]) {
    case 'type-only':
      return `${bullets(4)} ${bullets(4)}`;
    case 'suffix':
      return suffixPreview(type, value, metadata);
    case 'masked':
      if (type === 'EMAIL') return maskEmail(value);
      if (type === 'URL') return maskUrl(value);
      return maskWords(value);
  }
}
