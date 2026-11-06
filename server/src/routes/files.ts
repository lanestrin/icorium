import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getAdapter } from '../adapters';
import { detectProcessor, processors, processRows } from '../processing';
import { compareResults } from '../lib/compare';
import { httpError, parseCsv, toCsv } from '../lib/csv';
import { storage } from '../lib/storage';

const processBody = z.object({ fileId: z.string().min(1), processor: z.enum(['validation', 'mass', 'classification']) });
const compareQuery = z.object({ a: z.string().min(1), b: z.string().min(1) }).refine((q) => q.a !== q.b, 'Choose two different files');
// Previews load a page at a time so a large CSV never has to be rendered all at once.
const pageQuery = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
});
type IdParams = { Params: { id: string } };

export async function fileRoutes(app: FastifyInstance) {
  app.get('/files', async () => storage.list());

  // Upload: parse + schema check always run here, regardless of processing function.
  app.post('/files', async (req) => {
    const file = await req.file();
    if (!file) throw httpError(400, 'No file uploaded');
    if (!file.filename.toLowerCase().endsWith('.csv')) throw httpError(400, 'Only .csv files are supported');
    const text = (await file.toBuffer()).toString('utf8');
    const { headers, rows } = parseCsv(text);
    getAdapter(headers);
    const base = { name: file.filename, text, rows: rows.length, columns: headers.length };
    // A previously exported result is registered as a result, so it can be compared in a later session.
    const processor = detectProcessor(headers);
    if (processor) return storage.save({ ...base, status: 'Processed', processor, generatedColumns: processors[processor].columns });
    return storage.save({ ...base, status: 'Ready' });
  });

  app.get<IdParams>('/files/:id/rows', async (req) => {
    const { offset, limit } = pageQuery.parse(req.query);
    const meta = storage.get(req.params.id);
    const { headers, rows } = parseCsv(storage.read(meta.id));
    return { headers, rows: rows.slice(offset, offset + limit), offset, totalRows: rows.length, generatedColumns: meta.generatedColumns ?? [] };
  });

  app.get<IdParams>('/files/:id/download', async (req, reply) => {
    const meta = storage.get(req.params.id);
    reply.header('content-disposition', `attachment; filename="${meta.name}"`).type('text/csv');
    return storage.read(meta.id);
  });

  app.post('/process', async (req) => {
    const { fileId, processor } = processBody.parse(req.body);
    const meta = storage.get(fileId);
    if (meta.status === 'Processed') throw httpError(400, 'Select an input file, not a result file');
    const { headers, rows } = parseCsv(storage.read(fileId));
    const out = processRows(headers, rows, processor);
    const base = meta.name.replace(/\.csv$/i, '');
    return storage.save(
      {
        name: `result_${base}_${processor}.csv`,
        text: toCsv(out.headers, out.rows),
        rows: out.rows.length,
        columns: out.headers.length,
        status: 'Processed',
        processor,
        sourceId: meta.id,
        generatedColumns: out.generated,
      },
      true,
    );
  });

  app.get('/compare', async (req) => {
    const { a, b } = compareQuery.parse(req.query);
    const load = (id: string) => ({ meta: storage.get(id), rows: parseCsv(storage.read(id)).rows });
    return compareResults(load(a), load(b));
  });
}
