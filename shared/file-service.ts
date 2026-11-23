import { z } from 'zod';
import { ADAPTER_FIELDS, codeOf, COMPARE_MAX, FIRST_FILE_ID, COMPARE_MAX_ROWS, COMPARE_MIN, FILE_ID_COLUMN, GENERATOR_MAX_FILES, GENERATOR_MAX_ROWS, GENERATOR_PARTNERS, PROCESSORS, RESULT_ID_COLUMN, isInputFile, parseFileId, resultFileId, type FileMeta, type ProcessorId, type ReplaceConflict, type Row } from './types';
import { getAdapter, readerFor, resolveReader } from './adapters';
import { FIELD_LABELS, headerKey, matchPartner, suggestMapping } from './mapping';
import { decideUnits, normalizeRow, UNIT_FACTORS, unitRangeWarnings } from './units';
import { NO_TRACE_OLD, NO_TRACE_UPLOADED, ORIGINAL_MAX_MB, type ExplainOutcome, type FieldExplanation, type IngestionRecord, type ResultTrace, type SourceRecord, type SourceSummary } from './ingestion';
import { detectResult, embeddedSourceId, findProblems, matchesInput, processRows, stampFileIds } from './processing';
import { compareResults } from './compare';
import { httpError, parseCsv, toCsv } from './csv';
import type { Storage } from './storage';
import { generateFiles } from './generate';

// The app's file actions as plain functions over a Storage. The browser calls them over its own storage
// (client/src/lib/api.ts). Errors are httpError()s carrying a status: 400 for bad input, 404 for an
// unknown file and 507 when browser storage is full.

const processBody = z.object({
  fileId: z.string().min(1),
  processor: z.enum(PROCESSORS.map((p) => p.id) as [ProcessorId, ...ProcessorId[]]),
  replace: z.boolean().default(false), // must be true to overwrite an existing result
});
// The person's choices for a file that Needs Mapping: a source column for each field, a unit for each measurement.
const columnChoice = (label: string) => z.string({ message: `Choose a column for ${label}` }).min(1, `Choose a column for ${label}`);
const unitChoice = (label: string) => z.enum(Object.keys(UNIT_FACTORS) as [keyof typeof UNIT_FACTORS, ...(keyof typeof UNIT_FACTORS)[]], { message: `Choose a unit for ${label}: kg, lb, g, % or fraction` });
const confirmBody = z.object({
  fileId: z.string().min(1),
  columns: z.object({
    batchId: columnChoice(FIELD_LABELS.batchId), sampleDate: columnChoice(FIELD_LABELS.sampleDate), massKg: columnChoice(FIELD_LABELS.massKg),
    r32: columnChoice(FIELD_LABELS.r32), r125: columnChoice(FIELD_LABELS.r125), r134a: columnChoice(FIELD_LABELS.r134a),
  }),
  units: z.object({ massKg: unitChoice(FIELD_LABELS.massKg), r32: unitChoice(FIELD_LABELS.r32), r125: unitChoice(FIELD_LABELS.r125), r134a: unitChoice(FIELD_LABELS.r134a) }),
  profileName: z.string().trim().min(1, 'Name the supplier profile').max(80, 'A supplier profile name is at most 80 characters').optional(),
});
// The original file and row references a converted upload (Excel, PDF, image) brings with its CSV (build-plan 19.8).
// It comes from the browser's own converter, but is checked like any input, and against the table it came with.
const positive = z.number().int().min(1);
const uploadSource = z.object({
  kind: z.enum(['excel', 'pdf', 'image']),
  original: z.object({
    name: z.string().min(1).max(255),
    mediaType: z.string().max(100),
    bytes: z.custom<ArrayBuffer>((v) => Object.prototype.toString.call(v) === '[object ArrayBuffer]', 'The original file is not valid')
      .refine((b) => b.byteLength <= ORIGINAL_MAX_MB * 1024 * 1024, `The original file is larger than the ${ORIGINAL_MAX_MB} MB limit`),
  }),
  sheet: z.string().max(255).optional(),
  range: z.string().max(50).optional(),
  columns: z.array(z.string().max(10)).optional(),
  rows: z.array(z.object({ row: positive, page: positive.optional(), pageRow: positive.optional() })),
  checks: z.array(z.object({ row: positive, column: z.number().int().min(0), asRead: z.string(), reasons: z.array(z.string()), decision: z.enum(['keep', 'blank']) })),
  ocr: z.union([z.literal('image'), z.array(positive)]).optional(),
});
const explainBody = z.object({ fileId: z.string().min(1), row: positive, column: z.string().min(1) });
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
function parseInput<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
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
      status: problemRows > 0 ? 'Needs Review' as const : 'Ready' as const, problemRows, ...csvSource(name, text) };
    await store.seed(id, input);
  }
}

