/**
 * Lets an interface accept both synchronous and asynchronous implementations.
 *
 * Deterministic detectors are synchronous today. Future detectors (OCR, a local
 * ML model) will be asynchronous. Typing the seam this way means adding one
 * later does not change every call site.
 */
export type MaybePromise<T> = T | Promise<T>;
