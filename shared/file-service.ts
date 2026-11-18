import { z } from 'zod';
import { codeOf, COMPARE_MAX, FIRST_FILE_ID, COMPARE_MAX_ROWS, COMPARE_MIN, FILE_ID_COLUMN, GENERATOR_MAX_FILES, GENERATOR_MAX_ROWS, GENERATOR_PARTNERS, PROCESSORS, RESULT_ID_COLUMN, isInputFile, parseFileId, resultFileId, type FileMeta, type ProcessorId, type ReplaceConflict, type Row } from './types';
import { getAdapter } from './adapters';
import { detectResult, embeddedSourceId, findProblems, matchesInput, processRows, stampFileIds } from './processing';
import { compareResults } from './compare';
import { httpError, parseCsv, toCsv } from './csv';
import type { Storage } from './storage';
import { generateFiles } from './generate';

// The app's file actions as plain functions over a Storage: the server's routes call them today, and the
// browser can call the same functions with its own Storage. Errors are httpError()s carrying the status
// the API answers with.

const processBody = z.object({
  fileId: z.string().min(1),
  processor: z.enum(PROCESSORS.map((p) => p.id) as [ProcessorId, ...ProcessorId[]]),
  replace: z.boolean().default(false), // must be true to overwrite an existing result
});
const archiveBody = z.object({ ids: z.array(z.string().min(1)).min(1), archived: z.boolean() });
// 2 to 5 different results.
const compareIds = z.array(z.string())
  .refine((ids) => ids.length >= COMPARE_MIN && ids.length <= COMPARE_MAX, `Choose ${COMPARE_MIN} to ${COMPARE_MAX} results to compare`)
  .refine((ids) => new Set(ids).size === ids.length, 'Choose different files');
/** Most rows one preview page returns. */
export const PREVIEW_MAX_ROWS = 1000;
// Previews load a page at a time so a large CSV never has to be rendered all at once.
const pageQuery = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(PREVIEW_MAX_ROWS).default(100),
});
const generateBody = z.object({
  partner: z.enum(GENERATOR_PARTNERS, { message: `Choose partner ${GENERATOR_PARTNERS.slice(0, -1).join(', ')} or ${GENERATOR_PARTNERS.at(-1)}` }),
  rows: z.number({ message: 'Rows must be a number' }).int('Rows must be a whole number').min(1, 'Generate at least 1 row')
    .max(GENERATOR_MAX_ROWS, `Generate at most ${GENERATOR_MAX_ROWS} rows`),
  errorRows: z.number({ message: 'Rows with errors must be a number' }).int('Rows with errors must be a whole number').min(0, 'Rows with errors cannot be negative'),
  files: z.number({ message: 'Number of files must be a number' }).int('Number of files must be a whole number').min(1, 'Generate at least 1 file')
    .max(GENERATOR_MAX_FILES, `Generate at most ${GENERATOR_MAX_FILES} files at a time`).default(1),
}).refine((body) => body.errorRows <= body.rows, { message: 'Rows with errors must be a whole number from 0 to the number of rows.', path: ['errorRows'] });

/** Checks untrusted input against a schema; a failed check is a 400 listing every problem, separated by "; ". */
export function parseInput<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw httpError(400, parsed.error.issues.map((i) => i.message).join('; '));
  return parsed.data;
}

/** The file with this ID, or undefined when there is none. */
async function findFile(storage: Storage, id: string) {
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
async function originalMatching(storage: Storage, sourceId: string, headers: string[], rows: Row[], generatedColumns: string[]) {
  if (parseFileId(sourceId)?.code) return undefined; // names a result, not an original
  const source = await findFile(storage, sourceId);
  if (!source || !isInputFile(source)) return undefined;
  const input = parseCsv(await storage.read(source.id));
  return matchesInput(headers, rows, generatedColumns, input.headers, input.rows) ? source.id : undefined;
}

/**
 * Stores the synthetic sample CSVs as 100001–100005, in name order, each with its file_id column (the
 * sample files themselves are never changed). seed() skips an ID that is already taken, so this is safe
 * every time storage opens.
 */
export async function seedSampleFiles(store: Pick<Storage, 'seed'>, samples: { name: string; text: string }[]) {
  const sorted = [...samples].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const [i, { name, text }] of sorted.entries()) {
    const id = String(FIRST_FILE_ID + i);
    const { headers, rows } = parseCsv(text);
    const problemRows = findProblems(headers, rows).total;
    const stored = stampFileIds(headers, rows, id, false);
    const input = { name, text: toCsv(stored.headers, stored.rows), rows: rows.length, columns: stored.headers.length,
      status: problemRows > 0 ? 'Needs Review' as const : 'Ready' as const, problemRows };
    await store.seed(id, input);
  }
}

/** How many parsed files previews and comparisons keep in memory. */
export const PARSED_CACHE_FILES = 10;

/** A stored file's CSV, parsed and checked. Shared between calls, so callers only read it. */
interface ParsedFile { headers: string[]; rows: Row[]; problems: ReturnType<typeof findProblems> }

/** What process() resolves to: the saved result, or the existing result it would replace without replace: true. */
export type ProcessOutcome = { file: FileMeta } | { conflict: ReplaceConflict };

