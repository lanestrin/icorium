// One test for each acceptance criterion of universal file ingestion (blueprint/project-plan.md, section 14), run end to
// end as the app does: the real readers (real SheetJS; pdf.js and Tesseract replaced by fakes, as jsdom cannot run them),
// then the real file service over memory storage. These are jsdom tests, not real-browser or visual checks.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { parseCsv } from '../../../shared/csv';
import { createFileService, seedSampleFiles } from '../../../shared/file-service';
import { isInputFile, PROCESSORS, type CompareResult, type FileMeta, type ProcessorId } from '../../../shared/types';
import { createMemoryStorage, type BrowserStorage } from './browser-storage';
import { SAMPLE_FILES } from './samples';
import { findExcelTables, readExcel } from './convert/excel';
import { createOcrReader } from './convert/ocr';
import { allDecided, applyDecisions, findPageTable, type Decision } from './convert/pages';
import type { PlacedText } from './convert/layout';
import { PDF_MAX_PAGES, readPdf } from './convert/pdf';
import { ConvertError, csvName, fileKind, toCsvText, toUploadSource, type FoundTable } from './convert/table';

const pdfjs = vi.hoisted(() => ({ GlobalWorkerOptions: { workerSrc: '' }, getDocument: vi.fn() }));
vi.mock('pdfjs-dist', () => pdfjs);
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: '/pdf.worker.min.mjs' }));
vi.mock('./convert/ocr', async (original) => ({ ...(await original<typeof import('./convert/ocr')>()), createOcrReader: vi.fn() }));

// ---- A supplier whose columns are not any partner's: Net Mass is in pounds, the others are percentages. ----
const HEADERS = ['Batch ID', 'Sample Date', 'Net Mass', 'R32 %', 'R125', 'R134a'];
const ROWS = [['X-1', '2026-09-01', '100', '50', '30', '20'], ['X-2', '2026-09-02', '200', '40', '40', '20']];
const csvOf = (headers: string[], rows: string[][]) => [headers, ...rows].map((r) => r.join(',')).join('\n') + '\n';
const SUPPLIER = csvOf(HEADERS, ROWS);
const columns = { batchId: 'Batch ID', sampleDate: 'Sample Date', massKg: 'Net Mass', r32: 'R32 %', r125: 'R125', r134a: 'R134a' };
const units = { massKg: 'lb', r32: '%', r125: '%', r134a: '%' };
const LB = 0.45359237;
const MASS_COLUMNS = ['r32_mass_kg', 'r125_mass_kg', 'r134a_mass_kg'];

let storage: BrowserStorage;
let service: ReturnType<typeof createFileService>;
beforeEach(async () => {
  storage = createMemoryStorage();
  await seedSampleFiles(storage, SAMPLE_FILES);
  service = createFileService(storage);
  pdfjs.getDocument.mockReset();
  vi.mocked(createOcrReader).mockReset();
});

const upload = (name: string, text: string, source?: unknown) => service.upload({ name, text, source });
const confirm = (fileId: string, over: Record<string, unknown> = {}) => service.confirmMapping({ fileId, columns, units, ...over });
const run = async (fileId: string, processor: ProcessorId, replace = true) => {
  const outcome = await service.process({ fileId, processor, replace });
  if (!('file' in outcome)) throw new Error('unexpected conflict');
  return outcome.file;
};
const textOf = async (id: string) => (await service.download(id)).text;
const files = () => service.list();
const sampleId = async (name: string) => (await files()).find((f) => f.name === name)!.id;
/** The status code an action's error carries. */
const refused = async (action: Promise<unknown>) => {
  const error = await action.then(() => undefined, (e: unknown) => e as { statusCode?: number; message: string });
  expect(error, 'expected the action to be refused').toBeDefined();
  return { statusCode: error!.statusCode, message: error!.message };
};
const explain = async (fileId: string, row: number, column: string) => {
  const res = await service.explain({ fileId, row, column });
  if (!res.traced) throw new Error(`not traced: ${res.reason}`);
  return res;
};

/** Imports a table found in a converted file, as the Import as CSV button does. */
async function importTable(table: FoundTable, original: File, decisions: Record<string, Decision> = {}, ocr?: 'image' | number[]) {
  const text = toCsvText(applyDecisions(table, decisions));
  return upload(csvName(original.name), text, await toUploadSource(table, original, decisions, ocr));
}
/** Confirms the supplier mapping of an imported table and runs Component Mass Calculation. */
async function mapAndRun(meta: FileMeta) {
  expect(meta.status).toBe('Needs Mapping');
  await confirm(meta.id);
  return run(meta.id, 'mass');
}

