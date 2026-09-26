import type { CustomPattern } from '@sds/shared';

import { CreditCardDetector } from './detectors/credit-card-detector.js';
import { CustomRegexDetector } from './detectors/custom-regex-detector.js';
import { EmailDetector } from './detectors/email-detector.js';
import { IPAddressDetector } from './detectors/ip-address-detector.js';
import { NlpEntityDetector } from './detectors/nlp-entity-detector.js';
import { PhoneDetector } from './detectors/phone-detector.js';
import { SsnDetector } from './detectors/ssn-detector.js';
import {
  addressDetector,
  bankAccountDetector,
  dateOfBirthDetector,
  governmentIdDetector,
} from './detectors/stub-detector.js';
import { UrlDetector } from './detectors/url-detector.js';
import { DetectorRegistry } from './registry.js';

export interface DefaultRegistryOptions {
  /** Per-request user patterns. Compiled through the ReDoS guard. */
  readonly customPatterns?: readonly CustomPattern[];
}

/**
 * The registry the application runs with.
 *
 * This is the one place that knows the full detector list, so adding a detector
 * is a single-line change here plus one new file. Nothing else in the codebase
 * references detectors by name.
 *
 * Built per request rather than shared as a singleton, because
 * `CustomRegexDetector` is constructed from user input and must not leak
 * between requests.
 */
export function createDefaultRegistry(options: DefaultRegistryOptions = {}): DetectorRegistry {
  const registry = DetectorRegistry.from([
    new EmailDetector(),
    new PhoneDetector(),
    new CreditCardDetector(),
    new SsnDetector(),
    new IPAddressDetector(),
    new UrlDetector(),
    new NlpEntityDetector(),
    addressDetector,
    governmentIdDetector,
    bankAccountDetector,
    dateOfBirthDetector,
  ]);

  const customPatterns = options.customPatterns ?? [];
  if (customPatterns.length > 0) {
    registry.register(new CustomRegexDetector(customPatterns));
  }

  return registry;
}
