import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { httpError } from '../../../shared/csv';
import { parseInput, type FileService } from '../../../shared/file-service';

// ?ids=a,b,c — the service checks there are 2 to 5 different ones.
const compareQuery = z.object({
  ids: z.string().transform((s) => s.split(',').map((id) => id.trim()).filter(Boolean)),
});
type IdParams = { Params: { id: string } };

/**
 * Content-Disposition for a download. Node rejects header values with characters outside Latin-1,
 * so the exact name goes in RFC 5987 `filename*` (UTF-8, percent-encoded), and `filename` carries a
 * plain ASCII fallback for older clients: accents dropped, anything else replaced with "_".
 */
function attachment(name: string) {
  const fallback = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]|["\\]/g, '_');
  // encodeURIComponent leaves ! ' ( ) * as they are; RFC 5987 needs ' ( ) * encoded, and ! is encoded too for safety.
  const exact = encodeURIComponent(name).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${exact}`;
}

/** All API routes: each reads its HTTP input, calls the file service buildApp created and writes the reply. */
export async function fileRoutes(app: FastifyInstance, { files }: { files: FileService }) {
  app.get('/files', async () => files.list());

  app.post('/files', async (req) => {
    const file = await req.file();
    if (!file) throw httpError(400, 'No file uploaded');
    // A file that isn't .csv is not read, so upload refuses it as unsupported even when it is over the size limit.
    const text = file.filename.toLowerCase().endsWith('.csv') ? (await file.toBuffer()).toString('utf8') : '';
    return files.upload({ name: file.filename, text });
  });

  app.get<IdParams>('/files/:id/rows', async (req) => files.rows(req.params.id, req.query));

  app.get<IdParams>('/files/:id/download', async (req, reply) => {
    const { name, text } = await files.download(req.params.id);
    reply.header('content-disposition', attachment(name)).type('text/csv');
    return text;
  });

  app.post('/files/archive', async (req) => files.archive(req.body));

  app.post('/process', async (req, reply) => {
    const outcome = await files.process(req.body);
    return 'conflict' in outcome ? reply.code(409).send(outcome.conflict) : outcome.file;
  });

  app.post('/generate', async (req) => files.generate(req.body));

  app.get('/compare', async (req) => files.compare(parseInput(compareQuery, req.query).ids));
}