/** The app's file actions, reading and writing files through this storage. */
export function createFileService(storage: Storage) {
  // Recently parsed files, so paging through a preview reads and parses the CSV once. The key is the
  // File ID plus its upload time: every save sets a new upload time, so a file saved again (here or
  // by another server sharing Blob storage) is parsed afresh and its old rows are never served.
  // Metadata is always read fresh from storage; only what comes from the CSV text is cached.
  const parsed = new Map<string, ParsedFile>();
  async function parsedFile(meta: FileMeta): Promise<ParsedFile> {
    const key = `${meta.id}@${meta.uploadedAt}`;
    const cached = parsed.get(key);
    if (cached) {
      parsed.delete(key); // re-insert, so the least recently used file is first
      parsed.set(key, cached);
      return cached;
    }
    const { headers, rows } = parseCsv(await storage.read(meta.id));
    const file = { headers, rows, problems: findProblems(headers, rows) };
    parsed.set(key, file);
    if (parsed.size > PARSED_CACHE_FILES) parsed.delete(parsed.keys().next().value!);
    return file;
  }

  return {
    // A pure read: metadata from older versions is corrected once at startup (reconcileMetadata).
    list: () => storage.list(),

    /** Upload: parse + schema check always run here, regardless of processing function. */
    async upload({ name, text }: { name: string; text: string }) {
      if (!name.toLowerCase().endsWith('.csv')) throw httpError(400, 'Only .csv files are supported');
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
      const linkedTo = result && importedFrom ? await originalMatching(storage, importedFrom, headers, rows, result.generatedColumns) : undefined;
      const textFor = (id: string) => {
        if (result && !hasIdColumns) return text;
        const stored = stampFileIds(headers, rows, id, !!result, linkedTo);
        return toCsv(stored.headers, stored.rows);
      };
      const columns = result || headers.includes(FILE_ID_COLUMN) ? headers.length : headers.length + 1;
      const base = { name, text: textFor, rows: rows.length, columns, problemRows: findProblems(headers, rows).total };
      if (result) {
        const lineage = { ...(importedFrom ? { importedFrom } : {}), ...(linkedTo ? { sourceId: linkedTo } : {}) };
        return storage.create({ ...base, status: 'Processed', imported: true, ...result, ...lineage }, codeOf(result.processor));
      }
      return storage.create({ ...base, status: base.problemRows > 0 ? 'Needs Review' : 'Ready' });
    },

    /** One page of a file's rows; query holds offset and limit. */
    async rows(id: string, query: unknown) {
      const { offset, limit } = parseInput(pageQuery, query);
      const meta = await storage.get(id);
      const { headers, rows, problems } = await parsedFile(meta);
      return {
        headers,
        rows: rows.slice(offset, offset + limit),
        offset,
        totalRows: rows.length,
        generatedColumns: meta.generatedColumns ?? [],
        problems,
      };
    },

    /** A file's name and CSV text, to save as a download. */
    async download(id: string) {
      const meta = await storage.get(id);
      return { name: meta.name, text: await storage.read(meta.id) };
    },

    /** Archive or restore several files at once. Only the flag changes; no CSV is moved or deleted. */
    async archive(body: unknown) {
      const { ids, archived } = parseInput(archiveBody, body);
      const unique = [...new Set(ids)];
      for (const id of unique) await storage.get(id); // 404 before changing anything
      const archivedAt = archived ? new Date().toISOString() : undefined; // undefined is dropped when saved
      const updated: FileMeta[] = [];
      for (const id of unique) updated.push(await storage.patch(id, { archived, archivedAt }));
      return updated;
    },

    async process(body: unknown): Promise<ProcessOutcome> {
      const { fileId, processor, replace } = parseInput(processBody, body);
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
      const existing = await findFile(storage, id);
      if (existing && !replace) return { conflict: conflict(existing) };
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
      if (replace) return { file: await storage.put(id, result) };
      // Otherwise only create: if another request saved this result since the check above, refuse
      // like a normal re-run rather than overwrite it.
      const created = await storage.createAt(id, result);
      return created ? { file: created } : { conflict: conflict(await storage.get(id)) };
    },

    /** Generates 1–10 synthetic partner CSVs with different data. Nothing is saved: the page downloads them or uploads them like any CSV. */
    generate(body: unknown) {
      const { partner, rows, errorRows, files } = parseInput(generateBody, body);
      return { files: generateFiles(partner, rows, errorRows, files) };
    },

    /** Compares 2 to 5 different files by ID. */
    async compare(ids: string[]) {
      parseInput(compareIds, ids);
      const metas = await Promise.all(ids.map((id) => storage.get(id)));
      // Checked from the stored row counts, before any CSV is read.
      const totalRows = metas.reduce((sum, m) => sum + m.rows, 0);
      if (totalRows > COMPARE_MAX_ROWS) {
        const n = (x: number) => x.toLocaleString('en-US');
        throw httpError(400, `Too many rows to compare: these files have ${n(totalRows)} rows in total, and the limit is ${n(COMPARE_MAX_ROWS)}. Compare fewer or smaller files.`);
      }
      const load = async (meta: FileMeta) => {
        const { headers, rows, problems } = await parsedFile(meta);
        if (meta.status !== 'Processed') return { meta, headers, rows, problems };
        const result = detectResult(headers);
        if (!result) throw httpError(400, `${meta.name} has an unrecognized result schema. Regenerate it from its original input.`);
        return { meta: { ...meta, ...result }, headers, rows, problems };
      };
      const loaded = await Promise.all(metas.map(load));
      const result = compareResults(loaded);
      // Which rows in each file have problems, so the comparison can say which file an error is in.
      return { ...result, files: result.files.map((f, k) => ({ ...f, problems: loaded[k].problems })) };
    },
  };
}

/** The file actions createFileService returns. */
export type FileService = ReturnType<typeof createFileService>;
