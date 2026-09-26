import { detectFormat } from '@cloakfile/document-processing';
import { FileTooLargeError, InvalidInputError, type DocumentFormat } from '@cloakfile/shared';

import { toSafeFileName } from '../security/filename.js';

export interface UploadCandidate {
  readonly bytes: Uint8Array;
  readonly declaredFileName: string;
  readonly declaredMediaType: string;
}

export interface ValidatedUpload {
  readonly bytes: Uint8Array;
  readonly format: DocumentFormat;
  readonly safeFileName: string;
  /** Non-sensitive observations worth logging or showing, e.g. an extension mismatch. */
  readonly notes: readonly string[];
}

/**
 * The gate every uploaded byte passes through before any parser sees it.
 *
 * Order matters and is defensive by design:
 *
 *   1. size    — cheapest check, and the one that bounds everything after it
 *   2. content — what the bytes actually are, via signature and structure
 *   3. name    — normalised last, and only for display
 *
 * The extension and the browser-supplied Content-Type are treated as claims to
 * be checked, never as facts. A mismatch is recorded as a note: it does not by
 * itself mean an attack (people rename files), but it is exactly what an attack
 * looks like, so it should be visible.
 */
export function validateUpload(
  candidate: UploadCandidate,
  limits: { readonly maxFileBytes: number },
): ValidatedUpload {
  if (candidate.bytes.byteLength === 0) {
    throw new InvalidInputError('The uploaded file is empty.');
  }

  if (candidate.bytes.byteLength > limits.maxFileBytes) {
    throw new FileTooLargeError(
      `Files must be ${String(Math.floor(limits.maxFileBytes / 1024 / 1024))} MB or smaller.`,
      { details: { maxBytes: limits.maxFileBytes } },
    );
  }

  const extension = extractExtension(candidate.declaredFileName);
  const detection = detectFormat(candidate.bytes, {
    ...(extension === undefined ? {} : { declaredExtension: extension }),
    declaredMediaType: candidate.declaredMediaType,
  });

  const notes: string[] = [];
  if (detection.declarationMismatch) {
    notes.push(
      `The file extension did not match its contents; it was processed as ${detection.format}.`,
    );
  }

  return {
    bytes: candidate.bytes,
    format: detection.format,
    safeFileName: toSafeFileName(candidate.declaredFileName, detection.format),
    notes,
  };
}

function extractExtension(fileName: string): string | undefined {
  const match = /\.([A-Za-z0-9]{1,8})$/u.exec(fileName);
  return match?.[1]?.toLowerCase();
}