/** What storage keeps for an upload: its summary on the file, and the original with its row references beside it. */
interface KeptSource { source: SourceSummary; record: SourceRecord }

/** The record of a converted upload, refused unless it matches the table it came with. */
function convertedSource(value: unknown, headers: string[], rowCount: number): KeptSource {
  const record: SourceRecord = parseInput(uploadSource, value);
  const matches = record.rows.length === rowCount
    && (!record.columns || record.columns.length === headers.length)
    && record.checks.every((c) => c.column < headers.length && c.row <= rowCount);
  if (!matches) throw httpError(400, 'The source record does not match the converted table');
  return summarized(record);
}

/** A CSV is its own original: the text as uploaded. Its source row is its data row plus one. */
export function csvSource(name: string, text: string): KeptSource {
  const bytes = new TextEncoder().encode(text);
  return summarized({ kind: 'csv', original: { name, mediaType: 'text/csv', bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer }, rows: [], checks: [] });
}

function summarized(record: SourceRecord): KeptSource {
  const { kind, original, sheet, range, ocr } = record;
  return { record, source: { kind, name: original.name, size: original.bytes.byteLength, ...(sheet ? { sheet } : {}), ...(range ? { range } : {}), ...(ocr ? { ocr } : {}) } };
}

/** Where a stored row's cell is in the original file, or undefined when the source record does not say. idx is the column's position. */
function locate(record: SourceRecord | undefined, row: number, idx: number, column: string): string | undefined {
  if (!record || idx < 0) return undefined;
  if (record.kind === 'csv') return `row ${row + 1}, column "${column}"`;
  const ref = record.rows[row - 1];
  if (!ref) return undefined;
  if (record.kind === 'excel') {
    const letter = record.columns?.[idx];
    if (!letter || !record.sheet) return undefined;
    const sheet = /^[A-Za-z0-9_]+$/.test(record.sheet) ? record.sheet : `'${record.sheet.replace(/'/g, "''")}'`;
    return `${sheet}!${letter}${ref.row}`;
  }
  return record.kind === 'pdf' && ref.page ? `page ${ref.page}, row ${ref.pageRow ?? ref.row}` : `row ${ref.pageRow ?? ref.row}`;
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
  // File ID plus its upload time, so a file saved again elsewhere (another tab) is parsed afresh. A
  // result this service saves is also forgotten at once, because a fast storage can save it again
  // within the same millisecond, keeping its upload time. Metadata is always read fresh from storage;
  // only what comes from the CSV text is cached.
  const parsed = new Map<string, ParsedFile>();
  function forget(id: string) {
    for (const key of parsed.keys()) if (key.startsWith(`${id}@`)) parsed.delete(key);
  }
  /** Keeps an input whose columns are not a partner's as Needs Mapping, with the mapping and units suggested for it. */
  async function storeForMapping(name: string, headers: string[], rows: Row[], duplicateHeaders: string[], kept: KeptSource) {
    const profile = (await storage.listProfiles()).find((p) => p.key === headerKey(headers));
    const suggestion = suggestMapping(headers, { duplicates: duplicateHeaders, profile });
    const decided = decideUnits(suggestion, { profile: profile?.units });
    const mappings = suggestion.mappings.map((m) => m.mapping);
    const ingestion: IngestionRecord = {
      mappings,
      units: decided.decisions,
      issues: [...suggestion.issues, ...decided.issues, ...unitRangeWarnings(rows, mappings, decided.decisions)],
      duplicateHeaders,
      approved: false,
    };
    const text = (id: string) => {
      const stored = stampFileIds(headers, rows, id, false);
      return toCsv(stored.headers, stored.rows);
    };
    return storage.create({ name, text, rows: rows.length, columns: headers.includes(FILE_ID_COLUMN) ? headers.length : headers.length + 1, status: 'Needs Mapping', ingestion, ...kept });
  }
  async function parsedFile(meta: FileMeta): Promise<ParsedFile> {
    const key = `${meta.id}@${meta.uploadedAt}`;
    const cached = parsed.get(key);
    if (cached) {
      parsed.delete(key); // re-insert, so the least recently used file is first
      parsed.set(key, cached);
      return cached;
    }
    const { headers, rows } = parseCsv(await storage.read(meta.id));
    // A file that cannot be read yet (it still Needs Mapping) has no row checks, rather than an error.
    const reader = readerFor(meta, headers);
    const file = { headers, rows, problems: reader ? findProblems(headers, rows, 100, reader) : { total: 0, items: [] } };
    parsed.set(key, file);
    if (parsed.size > PARSED_CACHE_FILES) parsed.delete(parsed.keys().next().value!);
    return file;
  }

  return {
    // A pure read: listing never reads a CSV or writes anything.
    list: () => storage.list(),

    /**
     * Upload: parse + schema check always run here, regardless of processing function. An input that is not
     * exactly one partner's columns is kept as Needs Mapping (see confirmMapping); an uploaded result must be.
     */
    async upload({ name, text, source }: { name: string; text: string; source?: unknown }) {
      if (!name.toLowerCase().endsWith('.csv')) throw httpError(400, 'Only .csv files are supported');
      const { headers, rows, duplicateHeaders } = parseCsv(text);
      // The original is kept with the file: the converted source's file, or this CSV's own text.
      const kept = source === undefined ? csvSource(name, text) : convertedSource(source, headers, rows.length);
      // Every upload gets a new base File ID. A previously exported result is registered as a result,
      // with that new base ID plus its function's code (e.g. 101012-M), and marked Imported.
      const result = detectResult(headers);
      if (matchPartner(headers, duplicateHeaders)?.kind !== 'partner') {
        if (result) getAdapter(headers, { duplicates: duplicateHeaders }); // refuses a result without a clean partner schema
        return storeForMapping(name, headers, rows, duplicateHeaders, kept);
      }
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
        return storage.create({ ...base, status: 'Processed', imported: true, ...result, ...lineage, ...kept }, codeOf(result.processor));
      }
      return storage.create({ ...base, status: base.problemRows > 0 ? 'Needs Review' : 'Ready', ...kept });
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

    /**
     * Confirms the columns and units of a file that Needs Mapping, and can save them as a supplier profile that
     * only suggests. Every choice is checked again here; one blocking problem refuses all of it and saves nothing.
     */
    async confirmMapping(body: unknown) {
      const { fileId, columns, units, profileName } = parseInput(confirmBody, body);
      const meta = await storage.get(fileId);
      if (!isInputFile(meta)) throw httpError(400, 'Select an input file, not a result file');
      if (meta.archived) throw httpError(400, `Restore ${meta.name} before mapping it`);
      const { headers, rows } = parseCsv(await storage.read(fileId));
      if (!meta.ingestion) {
        const partner = readerFor(meta, headers);
        throw httpError(400, partner ? `File ${meta.id} already matches ${partner.name}; its columns need no mapping` : `File ${meta.id} has no mapping to confirm`);
      }
      const suggestion = suggestMapping(headers, { duplicates: meta.ingestion.duplicateHeaders, manual: columns });
      const decided = decideUnits(suggestion, { confirmed: units });
      const blocking = [...suggestion.issues, ...decided.issues].filter((i) => i.severity === 'blocking');
      if (blocking.length) throw httpError(400, blocking.map((i) => i.reason).join('; '));
      const mappings = suggestion.mappings.map((m) => ({ ...m.mapping, approved: true }));
      const ingestion: IngestionRecord = {
        mappings,
        units: decided.decisions,
        issues: [...decided.issues, ...unitRangeWarnings(rows, mappings, decided.decisions)], // warnings only
        duplicateHeaders: meta.ingestion.duplicateHeaders,
        approved: true,
        confirmedAt: new Date().toISOString(),
      };
      const found = resolveReader({ ingestion }, headers);
      if ('problems' in found) throw httpError(400, found.problems.join('; '));
      const problemRows = findProblems(headers, rows, 100, found.reader).total;
      const updated = await storage.patch(fileId, { status: problemRows > 0 ? 'Needs Review' : 'Ready', problemRows, ingestion });
      forget(fileId); // the cached parse of this file has no row checks yet
      if (profileName) {
        try {
          await storage.saveProfile({ key: headerKey(headers), name: profileName, columns, units, savedAt: new Date().toISOString() });
        } catch (error) {
          const { statusCode = 500, message } = error as { statusCode?: number; message?: string };
          throw httpError(statusCode, `The mapping was saved, but the supplier profile could not be saved: ${message ?? 'unknown error'}`);
        }
      }
      return updated;
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
      // The gate: an input is read only through an approved mapping (checked again against its stored CSV) or
      // as exactly one partner's columns. Nothing is created or replaced before this passes.
      const { headers, rows } = parseCsv(await storage.read(fileId));
      const found = resolveReader(meta, headers);
      if ('problems' in found) throw httpError(400, `File ${meta.id} can't be processed yet: ${found.problems.join('; ')}`);
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
      const out = processRows(headers, rows, processor, id, found.reader);
      const spec = PROCESSORS.find((p) => p.id === processor)!;
      const trace: ResultTrace = {
        inputFileId: meta.id,
        ...(meta.source ? { source: meta.source } : {}),
        mappings: found.reader.mappings,
        units: found.reader.units,
        validation: {
          approval: meta.ingestion ? 'confirmed' : 'partner',
          ...(meta.ingestion?.confirmedAt ? { confirmedAt: meta.ingestion.confirmedAt } : {}),
          rows: out.rows.length,
          excludedRows: out.problemRows,
          warnings: (meta.ingestion?.issues ?? []).filter((i) => i.severity === 'warning').map((i) => i.reason),
        },
        processor,
        processorVersion: spec.version,
      };
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
        trace,
        ...(meta.ingestion ? { ingestion: meta.ingestion } : {}), // the mapping the result was calculated with
      };
      // A confirmed re-run overwrites, saving new metadata, so an archived result returns to Active Files.
      if (replace) {
        const file = await storage.put(id, result);
        forget(id);
        return { file };
      }
      // Otherwise only create: if another action saved this result since the check above, refuse
      // like a normal re-run rather than overwrite it.
      const created = await storage.createAt(id, result);
      if (created) forget(id);
      return created ? { file: created } : { conflict: conflict(await storage.get(id)) };
    },

    /**
     * Explains one calculated value of a result from its raw source cells: the mapped fields of that row, where each
     * came from in the original file, and the unit and factor applied. A pure read.
     */
    async explain(body: unknown): Promise<ExplainOutcome> {
      const { fileId, row, column } = parseInput(explainBody, body);
      const meta = await storage.get(fileId);
      if (meta.status !== 'Processed') throw httpError(400, 'Select a result file, not an input file');
      if (meta.imported) return { traced: false, reason: NO_TRACE_UPLOADED };
      const trace = meta.trace;
      if (!trace) return { traced: false, reason: NO_TRACE_OLD };
      const { headers, rows } = parseCsv(await storage.read(fileId));
      const generated = meta.generatedColumns ?? [];
      if (row > rows.length) throw httpError(400, `This result has ${rows.length} rows; there is no row ${row}`);
      if (column === RESULT_ID_COLUMN || !generated.includes(column)) throw httpError(400, `${column} is not a calculated column of this result`);
      const stored = rows[row - 1];
      const originalHeaders = headers.slice(0, headers.length - generated.length);
      const input = await findFile(storage, trace.inputFileId);
      const record = input ? await storage.readSource(input.id) : undefined;
      const normalized = normalizeRow(stored, trace.mappings, trace.units, 'trace');
      const fields: FieldExplanation[] = [];
      for (const field of ADAPTER_FIELDS) {
        const mapping = trace.mappings.find((m) => m.field === field);
        if (!mapping) continue;
        const idx = originalHeaders.indexOf(mapping.sourceColumn);
        const check = record?.checks.find((c) => c.row === row && c.column === idx);
        const out: FieldExplanation = { field, label: FIELD_LABELS[field], column: mapping.sourceColumn, origin: mapping.origin, raw: stored[mapping.sourceColumn] ?? '' };
        const where = locate(record, row, idx, mapping.sourceColumn);
        if (where) out.location = where;
        if (check) out.confirmed = { asRead: check.asRead, reasons: check.reasons, decision: check.decision };
        const unit = trace.units.find((u) => u.field === field);
        if (unit) {
          const value = normalized[unit.field];
          out.unit = unit.unit;
          out.factor = unit.factor;
          out.normalized = value !== null && Number.isFinite(value) ? value : null;
          if (value === null) out.problem = 'missing';
          else if (!Number.isFinite(value)) out.problem = normalized.ambiguous?.includes(unit.field) ? 'ambiguous separator' : 'not a number';
        }
        fields.push(out);
      }
      const spec = PROCESSORS.find((p) => p.id === trace.processor);
      return {
        traced: true,
        fileId,
        row,
        column,
        value: stored[column] ?? '',
        processor: { id: trace.processor, label: spec?.label ?? trace.processor, version: trace.processorVersion },
        rowStatus: stored.processing_status === 'Valid' ? 'calculated' : 'excluded',
        reasons: stored.validation_errors ?? '',
        input: { fileId: trace.inputFileId, ...(input ? { name: input.name } : {}), ...(trace.source ? { source: trace.source } : {}) },
        fields,
      };
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