// ---- Excel, PDF and OCR inputs ----
function workbook(sheets: Record<string, unknown[][]>, bookType: 'xlsx' | 'biff8' = 'xlsx') {
  const book = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows.map((r) => r.map((c) => (typeof c === 'string' && /^-?\d+(\.\d+)?$/.test(c) ? Number(c) : c)))), name);
  const bytes = XLSX.write(book, { type: 'array', bookType }) as ArrayBuffer;
  return new File([bytes], bookType === 'xlsx' ? 'supplier.xlsx' : 'supplier.xls');
}
const excelTable = async (file: File) => {
  const tables = findExcelTables(await readExcel(file));
  expect(tables).toHaveLength(1);
  return tables[0];
};
const laterSheet = () => workbook({ Notes: [['Supplier report'], ['Prepared by finance']], Data: [['Q3 deliveries'], [], HEADERS, ...ROWS] });

const at = (text: string, x: number, y: number): PlacedText => ({ text, x, y, width: text.length * 5, height: 10 });
/** One row of text items on a page, a wide gap between cells. */
const line = (cells: string[], y: number) => cells.map((text, i) => at(text, i * 100, y));
function fakePdf(pages: PlacedText[][], numPages = pages.length) {
  const getPage = vi.fn(async (n: number) => ({
    getTextContent: async () => ({ items: pages[n - 1].map((i) => ({ str: i.text, transform: [1, 0, 0, 1, i.x, i.y], width: i.width, height: i.height })) }),
    getViewport: ({ scale }: { scale: number }) => ({ width: 612 * scale, height: 792 * scale }),
    render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
    cleanup: vi.fn(),
  }));
  pdfjs.getDocument.mockReturnValue({ promise: Promise.resolve({ numPages, getPage }), destroy: vi.fn(() => Promise.resolve()) });
}
const pdfFile = () => new File(['%PDF-1.7'], 'supplier.pdf', { type: 'application/pdf' });
const textPdf = () => fakePdf([
  [...line(HEADERS, 700), ...line(ROWS[0], 680), ...line(ROWS[1], 660)],
  [...line(HEADERS, 700), ...line(['X-3', '2026-09-03', '300', '10', '10', '10'], 680)], // the header repeats on page 2
]);
const pdfTable = async () => findPageTable((await readPdf(pdfFile())).pages, 'the PDF');

