/**
 * Luhn (mod 10) checksum.
 *
 * Returns false for anything that is not a run of ASCII digits, and for
 * implausibly short or long inputs. Callers are expected to have normalised
 * separators away first.
 */
export function isLuhnValid(digits: string): boolean {
  if (digits.length < 12 || digits.length > 19) return false;
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
