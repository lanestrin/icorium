// Makes the Excel test fixture client/src/test-fixtures/partner_b_baseline.xlsx from the sample
// sample-data/partner_b_baseline.csv (which it only reads). The whole-workflow test
// (client/src/pages/FilesPage.workflow.test.tsx) uploads it as a partner's Excel file would arrive.
//
// Re-make it from the repository root with: node scripts/make-excel-fixture.mjs
//
// The sheet has a title row above the header, as partner exports often do. Plain numbers are stored
// as numbers, as Excel stores them; every other cell (dates, IDs, the planted "not_available" weight)
// is text. SheetJS stamps the workbook when it writes, so the file's bytes differ on each run; the
// test checks what the reader gets from it, not its bytes.
import { readFileSync, writeFileSync } from 'node:fs';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

const SOURCE = 'sample-data/partner_b_baseline.csv';
const TARGET = 'client/src/test-fixtures/partner_b_baseline.xlsx';
const TITLE = 'Partner B baseline export';

const { data, errors } = Papa.parse(readFileSync(SOURCE, 'utf8'), { skipEmptyLines: true });
if (errors.length) throw new Error(`${SOURCE} could not be parsed: ${errors[0].message}`);

const isPlainNumber = (text) => /^-?\d+(\.\d+)?$/.test(text);
const rows = [[TITLE], ...data.map((row) => row.map((cell) => (isPlainNumber(cell) ? Number(cell) : cell)))];

const book = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), 'Lots');
writeFileSync(TARGET, XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }));
console.log(`Wrote ${TARGET}: a title row, the header and ${data.length - 1} rows from ${SOURCE}.`);