describe('universal file ingestion: acceptance (project-plan section 14)', () => {
  it('acceptance 1: existing partner files work without regression', async () => {
    const inputs = (await files()).filter(isInputFile);
    expect(inputs.map((f) => f.id)).toEqual(['100001', '100002', '100003', '100004', '100005']);
    for (const input of inputs) {
      expect(input.status, input.name).not.toBe('Needs Mapping'); // an exact partner match needs no mapping
      const original = parseCsv(await textOf(input.id));
      for (const { id } of PROCESSORS) {
        const result = await run(input.id, id);
        expect(result.status).toBe('Processed');
        const out = parseCsv(await textOf(result.id));
        expect(out.headers.slice(0, original.headers.length), `${input.name} ${id} keeps every source column`).toEqual(original.headers);
        expect(out.rows.map((r) => original.headers.map((h) => r[h]))).toEqual(original.rows.map((r) => original.headers.map((h) => r[h])));
      }
    }
    const invalid = async (name: string) => parseCsv(await textOf((await run(await sampleId(name), 'validation')).id)).rows.filter((r) => r.processing_status === 'Invalid').length;
    expect(await invalid('partner_a_baseline.csv')).toBe(1);
    expect(await invalid('partner_b_followup.csv')).toBe(2); // both rows of the duplicate
  });

  it('acceptance 2: a supplier CSV with unfamiliar headers can be mapped and validated', async () => {
    const meta = await upload('supplier.csv', SUPPLIER);
    expect(meta).toMatchObject({ status: 'Needs Mapping', ingestion: { approved: false } });
    expect(meta.ingestion!.mappings.map((m) => [m.field, m.sourceColumn])).toEqual([
      ['batchId', 'Batch ID'], ['sampleDate', 'Sample Date'], ['massKg', 'Net Mass'], ['r32', 'R32 %'], ['r125', 'R125'], ['r134a', 'R134a'],
    ]);
    expect((await refused(service.process({ fileId: meta.id, processor: 'mass' }))).statusCode).toBe(400); // not before it is confirmed
    expect(await confirm(meta.id)).toMatchObject({ status: 'Ready', ingestion: { approved: true } });
    const result = await run(meta.id, 'mass');
    expect(parseCsv(await textOf(result.id)).rows[0]).toMatchObject({ 'Net Mass': '100', r32_mass_kg: '22.68', processing_status: 'Valid' });
  });

  it('acceptance 3: an Excel file with data on a later sheet imports correctly', async () => {
    const file = laterSheet();
    const table = await excelTable(file);
    expect(table).toMatchObject({ sheet: 'Data', headers: HEADERS, headerRow: 3 });
    const result = await mapAndRun(await importTable(table, file));
    expect(parseCsv(await textOf(result.id)).rows.map((r) => r.r32_mass_kg)).toEqual(['22.68', '36.287']);
    expect((await explain(result.id, 1, 'r32_mass_kg')).fields.find((f) => f.field === 'massKg')!.location).toBe('Data!C4');
  });

  it('acceptance 4: a PDF with an identifiable table can be extracted and reviewed', async () => {
    textPdf();
    const table = await pdfTable();
    expect(table.headers).toEqual(HEADERS);
    expect(table.rows.map((r) => [r.page, r.pageRow, r.cells[0]])).toEqual([[1, 2, 'X-1'], [1, 3, 'X-2'], [2, 2, 'X-3']]); // each row keeps its page
    expect(table.flags.map((f) => f.reason)).toEqual(['repeated header on page 2, left out']);
    expect(table.checks ?? []).toEqual([]);
    const result = await mapAndRun(await importTable(table, pdfFile()));
    expect((await explain(result.id, 3, 'r32_mass_kg')).fields.find((f) => f.field === 'massKg')).toMatchObject({ location: 'page 2, row 2', raw: '300' });
  });

  it('acceptance 5: unknown or conflicting units prevent calculation', async () => {
    const oz = await upload('oz.csv', csvOf(['Batch ID', 'Sample Date', 'Mass (oz)', 'R32 %', 'R125', 'R134a'], ROWS));
    expect(oz.status).toBe('Needs Mapping');
    expect(oz.ingestion!.issues.some((i) => i.severity === 'blocking' && i.field === 'massKg')).toBe(true);
    expect((await refused(confirm(oz.id, { columns: { ...columns, massKg: 'Mass (oz)' }, units: { ...units, massKg: 'oz' } }))).statusCode).toBe(400);
    expect((await refused(confirm(oz.id, { columns: { ...columns, massKg: 'Mass (oz)' }, units: { r32: '%', r125: '%', r134a: '%' } }))).message).toContain('Choose a unit for mass');
    const conflict = await upload('conflict.csv', SUPPLIER);
    expect((await refused(confirm(conflict.id, { units: { ...units, r32: 'fraction' } }))).message).toContain('the column states % but fraction was confirmed');
    for (const id of [oz.id, conflict.id]) expect((await refused(service.process({ fileId: id, processor: 'mass' }))).statusCode).toBe(400);
    expect((await files()).some((f) => f.id.startsWith(`${oz.id}-`) || f.id.startsWith(`${conflict.id}-`))).toBe(false); // no result exists
  });

  it('acceptance 6: ambiguous OCR results are flagged, not accepted silently', async () => {
    const cell = (text: string, i: number, confidence = 95) => ({ text, x: i * 100, right: i * 100 + 50, confidence });
    const table = findPageTable([{ ocr: true, rows: [
      HEADERS.map((h, i) => cell(h, i)),
      ['X-1', '2026-09-01', '1O0', '50', '30', '20'].map((t, i) => cell(t, i, i === 3 ? 60 : 95)), // a letter O, and a low-confidence 50
    ] }], 'the image');
    expect(table.checks!.map((c) => [c.value, c.reasons.length > 0])).toEqual([['1O0', true], ['50', true]]);
    expect(table.checks![1].reasons[0]).toContain('OCR confidence 60');
    expect(allDecided(table, {})).toBe(false); // nothing is accepted until decided
    const [letter, low] = table.checks!;
    expect(allDecided(table, { [letter.id]: 'keep', [low.id]: 'keep' })).toBe(true);
    expect(applyDecisions(table, { [letter.id]: 'keep', [low.id]: 'keep' }).rows[0].cells).toEqual(['X-1', '2026-09-01', '1O0', '50', '30', '20']); // as read, never corrected
    expect(applyDecisions(table, { [letter.id]: 'blank', [low.id]: 'keep' }).rows[0].cells).toEqual(['X-1', '2026-09-01', '', '50', '30', '20']); // blank, never 0
  });

  it('acceptance 7: missing required measurements block the affected calculations', async () => {
    const meta = await upload('missing.csv', csvOf(HEADERS, [ROWS[0], ['X-2', '2026-09-02', '', '40', '40', '20']]));
    await confirm(meta.id);
    const result = await run(meta.id, 'mass');
    const rows = parseCsv(await textOf(result.id)).rows;
    expect(rows[1]).toMatchObject({ r32_mass_kg: '', r125_mass_kg: '', r134a_mass_kg: '', processing_status: 'Invalid' }); // no value, never a zero
    expect(rows[0].r32_mass_kg).toBe('22.68');
    expect(result.trace!.validation).toMatchObject({ rows: 2, excludedRows: 1 });
    expect(await explain(result.id, 2, 'r32_mass_kg')).toMatchObject({ rowStatus: 'excluded', value: '', reasons: 'mass missing' });
    // An essential field with no source column blocks the whole file.
    const noMass = await upload('no-mass.csv', csvOf(['Batch ID', 'Sample Date', 'R32 %', 'R125', 'R134a'], ROWS.map((r) => [r[0], r[1], r[3], r[4], r[5]])));
    expect(noMass.status).toBe('Needs Mapping');
    expect((await refused(confirm(noMass.id, { columns: { ...columns, massKg: '' }, units: { r32: '%', r125: '%', r134a: '%' } }))).message).toContain('Choose a column for mass');
    expect((await refused(service.process({ fileId: noMass.id, processor: 'mass' }))).statusCode).toBe(400);
  });

  it('acceptance 8: validated data uses the existing calculation functions', async () => {
    // Partner B's baseline with other headers: the same numbers must give the same results as the partner file.
    const b = parseCsv(await textOf(await sampleId('partner_b_baseline.csv')));
    const lines = SAMPLE_FILES.find((s) => s.name === 'partner_b_baseline.csv')!.text.trim().split('\n');
    const supplier = await upload('b-supplier.csv', [HEADERS.join(','), ...lines.slice(1)].join('\n') + '\n');
    await confirm(supplier.id);
    expect(b.rows).toHaveLength(25);
    for (const { id } of PROCESSORS) {
      const ours = parseCsv(await textOf((await run(supplier.id, id)).id));
      const partner = parseCsv(await textOf((await run(await sampleId('partner_b_baseline.csv'), id)).id));
      const generated = partner.headers.filter((h) => !b.headers.includes(h) && h !== 'result_id');
      expect(generated.length).toBeGreaterThan(0);
      expect(ours.rows.map((r) => generated.map((g) => r[g])), id).toEqual(partner.rows.map((r) => generated.map((g) => r[g])));
    }
  });

  it('acceptance 9: every calculated output traces to its source data', async () => {
    const excelFile = laterSheet();
    textPdf();
    const results = {
      csv: await mapAndRun(await upload('trace.csv', SUPPLIER)),
      excel: await mapAndRun(await importTable(await excelTable(excelFile), excelFile)),
      pdf: await mapAndRun(await importTable(await pdfTable(), pdfFile())),
    };
    const place = { csv: /^row \d, column "Net Mass"$/, excel: /^Data!C\d$/, pdf: /^page \d, row \d$/ };
    for (const [kind, result] of Object.entries(results) as [keyof typeof results, FileMeta][]) {
      expect(result.trace).toMatchObject({ inputFileId: result.sourceId, processor: 'mass', processorVersion: 1, source: { kind } });
      const rows = parseCsv(await textOf(result.id)).rows;
      for (let row = 1; row <= rows.length; row++) {
        for (const column of MASS_COLUMNS) {
          const res = await explain(result.id, row, column);
          expect(res.value, `${kind} row ${row} ${column}`).toBe(rows[row - 1][column]);
          const mass = res.fields.find((f) => f.field === 'massKg')!;
          expect(mass).toMatchObject({ unit: 'lb', factor: LB, raw: ['100', '200', '300'][row - 1] }); // the supplier's own cell value
          expect(mass.location).toMatch(place[kind]);
        }
      }
    }
  });

  it('acceptance 10: comparison and File ID conventions keep working', async () => {
    const [a, b] = [await run(await sampleId('partner_a_baseline.csv'), 'mass'), await run(await sampleId('partner_a_followup.csv'), 'mass')];
    expect([a.id, b.id]).toEqual(['100001-M', '100002-M']);
    expect(await service.compare([a.id, b.id])).toMatchObject({ rowMatch: 'batch_id' } satisfies Partial<CompareResult>);

    const excelFile = laterSheet();
    const fromCsv = await upload('same.csv', SUPPLIER);
    const fromExcel = await importTable(await excelTable(excelFile), excelFile);
    expect([fromCsv.id, fromExcel.id]).toEqual(['100006', '100007']); // each new input gets its own base ID
    for (const meta of [fromCsv, fromExcel]) await confirm(meta.id);
    const [x, y] = [await run(fromCsv.id, 'validation'), await run(fromExcel.id, 'validation')];
    expect([x.id, y.id]).toEqual(['100006-V', '100007-V']);
    expect(x.sourceId).toBe(fromCsv.id);
    expect(await service.compare([x.id, y.id])).toMatchObject({ rowMatch: 'batch_id' });
    expect(await refused(service.process({ fileId: x.id, processor: 'validation' }))).toMatchObject({ statusCode: 400 }); // a result is not an input
  });

  it('acceptance 11: direct calls to the file service cannot bypass validation', async () => {
    const meta = await upload('bypass.csv', SUPPLIER);
    const attempts = [
      { fileId: meta.id, processor: 'mass' },
      { fileId: meta.id, processor: 'mass', approved: true, ingestion: { approved: true } },
    ];
    for (const body of attempts) expect((await refused(service.process(body))).statusCode).toBe(400);
    // A record edited to say "approved" is checked again against the stored file and its units on every run.
    await storage.patch(meta.id, { ingestion: { ...meta.ingestion!, approved: true } });
    expect((await refused(service.process({ fileId: meta.id, processor: 'mass' }))).message).toContain('is not confirmed');
    await storage.patch(meta.id, { ingestion: meta.ingestion });
    // Ambiguous choices are refused when confirming.
    expect((await refused(confirm(meta.id, { columns: { ...columns, r125: 'R32 %' } }))).message).toContain('chosen for R-32 and R-125');
    expect((await refused(confirm(meta.id, { columns: { ...columns, massKg: 'file_id' } }))).statusCode).toBe(400);
    expect((await files()).some((f) => f.id.startsWith(`${meta.id}-`))).toBe(false);
  });

  it('acceptance 12: the supported file types and the critical failures are covered', async () => {
    // Each supported type reaches the same table and the same upload.
    for (const bookType of ['xlsx', 'biff8'] as const) {
      const file = workbook({ Data: [HEADERS, ...ROWS] }, bookType);
      expect(fileKind(file)).toBe('excel');
      expect((await importTable(await excelTable(file), file)).rows).toBe(2);
    }
    textPdf();
    expect(fileKind(pdfFile())).toBe('pdf');
    expect((await importTable(await pdfTable(), pdfFile())).rows).toBe(3);
    // A scanned page (no text layer) is read by OCR; a photo goes through the same rows and cells.
    fakePdf([[at(' ', 0, 700)]]);
    const read = vi.fn(async () => [HEADERS, ...ROWS].map((r) => r.map((text, i) => ({ text, x: i * 100, right: i * 100 + 50, confidence: 95 }))));
    vi.mocked(createOcrReader).mockReturnValue({ ready: vi.fn(async () => {}), read, close: vi.fn(async () => {}) } as never);
    const scanned = await pdfTable();
    expect((await importTable(scanned, pdfFile(), {}, [1])).ingestion).toBeDefined();
    const image = new File([new Uint8Array([1])], 'photo.png', { type: 'image/png' });
    expect(fileKind(image)).toBe('image');
    const photo = findPageTable([{ ocr: true, rows: [HEADERS, ...ROWS].map((r) => r.map((text, i) => ({ text, x: i * 100, right: i * 100 + 50, confidence: 95 }))) }], 'the image');
    expect((await importTable(photo, image, {}, 'image')).source).toMatchObject({ kind: 'image', ocr: 'image' });
    // Critical failures are refused with a message.
    await expect(readExcel(new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5])], 'broken.xlsx'))).rejects.toThrow(ConvertError);
    fakePdf([[at('x', 0, 0)]], PDF_MAX_PAGES + 1);
    await expect(readPdf(pdfFile())).rejects.toThrow(ConvertError);
    expect(() => fileKind({ name: 'notes.docx', size: 1 })).toThrow(ConvertError);
    expect((await refused(upload('notes.txt', SUPPLIER))).message).toContain('Only .csv files are supported');
    expect((await refused(upload('bad.csv', 'a,b\n1,2,3\n'))).message).toContain('CSV parse error');
  });
});
