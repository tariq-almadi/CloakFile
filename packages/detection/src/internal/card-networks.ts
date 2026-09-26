interface CardNetwork {
  readonly brand: string;
  readonly lengths: readonly number[];
  readonly test: (digits: string) => boolean;
}

function inRange(prefix: string, low: number, high: number): boolean {
  const value = Number.parseInt(prefix, 10);
  return Number.isInteger(value) && value >= low && value <= high;
}

/**
 * Issuer identification rules, used only to raise confidence and to label the
 * preview ("Visa •••• 1111"). A number that passes Luhn but matches no known
 * network is still reported, at lower confidence: unknown issuers exist, and
 * missing a real card is worse than flagging an extra number.
 */
const NETWORKS: readonly CardNetwork[] = [
  { brand: 'Visa', lengths: [13, 16, 19], test: (d) => d.startsWith('4') },
  {
    brand: 'Mastercard',
    lengths: [16],
    test: (d) => inRange(d.slice(0, 2), 51, 55) || inRange(d.slice(0, 4), 2221, 2720),
  },
  { brand: 'American Express', lengths: [15], test: (d) => /^3[47]/u.test(d) },
  {
    brand: 'Discover',
    lengths: [16, 19],
    test: (d) =>
      d.startsWith('6011') || d.startsWith('65') || inRange(d.slice(0, 6), 622126, 622925),
  },
  { brand: 'JCB', lengths: [16, 17, 18, 19], test: (d) => inRange(d.slice(0, 4), 3528, 3589) },
  { brand: 'Diners Club', lengths: [14, 16, 19], test: (d) => /^3(?:0[0-5]|[689])/u.test(d) },
  { brand: 'UnionPay', lengths: [16, 17, 18, 19], test: (d) => d.startsWith('62') },
];

/** Returns the issuing network's display name, or `undefined` if unrecognised. */
export function identifyCardNetwork(digits: string): string | undefined {
  for (const network of NETWORKS) {
    if (network.lengths.includes(digits.length) && network.test(digits)) {
      return network.brand;
    }
  }
  return undefined;
}
