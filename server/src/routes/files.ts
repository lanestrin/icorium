import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { FileMeta } from '../../../shared/types';
import { getAdapter } from '../adapters';
import { detectResult, findProblems, processRows } from '../processing';
import { compareResults } from '../lib/compare';
import { httpError, parseCsv, toCsv } from '../lib/csv';
import { storage } from '../lib/storage';

const processBody = z.object({ fileId: z.string().min(1), processor: z.enum(['validation', 'mass', 'classification']) });
const archiveBody = z.object({ ids: z.array(z.string().min(1)).min(1), archived: z.boolean() });
const compareQuery = z.object({ a: z.string().min(1), b: z.string().min(1) }).refine((q) => q.a !== q.b, 'Choose two different files');
// Previews load a page at a time so a large CSV never has to be rendered all at once.
const pageQuery = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
});
type IdParams = { Params: { id: string } };

export async function fileRoutes(app: FastifyInstance) {
  // Backfill missing counts and reconcile historical input statuses without rewriting CSVs.
  app.get('/files', async () =>
    Promise.all((await storage.list()).map(async (m) => {
      let problemRows = m.problemRows;
      if (problemRows === undefined) {
        const { headers, rows } = parseCsv(await storage.read(m.id));
        problemRows = findProblems(headers, rows).total;
      }
      const status = m.status === 'Processed' ? 'Processed' : problemRows > 0 ? 'Needs Review' : 'Ready';
      if (m.problemRows === problemRows && m.status === status) return m;
      return storage.patch(m.id, { problemRows, status });
    })),
  );

  // Upload: parse + schema check always run here, regardless of processing function.
  app.post('/files', async (req) => {
    const file = await req.file();
    if (!file) throw httpError(400, 'No file uploaded');
    if (!file.filename.toLowerCase().endsWith('.csv')) throw httpError(400, 'Only .csv files are supported');
    const text = (await file.toBuffer()).toString('utf8');
    const { headers, rows } = parseCsv(text);
    getAdapter(headers);
    const base = { name: file.filename, text, rows: rows.length, columns: headers.length, problemRows: findProblems(headers, rows).total };
    // A previously exported result is registered as a result, so it can be compared in a later session.
    const result = detectResult(headers);
    if (result) return storage.save({ ...base, status: 'Processed', ...result });
    return storage.save({ ...base, status: base.problemRows > 0 ? 'Needs Review' : 'Ready' });
  });

  app.get<IdParams>('/files/:id/rows', async (req) => {
    const { offset, limit } = pageQuery.parse(req.query);
    const meta = await storage.get(req.params.id);
    const { headers, rows } = parseCsv(await storage.read(meta.id));
    return {
      headers,
      rows: rows.slice(offset, offset + limit),
      offset,
      totalRows: rows.length,
      generatedColumns: meta.generatedColumns ?? [],
      problems: findProblems(headers, rows),
    };
  });

  app.get<IdParams>('/files/:id/download', async (req, reply) => {
    const meta = await storage.get(req.params.id);
    reply.header('content-disposition', `attachment; filename="${meta.name}"`).type('text/csv');
    return storage.read(meta.id);
  });

  // Archive or restore several files at once. Only the flag changes; no CSV is moved or deleted.
  app.post('/files/archive', async (req) => {
    const { ids, archived } = archiveBody.parse(req.body);
    const unique = [...new Set(ids)];
    for (const id of unique) await storage.get(id); // 404 before changing anything
    const updated: FileMeta[] = [];
    for (const id of unique) updated.push(await storage.patch(id, { archived }));
    return updated;
  });

  app.post('/process', async (req) => {
    const { fileId, processor } = processBody.parse(req.body);
    const meta = await storage.get(fileId);
    if (meta.status === 'Processed') throw httpError(400, 'Select an input file, not a result file');
    if (meta.archived) throw httpError(400, `Restore ${meta.name} before processing it`);
    const { headers, rows } = parseCsv(await storage.read(fileId));
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
        problemRows: out.problemRows,
      },
      true,
    );
  });

  app.get('/compare', async (req) => {
    const { a, b } = compareQuery.parse(req.query);
    const load = async (id: string) => {
      const meta = await storage.get(id);
      const csv = parseCsv(await storage.read(id));
      if (meta.status !== 'Processed') return { meta, ...csv };
      const result = detectResult(csv.headers);
      if (!result) throw httpError(400, `${meta.name} has an unrecognized result schema. Regenerate it from its original input.`);
      return { meta: { ...meta, ...result }, ...csv };
    };
    const [A, B] = await Promise.all([load(a), load(b)]);
    // Which rows in each file have problems, so the comparison can say which file an error is in.
    return { ...compareResults(A, B), problemsA: findProblems(A.headers, A.rows), problemsB: findProblems(B.headers, B.rows) };
  });
}
