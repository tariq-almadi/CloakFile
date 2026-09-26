import { FORMAT_EXTENSIONS, type DocumentFormat } from '@cloakfile/shared';

const UNSAFE_CHARACTERS = /[^A-Za-z0-9._-]/gu;
const MAX_DISPLAY_LENGTH = 80;

/**
 * Reduce an uploaded filename to something safe to echo back and to put in a
 * `Content-Disposition` header.
 *
 * An uploaded filename is attacker-controlled text. It has historically been
 * used for path traversal (`../../etc/passwd`), for Windows device names
 * (`CON`, `NUL`), for header injection via CR/LF, and for XSS when rendered
 * unescaped. This system never uses a filename as a path — storage is in memory
 * and keyed by a generated id — but the name still reaches a header and the DOM,
 * so it is normalised rather than trusted.
 *
 * The approach is allowlist-based: strip everything that is not an ASCII
 * alphanumeric, dot, underscore or hyphen. That is aggressive for non-Latin
 * filenames, which is an accepted trade-off at this layer; the value is
 * cosmetic and the user already knows what they uploaded.
 */
export function toSafeFileName(rawName: string, format: DocumentFormat): string {
  const withoutPath = rawName.split(/[/\\]/u).pop() ?? '';
  const base = withoutPath.replace(/\.[^.]*$/u, '');

  const cleaned = base
    .normalize('NFKD')
    .replace(UNSAFE_CHARACTERS, '_')
    // Leading dots create hidden files; runs of dots enable traversal tricks.
    .replace(/\.{2,}/gu, '.')
    .replace(/^[._-]+/u, '')
    .slice(0, MAX_DISPLAY_LENGTH);

  const safeBase = cleaned.length === 0 ? 'document' : cleaned;

  // The extension comes from the format WE detected, not from what was uploaded.
  return `${safeBase}${FORMAT_EXTENSIONS[format]}`;
}

/** `sanitized-report.txt` from `report.txt`. */
export function toSanitizedFileName(safeFileName: string): string {
  return `sanitized-${safeFileName}`;
}
