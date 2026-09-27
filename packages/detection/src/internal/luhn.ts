/**
 * Luhn (mod 10) checksum.
 *
 * Returns false for anything that is not a run of ASCII digits. Callers choose
 * the length bounds that make sense for their identifier (cards vs SINs).
 */
export function isLuhnValid(digits: string, minLength = 12, maxLength = 19): boolean {
  if (digits.length < minLength || digits.length > maxLength) return false;
  if (!/^\d+$/u.test(digits)) return false;

  let sum = 0;
  let double = false;

  for (let index = digits.length - 1; index >= 0; index -= 1) {
    const codePoint = digits.charCodeAt(index);
    let digit = codePoint - 48;

    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }

    sum += digit;
    double = !double;
  }

  return sum % 10 === 0;
}
