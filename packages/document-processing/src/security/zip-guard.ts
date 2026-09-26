import { SuspiciousDocumentError } from '@cloakfile/shared';

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
/** EOCD is 22 bytes plus a comment of at most 65535. */
const MAX_EOCD_SEARCH = 22 + 0xffff;

export interface ZipInspection {
  readonly entryCount: number;
  readonly totalCompressedBytes: number;
  readonly totalUncompressedBytes: number;
  readonly entryNames: readonly string[];
}

export interface ZipGuardLimits {
  readonly maxEntries: number;
  readonly maxTotalUncompressedBytes: number;
  readonly maxCompressionRatio: number;
}

export const DEFAULT_ZIP_LIMITS: ZipGuardLimits = {
  maxEntries: 512,
  maxTotalUncompressedBytes: 256 * 1024 * 1024,
  maxCompressionRatio: 120,
};

/**
 * Read a ZIP central directory without decompressing anything.
 *
 * DOCX (and XLSX, PPTX, ODT) are ZIP containers, so every OOXML upload is an
 * untrusted archive. Reading the declared sizes from the central directory lets
 * us reject a decompression bomb *before* allocating memory for it, which is
 * the only point at which rejection is cheap.
 *
 * Declared sizes are attacker-controlled and may lie. They are therefore a
 * pre-filter, not a guarantee: a real extractor must also enforce a hard cap on
 * bytes actually read out of the stream. Both layers are required.
 */
export function inspectZip(bytes: Uint8Array): ZipInspection {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOffset = findEndOfCentralDirectory(view, bytes.byteLength);

  if (eocdOffset === -1) {
    throw new SuspiciousDocumentError(
      'This file claims to be a ZIP container but has no directory.',
    );
  }

  const entryCount = view.getUint16(eocdOffset + 10, true);
  const directoryOffset = view.getUint32(eocdOffset + 16, true);

  if (directoryOffset >= bytes.byteLength) {
    throw new SuspiciousDocumentError('ZIP directory offset points outside the file.');
  }

  let cursor = directoryOffset;
  let totalCompressedBytes = 0;
  let totalUncompressedBytes = 0;
  const entryNames: string[] = [];
  const decoder = new TextDecoder('utf-8');

  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > bytes.byteLength) {
      throw new SuspiciousDocumentError('ZIP directory is truncated.');
    }
    if (view.getUint32(cursor, true) !== CENTRAL_DIRECTORY_SIGNATURE) {
      throw new SuspiciousDocumentError('ZIP directory contains a malformed entry.');
    }

    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);

    totalCompressedBytes += compressedSize;
    totalUncompressedBytes += uncompressedSize;
    entryNames.push(decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength)));

    cursor += 46 + nameLength + extraLength + commentLength;
  }

  return { entryCount, totalCompressedBytes, totalUncompressedBytes, entryNames };
}

/**
 * Reject archives whose declared contents are implausible.
 *
 * Also rejects absolute paths and `..` segments in entry names: a ZIP entry name
 * is attacker-controlled text that some extractors will happily use as a
 * filesystem path ("zip slip"). We never write entries to disk, but the check
 * belongs with the parser so it cannot be forgotten by whoever adds DOCX
 * extraction later.
 */
export function assertSafeZip(
  inspection: ZipInspection,
  limits: ZipGuardLimits = DEFAULT_ZIP_LIMITS,
): void {
  if (inspection.entryCount > limits.maxEntries) {
    throw new SuspiciousDocumentError('This archive contains an implausible number of entries.', {
      details: { entryCount: inspection.entryCount, limit: limits.maxEntries },
    });
  }

  if (inspection.totalUncompressedBytes > limits.maxTotalUncompressedBytes) {
    throw new SuspiciousDocumentError('This archive expands to more data than we will process.', {
      details: { limit: limits.maxTotalUncompressedBytes },
    });
  }

  if (inspection.totalCompressedBytes > 0) {
    const ratio = inspection.totalUncompressedBytes / inspection.totalCompressedBytes;
    if (ratio > limits.maxCompressionRatio) {
      throw new SuspiciousDocumentError(
        'This archive has a compression ratio typical of a decompression bomb.',
        { details: { ratio: Math.round(ratio), limit: limits.maxCompressionRatio } },
      );
    }
  }

  for (const name of inspection.entryNames) {
    if (name.startsWith('/') || name.includes('..') || /^[A-Za-z]:/u.test(name)) {
      throw new SuspiciousDocumentError('This archive contains an unsafe entry path.');
    }
  }
}

function findEndOfCentralDirectory(view: DataView, byteLength: number): number {
  const lowerBound = Math.max(0, byteLength - MAX_EOCD_SEARCH);
  for (let offset = byteLength - 22; offset >= lowerBound; offset -= 1) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) return offset;
  }
  return -1;
}
