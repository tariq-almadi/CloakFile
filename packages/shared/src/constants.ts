import type { DocumentFormat } from './types/document.js';

/** Defaults. The API overrides these from the environment; see `.env.example`. */
export const DEFAULT_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const DEFAULT_SESSION_TTL_SECONDS = 900;

/**
 * Upper bound on extracted text length. Detection is roughly linear in text
 * size, but every detector plus overlap resolution runs over it, so an
 * unbounded document is a denial-of-service vector.
 */
export const MAX_EXTRACTED_TEXT_LENGTH = 5_000_000;

/** Guard against a user-supplied regex that is expensive merely to compile. */
export const MAX_CUSTOM_PATTERN_LENGTH = 200;
export const MAX_CUSTOM_PATTERNS = 20;

/**
 * Canonical media types per format. Used for Content-Type on download and as
 * one signal (never the only one) when validating an upload.
 */
export const FORMAT_MEDIA_TYPES: Readonly<Record<DocumentFormat, string>> = {
  txt: 'text/plain',
  csv: 'text/csv',
  json: 'application/json',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export const FORMAT_EXTENSIONS: Readonly<Record<DocumentFormat, string>> = {
  txt: '.txt',
  csv: '.csv',
  json: '.json',
  pdf: '.pdf',
  docx: '.docx',
};
