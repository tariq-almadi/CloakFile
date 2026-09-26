import { FileTooLargeError, InvalidInputError } from '@sds/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import type { DocumentsController, UploadPayload } from '../controllers/documents-controller.js';

interface SessionParams {
  readonly sessionId: string;
}

/**
 * HTTP surface for the document flow.
 *
 * These handlers do three things only: pull data off the request, call the
 * controller, and shape the response. No validation logic, no file handling and
 * no business rules live here.
 */
export function registerDocumentRoutes(
  app: FastifyInstance,
  controller: DocumentsController,
): void {
  app.post('/api/v1/documents/analyze', async (request, reply) => {
    const payload = await readUpload(request);
    const result = await controller.analyze(payload);
    return reply.status(201).send(result);
  });

  app.post<{ Params: SessionParams }>(
    '/api/v1/documents/:sessionId/sanitize',
    async (request, reply) => {
      const result = await controller.sanitize(request.params.sessionId, request.body);
      return reply.send(result);
    },
  );

  app.get<{ Params: SessionParams }>('/api/v1/documents/:sessionId/download', (request, reply) => {
    const { record, fileName } = controller.download(request.params.sessionId);
    const generated = record.generated;

    if (generated === undefined) {
      throw new InvalidInputError('This document has not been sanitized yet.');
    }

    return (
      reply
        .header('Content-Type', generated.mediaType)
        // `attachment` prevents the browser from rendering the file inline,
        // which matters because a sanitized document is still user-controlled
        // content. `filename` is the normalised name, never the uploaded one.
        .header('Content-Disposition', `attachment; filename="${fileName}"`)
        // The response contains a document. It must not be cached anywhere.
        .header('Cache-Control', 'no-store, max-age=0')
        .header('X-Content-Type-Options', 'nosniff')
        .send(Buffer.from(generated.bytes))
    );
  });

  app.delete<{ Params: SessionParams }>('/api/v1/documents/:sessionId', (request, reply) => {
    controller.discard(request.params.sessionId);
    return reply.status(204).send();
  });
}

/**
 * Pull the file and the options field off a multipart request.
 *
 * Reads at most one file. `truncated` is checked explicitly because the
 * multipart parser stops at the configured limit rather than throwing, and a
 * silently truncated document would be analysed incompletely — producing a
 * "sanitized" file built from partial text.
 */
async function readUpload(request: FastifyRequest): Promise<UploadPayload> {
  if (!request.isMultipart()) {
    throw new InvalidInputError('Upload the document as multipart/form-data.');
  }

  let fileBuffer: Buffer | undefined;
  let fileName = 'document';
  let mediaType = 'application/octet-stream';
  let rawOptions: string | undefined;

  for await (const part of request.parts()) {
    if (part.type === 'file') {
      if (fileBuffer !== undefined) {
        throw new InvalidInputError('Upload exactly one document at a time.');
      }
      fileBuffer = await part.toBuffer();
      if (part.file.truncated) {
        throw new FileTooLargeError('The uploaded file exceeds the size limit.');
      }
      fileName = part.filename;
      mediaType = part.mimetype;
      continue;
    }

    if (part.fieldname === 'options' && typeof part.value === 'string') {
      rawOptions = part.value;
    }
  }

  if (fileBuffer === undefined) {
    throw new InvalidInputError('No document was included in the upload.');
  }

  return {
    bytes: new Uint8Array(fileBuffer),
    fileName,
    mediaType,
    rawOptions,
  };
}
