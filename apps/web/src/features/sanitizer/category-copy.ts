import type { PIIType } from '@cloakfile/shared';

/**
 * Plain-language copy for the category checklist.
 *
 * Examples are fictional so the user can picture what each switch covers
 * without reading detector jargon.
 */
export const CATEGORY_COPY: Readonly<
  Record<PIIType, { readonly title: string; readonly example: string }>
> = {
  PERSON: {
    title: 'People’s names',
    example: 'e.g. Jane Smith, Dr. Aris Thorne',
  },
  ORGANIZATION: {
    title: 'Company names',
    example: 'e.g. Apex Holdings, Chase Manhattan Bank',
  },
  EMAIL: {
    title: 'Email addresses',
    example: 'e.g. jane@company.com',
  },
  PHONE: {
    title: 'Phone numbers',
    example: 'e.g. +1 (555) 382-9104',
  },
  CREDIT_CARD: {
    title: 'Credit card numbers',
    example: 'e.g. 4111 2222 3333 4444',
  },
  SSN: {
    title: 'Social Insurance Numbers',
    example: 'e.g. 046-454-286',
  },
  GOVERNMENT_ID: {
    title: 'Government IDs',
    example: 'Passport or national ID numbers',
  },
  BANK_ACCOUNT: {
    title: 'Bank account details',
    example: 'e.g. routing and account numbers',
  },
  ADDRESS: {
    title: 'Street addresses',
    example: 'e.g. 742 Evergreen Terrace, Springfield, OR',
  },
  DATE_OF_BIRTH: {
    title: 'Dates of birth',
    example: 'Birth dates written in the document',
  },
  IP_ADDRESS: {
    title: 'IP addresses',
    example: 'e.g. 192.168.1.10',
  },
  URL: {
    title: 'Web links',
    example: 'e.g. https://example.com/account',
  },
  CUSTOM: {
    title: 'Blocked words',
    example: 'Words and phrases you add yourself',
  },
};

/** Friendly titles for detection review rows. */
export function categoryTitle(
  type: PIIType,
  metadata?: Readonly<Record<string, string | number | boolean>>,
): string {
  if (type === 'CUSTOM') {
    const patternName = metadata?.['patternName'];
    if (typeof patternName === 'string' && patternName.length > 0) {
      return patternName.replace(/_/gu, ' ');
    }
    return 'Blocked word';
  }
  return CATEGORY_COPY[type].title;
}
