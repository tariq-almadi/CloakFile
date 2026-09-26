import type { DetectionMetadata, PIIType } from '@cloakfile/shared';

/**
 * Reduce a detected value to the key that decides whether two occurrences are
 * "the same thing" and therefore share a placeholder.
 *
 * This is what makes `514-555-1234` and `+1 514 555 1234` collapse to one
 * `[PHONE_001]`, and `John Doe` / `JOHN DOE` to one `[PERSON_001]`. Getting it
 * wrong in the lax direction merges two different people; getting it wrong in
 * the strict direction scatters one person across several placeholders. Both
 * are wrong, so the rules are per-type rather than universal.
 *
 * The returned key is derived from sensitive data and is therefore itself
 * sensitive: it stays in memory, inside the session, and is never logged or
 * persisted.
 */
export function canonicalizeValue(
  type: PIIType,
  value: string,
  metadata?: DetectionMetadata,
): string {
  switch (type) {
    case 'CREDIT_CARD':
    case 'SSN':
    case 'BANK_ACCOUNT':
    case 'GOVERNMENT_ID':
      // Separators are cosmetic; the digits are the identity.
      return value.replace(/\D/gu, '');

    case 'PHONE':
      // Not full E.164 normalisation: that needs a region and can fail. Digits
      // plus a leading-plus marker is enough to merge the common variants
      // without ever merging two genuinely different numbers.
      return `${value.trimStart().startsWith('+') ? '+' : ''}${value.replace(/\D/gu, '')}`;

    case 'EMAIL':
      // Case-insensitive domain, and in practice case-insensitive local part.
      return value.trim().toLowerCase();

    case 'URL':
    case 'IP_ADDRESS':
      return value.trim().toLowerCase();

    case 'PERSON':
    case 'ORGANIZATION':
    case 'ADDRESS':
      // Unicode-normalise so that composed and decomposed accents match, then
      // fold case and collapse whitespace.
      return value.normalize('NFKC').trim().toLowerCase().replace(/\s+/gu, ' ');

    case 'DATE_OF_BIRTH':
      return value.replace(/\s+/gu, '');

    case 'CUSTOM': {
      // Custom matches are opaque to us, so only exact repeats merge — scoped
      // per pattern, so two patterns matching the same text stay distinct.
      const patternName = metadata?.['patternName'];
      const scope = typeof patternName === 'string' ? patternName : 'CUSTOM';
      return `${scope}:${value}`;
    }
  }
}

/**
 * The label used inside the placeholder token.
 *
 * Custom patterns carry their own name so the output reads `[EMPLOYEE_ID_001]`
 * rather than an undifferentiated `[CUSTOM_001]`.
 */
export function placeholderLabel(type: PIIType, metadata?: DetectionMetadata): string {
  if (type === 'CUSTOM') {
    const patternName = metadata?.['patternName'];
    if (typeof patternName === 'string' && patternName.length > 0) return patternName;
  }
  return type;
}
