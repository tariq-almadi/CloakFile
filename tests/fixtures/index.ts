/**
 * Shared test fixtures.
 *
 * IMPORTANT: every value here is synthetic. `4111 1111 1111 1111` is the
 * publicly documented Visa test number; `123-45-6789` is the canonical
 * placeholder SSN; the phone numbers use the 555 reserved block. Real personal
 * data must never enter this repository, including in test fixtures — a fixture
 * is committed forever and is exactly the kind of accidental disclosure this
 * product exists to prevent.
 */

export const SAMPLE_TEXT = [
  "John Doe's phone number is +1 514-555-0132.",
  'His email is john.doe@example.com.',
  'His credit card number is 4111 1111 1111 1111.',
  'John Doe can also be reached at john.doe@example.com.',
  'Server logs show 192.168.13.240 and https://intranet.example.com/reports.',
  'His social security number is 123-45-6789.',
].join('\n');

export const SAMPLE_CSV = [
  'name,email,phone',
  'John Doe,john.doe@example.com,+1 514-555-0132',
  'Jane Smith,jane.smith@example.com,+1 514-555-0177',
].join('\n');

export const SAMPLE_JSON = JSON.stringify(
  {
    customer: { name: 'John Doe', email: 'john.doe@example.com' },
    note: 'Call +1 514-555-0132 before shipping.',
  },
  null,
  2,
);

/** Values that must be absent from any sanitized output derived from `SAMPLE_TEXT`. */
export const SAMPLE_TEXT_SECRETS = [
  'john.doe@example.com',
  '4111 1111 1111 1111',
  '4111111111111111',
  '123-45-6789',
] as const;

export function toBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}
