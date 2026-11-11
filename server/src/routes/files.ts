import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { codeOf, COMPARE_MAX, COMPARE_MIN, FILE_ID_COLUMN, GENERATOR_PARTNERS, PROCESSORS, RESULT_ID_COLUMN, isInputFile, parseFileId, resultFileId, type FileMeta, type ReplaceConflict, type Row } from '../../../shared/types';
import { getAdapter } from '../adapters';
import { detectResult, embeddedSourceId, findProblems, matchesInput, processRows, stampFileIds } from '../processing';
import { compareResults } from '../lib/compare';
import { httpError, parseCsv, toCsv } from '../lib/csv';
import { storage } from '../lib/storage';
import { GENERATOR_MAX_FILES, GENERATOR_MAX_ROWS, generateFiles } from '../lib/generate';

const processBody = z.object({
  fileId: z.string().min(1),
  processor: z.enum(['validation', 'mass', 'classification']),
  replace: z.boolean().default(false), // must be true to overwrite an existing result
});
const archiveBody = z.object({ ids: z.array(z.string().min(1)).min(1), archived: z.boolean() });
// ?ids=a,b,c — 2 to 5 different results.
const compareQuery = z.object({
  ids: z.string().transform((s) => s.split(',').map((id) => id.trim()).filter(Boolean)),
}).transform((q) => q.ids)
  .refine((ids) => ids.length >= COMPARE_MIN && ids.length <= COMPARE_MAX, `Choose ${COMPARE_MIN} to ${COMPARE_MAX} results to compare`)
  .refine((ids) => new Set(ids).size === ids.length, 'Choose different files');
