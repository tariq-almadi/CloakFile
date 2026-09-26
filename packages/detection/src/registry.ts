import type { PIIType } from '@cloakfile/shared';

import type { Detector, DetectorMaturity } from './types.js';

export interface DetectorCoverage {
  readonly type: PIIType;
  readonly maturity: DetectorMaturity;
  readonly detectors: readonly string[];
}

/**
 * The set of detectors available to the engine.
 *
 * Registration is the only coupling point between a detector and the rest of
 * the system, which is what makes the architecture extensible: adding a
 * detector means writing one file and adding one `register` call.
 */
export class DetectorRegistry {
  readonly #byName = new Map<string, Detector>();

  static from(detectors: Iterable<Detector>): DetectorRegistry {
    const registry = new DetectorRegistry();
    for (const detector of detectors) registry.register(detector);
    return registry;
  }

  register(detector: Detector): this {
    if (this.#byName.has(detector.name)) {
      throw new Error(`Detector "${detector.name}" is already registered.`);
    }
    if (detector.types.length === 0) {
      throw new Error(`Detector "${detector.name}" declares no PII types.`);
    }
    this.#byName.set(detector.name, detector);
    return this;
  }

  /** Replaces an existing registration. Used by tests and by custom-pattern wiring. */
  replace(detector: Detector): this {
    this.#byName.set(detector.name, detector);
    return this;
  }

  all(): readonly Detector[] {
    return [...this.#byName.values()];
  }

  /** Detectors that can contribute at least one of the requested types. */
  select(enabledTypes: readonly PIIType[]): readonly Detector[] {
    const enabled = new Set<PIIType>(enabledTypes);
    return this.all().filter((detector) => detector.types.some((type) => enabled.has(type)));
  }

  /**
   * What the product can honestly claim per category.
   *
   * A type's maturity is the best maturity among its detectors, and a type with
   * no detector at all reports as `stub`. The capabilities endpoint surfaces
   * this so the UI can tell the user which checkboxes actually do something.
   */
  coverage(): readonly DetectorCoverage[] {
    const byType = new Map<PIIType, { maturity: DetectorMaturity; detectors: string[] }>();

    for (const detector of this.all()) {
      for (const type of detector.types) {
        const existing = byType.get(type);
        if (existing === undefined) {
          byType.set(type, { maturity: detector.maturity, detectors: [detector.name] });
          continue;
        }
        existing.detectors.push(detector.name);
        if (rank(detector.maturity) > rank(existing.maturity)) {
          existing.maturity = detector.maturity;
        }
      }
    }

    return [...byType.entries()].map(([type, entry]) => ({
      type,
      maturity: entry.maturity,
      detectors: [...entry.detectors].sort((a, b) => a.localeCompare(b)),
    }));
  }
}

function rank(maturity: DetectorMaturity): number {
  switch (maturity) {
    case 'reference':
      return 2;
    case 'experimental':
      return 1;
    case 'stub':
      return 0;
  }
}
