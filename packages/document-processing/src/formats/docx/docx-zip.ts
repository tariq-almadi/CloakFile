import { crc32, deflateRawSync, inflateRawSync } from 'node:zlib';

import { MalformedDocumentError, SuspiciousDocumentError } from '@cloakfile/shared';

import { assertSafeZip, inspectZip, DEFAULT_ZIP_LIMITS } from '../../security/zip-guard.js';

export interface ZipPart {
  readonly name: string;
  readonly data: Uint8Array;
}

const LOCAL_HEADER = 0x04034b50;

/**
 * Inflate a DOCX only after the central-directory guard has accepted it, and
 * stop if the bytes actually produced exceed the same cap. Declared sizes can
 * lie; the cap on the inflater cannot.
 */
export function readZip(bytes: Uint8Array): ZipPart[] {
  const inspection = inspectZip(bytes);
  assertSafeZip(inspection);

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEndOfCentralDirectory(view, bytes.byteLength);
  const entryCount = view.getUint16(eocd + 10, true);
  let cursor = view.getUint32(eocd + 16, true);
  const parts: ZipPart[] = [];
  let produced = 0;
  const decoder = new TextDecoder('utf-8');

  for (let index = 0; index < entryCount; index += 1) {
    const method = view.getUint16(cursor + 10, true);
    const flags = view.getUint16(cursor + 8, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));

    if ((flags & 0x1) !== 0) {
      throw new MalformedDocumentError('Encrypted Word documents are not supported.');
    }
    if (method !== 0 && method !== 8) {
      throw new MalformedDocumentError('This Word document uses an unsupported compression method.');
    }

    const dataOffset = localDataOffset(view, bytes.byteLength, localOffset);
    const compressed = bytes.subarray(dataOffset, dataOffset + compressedSize);
    const remaining = DEFAULT_ZIP_LIMITS.maxTotalUncompressedBytes - produced;
    const data =
      method === 0
        ? compressed
        : inflateRawSync(compressed, { maxOutputLength: remaining });

    produced += data.byteLength;
    if (produced > DEFAULT_ZIP_LIMITS.maxTotalUncompressedBytes) {
      throw new SuspiciousDocumentError('This archive expands to more data than we will process.');
    }

    parts.push({ name, data: new Uint8Array(data) });
    cursor += 46 + nameLength + extraLength + commentLength;
  }

  return parts;
}

export function writeZip(parts: readonly ZipPart[]): Uint8Array {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const part of parts) {
    const name = Buffer.from(part.name, 'utf8');
    const stored = Buffer.from(part.data);
    const compressed = deflateRawSync(stored);
    const checksum = crc32(stored);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(LOCAL_HEADER, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(stored.length, 22);
    localHeader.writeUInt16LE(name.length, 26);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(stored.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt32LE(offset, 42);

    locals.push(localHeader, name, compressed);
    central.push(centralHeader, name);
    offset += localHeader.length + name.length + compressed.length;
  }

  const centralBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(parts.length, 8);
  end.writeUInt16LE(parts.length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(offset, 16);

  return new Uint8Array(Buffer.concat([...locals, centralBytes, end]));
}

function localDataOffset(view: DataView, byteLength: number, localOffset: number): number {
  if (localOffset + 30 > byteLength || view.getUint32(localOffset, true) !== LOCAL_HEADER) {
    throw new MalformedDocumentError('This Word document has a broken archive entry.');
  }
  const nameLength = view.getUint16(localOffset + 26, true);
  const extraLength = view.getUint16(localOffset + 28, true);
  return localOffset + 30 + nameLength + extraLength;
}

function findEndOfCentralDirectory(view: DataView, byteLength: number): number {
  const lowerBound = Math.max(0, byteLength - (22 + 0xffff));
  for (let offset = byteLength - 22; offset >= lowerBound; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  throw new MalformedDocumentError('This Word document has no archive directory.');
}