// Previews load a page at a time so a large CSV never has to be rendered all at once.
const pageQuery = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
});
const generateBody = z.object({
  partner: z.enum(GENERATOR_PARTNERS, { message: 'Choose partner A, B or C' }),
  rows: z.number({ message: 'Rows must be a number' }).int('Rows must be a whole number').min(1, 'Generate at least 1 row')
    .max(GENERATOR_MAX_ROWS, `Generate at most ${GENERATOR_MAX_ROWS} rows`),
  errorRows: z.number({ message: 'Rows with errors must be a number' }).int('Rows with errors must be a whole number').min(0, 'Rows with errors cannot be negative'),
  files: z.number({ message: 'Number of files must be a number' }).int('Number of files must be a whole number').min(1, 'Generate at least 1 file')
    .max(GENERATOR_MAX_FILES, `Generate at most ${GENERATOR_MAX_FILES} files at a time`).default(1),
  seed: z.number().int().optional(), // same seed, same files; used by tests
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

/** The file with this ID, or undefined when there is none. */
async function findFile(id: string) {
  try {
    return await storage.get(id);
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 404) return undefined;
    throw error;
  }
}

/**
 * The original input an uploaded result belongs to, or undefined when it is not linked: sourceId must
 * be the base ID of an input in this workspace (archived included) whose data the result's original
 * columns hold exactly.
 */
async function originalMatching(sourceId: string, headers: string[], rows: Row[], generatedColumns: string[]) {
  if (parseFileId(sourceId)?.code) return undefined; // names a result, not an original
  const source = await findFile(sourceId);
  if (!source || !isInputFile(source)) return undefined;
  const input = parseCsv(await storage.read(source.id));
  return matchesInput(headers, rows, generatedColumns, input.headers, input.rows) ? source.id : undefined;
}

export async function fileRoutes(app: FastifyInstance) {
  // A pure read: metadata from older versions is corrected once at startup (reconcileMetadata).
  app.get('/files', async () => storage.list());

  // Upload: parse + schema check always run here, regardless of processing function.
  app.post('/files', async (req) => {
    const file = await req.file();
    if (!file) throw httpError(400, 'No file uploaded');
    if (!file.filename.toLowerCase().endsWith('.csv')) throw httpError(400, 'Only .csv files are supported');
    const text = (await file.toBuffer()).toString('utf8');
    const { headers, rows } = parseCsv(text);
    getAdapter(headers);
    // Every upload gets a new base File ID. A previously exported result is registered as a result,
    // with that new base ID plus its function's code (e.g. 101012-M), and marked Imported.
    const result = detectResult(headers);
    // The ID travels with the data: stored files carry it in their file_id / result_id columns,
    // replacing any IDs the uploaded CSV brought with it.
    // A result exported before File ID columns has none to stamp, so it is stored exactly as uploaded.
    const hasIdColumns = headers.includes(FILE_ID_COLUMN) || headers.includes(RESULT_ID_COLUMN);
    // An uploaded result keeps the source File ID it names as provenance (importedFrom). It is linked
    // to that original (sourceId, and the original's base ID stays in file_id) only when the original
    // is an input in this workspace and the result's original columns hold exactly its data.
    const importedFrom = result ? embeddedSourceId(headers, rows) : undefined;
    const linkedTo = result && importedFrom ? await originalMatching(importedFrom, headers, rows, result.generatedColumns) : undefined;
    const textFor = (id: string) => {
      if (result && !hasIdColumns) return text;
      const stored = stampFileIds(headers, rows, id, !!result, linkedTo);
      return toCsv(stored.headers, stored.rows);
    };
    const columns = result || headers.includes(FILE_ID_COLUMN) ? headers.length : headers.length + 1;
    const base = { name: file.filename, text: textFor, rows: rows.length, columns, problemRows: findProblems(headers, rows).total };
    if (result) {
      const lineage = { ...(importedFrom ? { importedFrom } : {}), ...(linkedTo ? { sourceId: linkedTo } : {}) };
      return storage.create({ ...base, status: 'Processed', imported: true, ...result, ...lineage }, codeOf(result.processor));
    }
    return storage.create({ ...base, status: base.problemRows > 0 ? 'Needs Review' : 'Ready' });
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
    reply.header('content-disposition', attachment(meta.name)).type('text/csv');
    return storage.read(meta.id);
  });

  // Archive or restore several files at once. Only the flag changes; no CSV is moved or deleted.
  app.post('/files/archive', async (req) => {
    const { ids, archived } = archiveBody.parse(req.body);
    const unique = [...new Set(ids)];
    for (const id of unique) await storage.get(id); // 404 before changing anything
    const archivedAt = archived ? new Date().toISOString() : undefined; // undefined is dropped when saved
    const updated: FileMeta[] = [];
    for (const id of unique) updated.push(await storage.patch(id, { archived, archivedAt }));
    return updated;
  });

  app.post('/process', async (req, reply) => {
    const { fileId, processor, replace } = processBody.parse(req.body);
    const meta = await storage.get(fileId);
    if (meta.status === 'Processed') throw httpError(400, 'Select an input file, not a result file');
    if (meta.archived) throw httpError(400, `Restore ${meta.name} before processing it`);
    // The result's File ID is the input's ID plus the function's code. Running the same function on the
    // same input again replaces that result and keeps its ID, but only when the request confirms it,
    // so another tab or a stale file list can never overwrite a result silently.
    const id = resultFileId(meta.id, processor);
    const conflict = (existing: FileMeta): ReplaceConflict => ({
      message: `${PROCESSORS.find((p) => p.id === processor)!.label} has already been run for file ${meta.id}. Confirm to replace the existing result ${id}.`,
      existing: { id: existing.id, name: existing.name, archived: existing.archived },
    });
    const existing = await findFile(id);
    if (existing && !replace) return reply.code(409).send(conflict(existing));
    const { headers, rows } = parseCsv(await storage.read(fileId));
    const out = processRows(headers, rows, processor, id);
    const base = meta.name.replace(/\.csv$/i, '');
    const result = {
      name: `result_${base}_${processor}.csv`,
      text: toCsv(out.headers, out.rows),
      rows: out.rows.length,
      columns: out.headers.length,
      status: 'Processed' as const,
      processor,
      sourceId: meta.id,
      generatedColumns: out.generated,
      problemRows: out.problemRows,
    };
    // A confirmed re-run overwrites, saving new metadata, so an archived result returns to Active Files.
    if (replace) return storage.put(id, result);
    // Otherwise only create: if another request saved this result since the check above, refuse
    // like a normal re-run rather than overwrite it.
    const created = await storage.createAt(id, result);
    return created ?? reply.code(409).send(conflict(await storage.get(id)));
  });

  // Generates 1–10 synthetic partner CSVs with different data. Nothing is saved: the page downloads them or uploads them like any CSV.
  app.post('/generate', async (req) => {
    const { partner, rows, errorRows, files, seed } = generateBody.parse(req.body);
    return { files: generateFiles(partner, rows, errorRows, files, seed) };
  });

  app.get('/compare', async (req) => {
    const ids = compareQuery.parse(req.query);
    const load = async (id: string) => {
      const meta = await storage.get(id);
      const csv = parseCsv(await storage.read(id));
      if (meta.status !== 'Processed') return { meta, ...csv };
      const result = detectResult(csv.headers);
      if (!result) throw httpError(400, `${meta.name} has an unrecognized result schema. Regenerate it from its original input.`);
      return { meta: { ...meta, ...result }, ...csv };
    };
    const loaded = await Promise.all(ids.map(load));
    const result = compareResults(loaded);
    // Which rows in each file have problems, so the comparison can say which file an error is in.
    return { ...result, files: result.files.map((f, k) => ({ ...f, problems: findProblems(loaded[k].headers, loaded[k].rows) })) };
  });
}
