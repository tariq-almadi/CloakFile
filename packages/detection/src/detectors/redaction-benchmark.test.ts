import { describe, expect, it } from 'vitest';

import { AddressDetector } from './address-detector.js';
import { BankAccountDetector } from './bank-account-detector.js';
import { PhoneDetector } from './phone-detector.js';
import { SsnDetector } from './ssn-detector.js';

const sample =
  'Direct Phone: +1 (555) 382-9104 / Alternate: 555-842-1099. ' +
  'Billing Address: 742 Evergreen Terrace, Suite 400, Springfield, OR 97477. ' +
  'Social Security Number prefix verification: ***-**-4819. ' +
  'routing transit number 122000496, account number 9981827364. ' +
  'Hotline: 1-800-555-DATA';

describe('redaction benchmark patterns', () => {
  it('finds fictional 555 numbers and a vanity toll-free line', () => {
    const values = new PhoneDetector().detect({ text: sample }).map((detection) => detection.value);
    expect(values).toContain('+1 (555) 382-9104');
    expect(values).toContain('555-842-1099');
    expect(values).toContain('1-800-555-DATA');
  });

  it('finds a masked SSN, a checksummed routing number, and a labeled account', () => {
    expect(new SsnDetector().detect({ text: sample }).map((detection) => detection.value)).toContain(
      '***-**-4819',
    );
    const accounts = new BankAccountDetector().detect({ text: sample }).map((detection) => detection.value);
    expect(accounts).toContain('122000496');
    expect(accounts).toContain('9981827364');
  });

  it('finds a full US street address', () => {
    const [address] = new AddressDetector().detect({ text: sample });
    expect(address?.value).toBe('742 Evergreen Terrace, Suite 400, Springfield, OR 97477');
  });
});
