import type { DetectionMetadata, PIIType } from '@cloakfile/shared';

import { canonicalizeValue, placeholderLabel } from './canonicalize.js';
import type { PlaceholderFormatter } from './types.js';

/** `[PERSON_001]`. Zero-padded so placeholders sort naturally in a review list. */
export const bracketFormatter: PlaceholderFormatter = {
  format(label: string, index: number): string {
    return `[${label}_${String(index).padStart(3, '0')}]`;
  },
};

export interface Allocation {
  readonly placeholder: string;
  /**
   * Opaque, client-safe identifier for the group.
   *
   * Explicitly NOT the canonical key. The canonical key is derived directly
   * from the sensitive value ("CREDIT_CARD:4111111111111111"), so exposing it
   * as a group id would hand the browser the very data the placeholder exists
   * to hide. This id is derived from the placeholder instead, which is already
   * unique per group and carries no information about the value.
   */
  readonly groupId: string;
}

/**
 * Assigns each distinct sensitive value a stable placeholder, for the lifetime
 * of one document.
 *
 * Two properties matter:
 *
 *   CONSISTENCY  the same value always gets the same placeholder, so a reader of
 *                the sanitized document can still follow that "[PERSON_001]"
 *                is one person throughout.
 *   ISOLATION    numbering restarts for every document. There is no global
 *                registry of previously seen values — deliberately. A permanent
 *                mapping database would be a permanent store of exactly the
 *                sensitive data this product exists to remove, and would turn
 *                a compromise of our infrastructure into a disclosure of every
 *                document we ever processed.
 *
 * The mapping therefore lives only here, in memory, and dies with the request.
 * It is never logged, never serialised, and never returned to the client.
 */
export class PlaceholderAllocator {
  readonly #formatter: PlaceholderFormatter;
  readonly #byCanonicalKey = new Map<string, Allocation>();
  readonly #countersByLabel = new Map<string, number>();

  constructor(formatter: PlaceholderFormatter = bracketFormatter) {
    this.#formatter = formatter;
  }

  allocate(type: PIIType, value: string, metadata?: DetectionMetadata): Allocation {
    const label = placeholderLabel(type, metadata);

    // Sensitive: never leaves this map, and never leaves the process.
    const canonicalKey = `${label}:${canonicalizeValue(type, value, metadata)}`;

    const existing = this.#byCanonicalKey.get(canonicalKey);
    if (existing !== undefined) return existing;

    const index = (this.#countersByLabel.get(label) ?? 0) + 1;
    this.#countersByLabel.set(label, index);

    const allocation: Allocation = {
      placeholder: this.#formatter.format(label, index),
      groupId: `${label}_${String(index).padStart(3, '0')}`,
    };

    this.#byCanonicalKey.set(canonicalKey, allocation);
    return allocation;
  }

  get size(): number {
    return this.#byCanonicalKey.size;
  }

  /**
   * Drop every mapping.
   *
   * JavaScript gives no guarantee about when the underlying strings are
   * collected, so this is a best-effort reduction of the window in which
   * sensitive values sit in the heap, not a secure wipe. See
   * docs/THREAT-MODEL.md (T-05) for the honest limits of in-process erasure.
   */
  dispose(): void {
    this.#byCanonicalKey.clear();
    this.#countersByLabel.clear();
  }
}
