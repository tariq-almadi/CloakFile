/**
 * The categories of sensitive information the product can reason about.
 *
 * Adding a member here is a deliberate, cross-cutting decision: it affects the
 * preview policy (`../privacy/preview-policy.ts`), the placeholder label map,
 * the detector registry and the UI category list. Do not add one without also
 * assigning it a preview policy.
 */
export const PII_TYPES = [
  'PERSON',
  'ORGANIZATION',
  'EMAIL',
  'PHONE',
  'CREDIT_CARD',
  'SSN',
  'GOVERNMENT_ID',
  'BANK_ACCOUNT',
  'ADDRESS',
  'DATE_OF_BIRTH',
  'IP_ADDRESS',
  'URL',
  'CUSTOM',
] as const;

export type PIIType = (typeof PII_TYPES)[number];

const PII_TYPE_SET: ReadonlySet<string> = new Set<string>(PII_TYPES);

export function isPIIType(value: unknown): value is PIIType {
  return typeof value === 'string' && PII_TYPE_SET.has(value);
}

/**
 * Human-readable labels for the UI. Kept here rather than in the web app so
 * that the API, the docs and the frontend cannot drift apart.
 */
export const PII_TYPE_LABELS: Readonly<Record<PIIType, string>> = {
  PERSON: 'Names / people',
  ORGANIZATION: 'Organizations',
  EMAIL: 'Email addresses',
  PHONE: 'Phone numbers',
  CREDIT_CARD: 'Credit card numbers',
  SSN: 'Social security numbers',
  GOVERNMENT_ID: 'Government IDs',
  BANK_ACCOUNT: 'Bank / account numbers',
  ADDRESS: 'Addresses',
  DATE_OF_BIRTH: 'Dates of birth',
  IP_ADDRESS: 'IP addresses',
  URL: 'URLs',
  CUSTOM: 'Custom patterns',
};

/**
 * Relative specificity, used to break ties when two detectors claim spans of
 * equal length and equal confidence. A more specific, checksum-validated type
 * should win over a probabilistic one.
 *
 * `CUSTOM` ranks highest because it encodes explicit user intent.
 */
export const PII_TYPE_PRIORITY: Readonly<Record<PIIType, number>> = {
  CUSTOM: 100,
  CREDIT_CARD: 90,
  SSN: 85,
  GOVERNMENT_ID: 80,
  BANK_ACCOUNT: 75,
  EMAIL: 70,
  PHONE: 65,
  URL: 60,
  IP_ADDRESS: 55,
  DATE_OF_BIRTH: 40,
  ADDRESS: 35,
  PERSON: 30,
  ORGANIZATION: 25,
};
