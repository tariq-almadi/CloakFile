export { DetectionEngine } from './engine.js';
export { DetectorRegistry, type DetectorCoverage } from './registry.js';
export { resolveOverlaps } from './resolve-overlaps.js';
export { createDefaultRegistry, type DefaultRegistryOptions } from './default-registry.js';
export type {
  DetectionEngineOptions,
  DetectionEngineResult,
  DetectionInput,
  Detector,
  DetectorMaturity,
} from './types.js';

export { CreditCardDetector } from './detectors/credit-card-detector.js';
export { CustomRegexDetector } from './detectors/custom-regex-detector.js';
export { EmailDetector } from './detectors/email-detector.js';
export { IPAddressDetector } from './detectors/ip-address-detector.js';
export { NlpEntityDetector } from './detectors/nlp-entity-detector.js';
export { PhoneDetector } from './detectors/phone-detector.js';
export { SsnDetector } from './detectors/ssn-detector.js';
export { UrlDetector } from './detectors/url-detector.js';
export { StubDetector } from './detectors/stub-detector.js';

export { isLuhnValid } from './internal/luhn.js';
export { identifyCardNetwork } from './internal/card-networks.js';
export { compileSafePattern } from './internal/regex-guard.js';
