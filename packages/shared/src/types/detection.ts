import type { PIIType } from './pii.js';

export type DetectionId = string;

/**
 * Non-sensitive facts a detector learned while matching.
 *
 * HARD RULE: metadata must never contain the original value or any part of it
 * that the preview policy would forbid showing. It is designed to be safe to
 * serialise to the client (e.g. `{ cardBrand: 'visa', last4: '1111' }`).
 */
export type DetectionMetadata = Readonly<Record<string, string | number | boolean>>;

/**
 * A match as produced by a single detector, before the engine has de-duplicated
 * overlapping claims or assigned an identity.
 *
 * `start` / `end` are UTF-16 code-unit offsets into the extracted text, using
 * the usual half-open convention: `text.slice(start, end) === value`.
 */
export interface RawDetection {
  readonly type: PIIType;
  readonly start: number;
  readonly end: number;
  /** The matched substring. Backend-internal: never serialise this to a client. */
  readonly value: string;
  /** 0..1. How sure the detector is. Deterministic validators should score high. */
  readonly confidence: number;
  /** `Detector.name` of whichever detector produced this match. */
  readonly detector: string;
  readonly metadata?: DetectionMetadata;
}

/** A detection that survived overlap resolution and was given a stable identity. */
export interface Detection extends RawDetection {
  readonly id: DetectionId;
}

/**
 * A detection that has been assigned a placeholder.
 *
 * `groupId` is the canonical key that makes repeated values collapse: every
 * occurrence of "John Doe" shares one `groupId` and therefore one placeholder.
 */
export interface AnonymizedDetection extends Detection {
  readonly placeholder: string;
  readonly groupId: string;
}

/**
 * All occurrences of one logical value, collapsed into a single reviewable item.
 *
 * This is the unit the user selects in the review UI. Offsets stay server-side;
 * `preview` is the found text so the user can decide what to keep.
 */
export interface PlaceholderGroup {
  readonly groupId: string;
  readonly type: PIIType;
  readonly placeholder: string;
  /** Found text shown so the user can decide keep vs remove. */
  readonly preview: string;
  readonly occurrences: number;
  /** Highest confidence among the occurrences in this group. */
  readonly confidence: number;
  readonly detectors: readonly string[];
  readonly metadata?: DetectionMetadata;
}
