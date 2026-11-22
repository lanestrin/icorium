import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileMeta } from '../../../shared/types';
import { FilesPage } from './FilesPage';
import { api } from '../lib/api';
import { readExcel, type SheetCell, type SheetData } from '../lib/convert/excel';
import type { PlacedCell } from '../lib/convert/layout';
import { readImage } from '../lib/convert/ocr';
import { readPdf } from '../lib/convert/pdf';
import { ConvertError } from '../lib/convert/table';

vi.mock('../lib/api', () => ({ api: {
  list: vi.fn(), process: vi.fn(), rows: vi.fn(), upload: vi.fn(), compare: vi.fn(), archive: vi.fn(), generate: vi.fn(),
  download: vi.fn(), storageMode: vi.fn(), clearData: vi.fn(),
} }));
// The Excel reader is tested with real workbooks in lib/convert; here it is mocked to control timing.
vi.mock('../lib/convert/excel', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/convert/excel')>()), readExcel: vi.fn() }));
vi.mock('../lib/convert/pdf', () => ({ readPdf: vi.fn() }));
vi.mock('../lib/convert/ocr', () => ({ readImage: vi.fn() }));

const clean: FileMeta = { id: 'clean', name: 'clean.csv', status: 'Ready', problemRows: 0, rows: 25, columns: 7, uploadedAt: '2026-11-06T12:00:00Z' };
const A = ['batch_id', 'sample_date', 'feed_mass_kg', 'r32_pct', 'r125_pct', 'r134a_pct'];
/** A sheet from rows of text, as the real reader would give it: numbers and dates told from text, rows as wide as the sheet. */
function grid(rows: string[][], name = 'Sheet1'): SheetData {
  const width = Math.max(...rows.map((r) => r.length));
  const cell = (text: string): SheetCell => ({ text, kind: !text ? 'empty' : /^\d{4}-\d\d-\d\d$/.test(text) ? 'date' : Number.isFinite(Number(text)) ? 'number' : 'text' });
  return { name, firstRow: 1, firstCol: 0, merges: [], cells: rows.map((r) => Array.from({ length: width }, (_, i) => cell(r[i] ?? ''))) };
}
// A first sheet with a title row above the header, two rows (the second missing two values) and a total row.
const sheet = [grid([['Partner A export'], A, ['X-1', '2026-09-01', '100', '40', '30', '30'], ['X-2', '2026-09-01', '200', '40'], ['Total', '', '300']])];
const xlsx = (name = 'report.xlsx') => new File(['not read: the reader is mocked'], name);
/** Rows of text as positioned cells, in columns 100 apart; a cell's confidence is given as [text, confidence]. */
const placed = (rows: (string | [string, number])[][]): PlacedCell[][] => rows.map((r) => r.map((c, i) => {
  const [text, confidence] = typeof c === 'string' ? [c, undefined] : c;
  return { text, x: i * 100, right: i * 100 + text.length * 5, ...(confidence === undefined ? {} : { confidence }) };
}));
/** What readPdf gives for these rows as page 1 (text), or as scanned pages. */
const onePage = (rows: (string | [string, number])[][], ocr = false) => ({ pages: [{ page: 1, ocr, rows: placed(rows) }] });
const fileInput = () => document.querySelector<HTMLInputElement>('input[type="file"]')!;
const uploadedNames = () => vi.mocked(api.upload).mock.calls.map(([f]) => f.name);

/** A reader call that finishes only when the test says so. */
function deferredRead() {
  let resolve!: (sheets: SheetData[]) => void;
  vi.mocked(readExcel).mockReturnValueOnce(new Promise((r) => { resolve = r; }));
  return (sheets: SheetData[]) => act(async () => resolve(sheets));
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.storageMode).mockResolvedValue('saved');
  vi.mocked(api.list).mockResolvedValue([clean]);
  vi.mocked(api.upload).mockResolvedValue(clean);
});

async function setup() {
  const user = userEvent.setup();
  render(<FilesPage />);
  await screen.findByRole('checkbox', { name: 'Select clean clean.csv' });
  return user;
}

describe('converting Excel uploads', () => {
  it('reviews the table found in an Excel file, then uploads it as a CSV', async () => {
    const user = await setup();
    vi.mocked(readExcel).mockResolvedValue(sheet);
    await user.upload(fileInput(), xlsx());

    const review = await screen.findByRole('dialog', { name: 'Review report.xlsx' });
    expect(review).toHaveTextContent('Partner A · Sheet1 A2:F5 · header on row 2 · 2 rows');
    const toCheck = within(review).getByRole('region', { name: 'Rows to check' });
    expect(toCheck).toHaveTextContent('1 row need checking');
    expect(toCheck).toHaveTextContent('Row 5: total row, left out');
    expect(within(review).getByRole('row', { name: /X-1/ })).toBeInTheDocument();
    expect(within(review).getByText('Showing 2 of 2 rows')).toBeInTheDocument();
    expect(api.upload).not.toHaveBeenCalled(); // nothing is sent before Import

    await user.click(within(review).getByRole('button', { name: 'Import as CSV' }));
    await waitFor(() => expect(api.upload).toHaveBeenCalledTimes(1));
    const sent = vi.mocked(api.upload).mock.calls[0][0];
    expect({ name: sent.name, type: sent.type }).toEqual({ name: 'report.csv', type: 'text/csv' });
    expect(await sent.text()).toBe(`${A.join(',')}\nX-1,2026-09-01,100,40,30,30\nX-2,2026-09-01,200,40,,\n`);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders cell text as text, never as markup', async () => {
    const user = await setup();
    vi.mocked(readExcel).mockResolvedValue([grid([A, ['<b>X-1</b>', '2026-09-01', '1', '2', '3', '4']])]);
    await user.upload(fileInput(), xlsx());
    const review = await screen.findByRole('dialog', { name: 'Review report.xlsx' });
    expect(within(review).getByText('<b>X-1</b>')).toBeInTheDocument();
    expect(review.querySelector('b')).toBeNull();
  });

  it('uploads nothing when the review is cancelled, and still uploads the next file', async () => {
    const user = await setup();
    vi.mocked(readExcel).mockResolvedValue(sheet);
    await user.upload(fileInput(), [xlsx(), new File(['a'], 'next.csv', { type: 'text/csv' })]);
    await user.click(within(await screen.findByRole('dialog', { name: 'Review report.xlsx' })).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(api.upload).toHaveBeenCalledTimes(1));
    expect(uploadedNames()).toEqual(['next.csv']);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument(); // a cancel is not a failure
  });

  it('cancels with Escape, uploading nothing', async () => {
    const user = await setup();
    vi.mocked(readExcel).mockResolvedValue(sheet);
    await user.upload(fileInput(), xlsx());
    await screen.findByRole('dialog', { name: 'Review report.xlsx' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.upload).not.toHaveBeenCalled();
  });

  it('says it is reading, and opens one review at a time for several Excel files', async () => {
    const user = await setup();
    const finishFirst = deferredRead();
    vi.mocked(readExcel).mockResolvedValueOnce(sheet);
    await user.upload(fileInput(), [xlsx(), xlsx('second.xlsx')]);
    expect(await screen.findByText('Reading report.xlsx…')).toBeInTheDocument();
    expect(screen.queryByText('Uploading…')).not.toBeInTheDocument();
    await finishFirst(sheet);
    const first = await screen.findByRole('dialog', { name: 'Review report.xlsx' });
    expect(readExcel).toHaveBeenCalledTimes(1); // the second file waits its turn
    await user.click(within(first).getByRole('button', { name: 'Import as CSV' }));
    const second = await screen.findByRole('dialog', { name: 'Review second.xlsx' });
    await user.click(within(second).getByRole('button', { name: 'Import as CSV' }));
    await waitFor(() => expect(api.upload).toHaveBeenCalledTimes(2));
    expect(uploadedNames()).toEqual(['report.csv', 'second.csv']);
  });

  it('ignores a reader that finishes after the page is gone', async () => {
    const user = await setup();
    const finish = deferredRead();
    await user.upload(fileInput(), xlsx());
    await screen.findByText('Reading report.xlsx…');
    cleanup();
    await finish(sheet);
    expect(api.upload).not.toHaveBeenCalled();
  });

  it('names files it cannot convert, and still uploads the others', async () => {
    await setup();
    vi.mocked(readExcel).mockResolvedValueOnce([grid([['just a title']])]);
    const big = new File([new Uint8Array(20 * 1024 * 1024 + 1)], 'big.xlsx');
    // fireEvent, not user.upload, so the input's accept list doesn't filter out the .docx.
    fireEvent.change(fileInput(), { target: { files: [new File(['x'], 'report.docx'), big, xlsx('notes.xlsx'), new File(['a'], 'good.csv')] } });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("report.docx: This file type can't be converted. Upload a CSV, Excel, PDF or image file.");
    expect(alert).toHaveTextContent('big.xlsx: It is larger than the 20 MB conversion limit.');
    expect(alert).toHaveTextContent("notes.xlsx: No table with a header row and data rows was found on any of its 1 sheet.");
    expect(uploadedNames()).toEqual(['good.csv']);
    expect(readExcel).toHaveBeenCalledTimes(1); // the oversized file was never read
  });
});

describe('Excel files with several tables or unfamiliar headers', () => {
  const lots = ['Lot', 'Mass (lb)', 'R32 %', 'R125 %', 'R134a %'];
  const workbook = [
    grid([lots, ['L1', '10', '40', '30', '30']], 'Lots'),
    grid([['Intro'], A, ['X-1', '2026-09-01', '100', '40', '30', '30']], 'Partner'),
  ];

  it('makes the person choose between tables, then uploads only the chosen one', async () => {
    const user = await setup();
    vi.mocked(readExcel).mockResolvedValue(workbook);
    await user.upload(fileInput(), xlsx());
    const review = await screen.findByRole('dialog', { name: 'Review report.xlsx' });
    const choice = within(review).getByRole('group', { name: 'Choose a table' });
    expect(within(choice).getAllByRole('radio')).toHaveLength(2);
    expect(choice).toHaveTextContent('Lots A1:E2 · Columns to map · 1 row');
    expect(choice).toHaveTextContent('Partner A2:F3 · Partner A · 1 row');
    expect(within(review).queryByRole('table')).not.toBeInTheDocument(); // nothing is previewed until one is chosen
    const importButton = within(review).getByRole('button', { name: 'Import as CSV' });
    expect(importButton).toBeDisabled();

    await user.click(within(choice).getByRole('radio', { name: /Lots A1:E2/ }));
    expect(review).toHaveTextContent('Columns to map · Lots A1:E2 · header on row 1 · 1 row');
    expect(within(review).getByRole('row', { name: /L1/ })).toBeInTheDocument();
    await user.click(importButton);
    await waitFor(() => expect(api.upload).toHaveBeenCalledTimes(1));
    expect(uploadedNames()).toEqual(['report.csv']); // only one table is ever uploaded
    expect(await vi.mocked(api.upload).mock.calls[0][0].text()).toBe(`${lots.join(',')}
L1,10,40,30,30
`);
  });

  it('imports a lone table with unfamiliar headers without asking, for the file service to hold for mapping', async () => {
    const user = await setup();
    vi.mocked(readExcel).mockResolvedValue([workbook[0]]);
    await user.upload(fileInput(), xlsx());
    const review = await screen.findByRole('dialog', { name: 'Review report.xlsx' });
    expect(within(review).queryByRole('group', { name: 'Choose a table' })).not.toBeInTheDocument();
    expect(review).toHaveTextContent('Columns to map · Lots A1:E2');
    await user.click(within(review).getByRole('button', { name: 'Import as CSV' }));
    await waitFor(() => expect(uploadedNames()).toEqual(['report.csv']));
  });

  it('shows formula, merged and blank-header flags by sheet row', async () => {
    const user = await setup();
    const flagged = grid([['Lot', '', 'Mass (lb)'], ['L1', 'x', '10']]);
    flagged.cells[1][2] = { text: '10', kind: 'number', formula: 'B2*2' };
    vi.mocked(readExcel).mockResolvedValue([flagged]);
    await user.upload(fileInput(), xlsx());
    const toCheck = within(await screen.findByRole('dialog', { name: 'Review report.xlsx' })).getByRole('region', { name: 'Rows to check' });
    expect(toCheck).toHaveTextContent('B1 has no header; named "Column B"');
    expect(toCheck).toHaveTextContent("C2 is a formula (=B2*2); its stored result is used and can't be checked here");
  });
});

describe('converting PDF uploads', () => {
  const pdf = (name = 'report.pdf') => new File(['not read: the reader is mocked'], name, { type: 'application/pdf' });

  it('offers PDFs in the file picker', async () => {
    await setup();
    expect(fileInput().accept.split(',')).toEqual(expect.arrayContaining(['.pdf', 'application/pdf']));
  });

  it('reviews the table found in a PDF, leaving out its repeated header, then uploads it as a CSV', async () => {
    const user = await setup();
    vi.mocked(readPdf).mockResolvedValue(onePage([A, ['X-1', '2026-09-01', '100', '40', '30', '30'], A, ['X-2', '2026-09-01', '200', '40', '30', '30']]));
    await user.upload(fileInput(), pdf());

    const review = await screen.findByRole('dialog', { name: 'Review report.pdf' });
    expect(review).toHaveTextContent('Partner A · header on page 1, row 1 · 2 rows');
    expect(within(review).getByRole('region', { name: 'Rows to check' })).toHaveTextContent('Page 1, row 3: repeated header on page 1, left out');
    expect(within(review).queryByRole('region', { name: 'Read by OCR' })).not.toBeInTheDocument(); // a text PDF needs no OCR warning
    await user.click(within(review).getByRole('button', { name: 'Import as CSV' }));
    await waitFor(() => expect(api.upload).toHaveBeenCalledTimes(1));
    expect(uploadedNames()).toEqual(['report.csv']);
    expect(await vi.mocked(api.upload).mock.calls[0][0].text()).toBe(`${A.join(',')}
X-1,2026-09-01,100,40,30,30
X-2,2026-09-01,200,40,30,30
`);
  });

  it('names a PDF it cannot read, and still converts the next file', async () => {
    const user = await setup();
    vi.mocked(readPdf)
      .mockRejectedValueOnce(new ConvertError('No text was found on page 2.'))
      .mockResolvedValueOnce(onePage([A, ['X-1', '2026-09-01', '100', '40', '30', '30']]));
    await user.upload(fileInput(), [pdf('scan.pdf'), pdf('text.pdf')]);
    const review = await screen.findByRole('dialog', { name: 'Review text.pdf' });
    await user.click(within(review).getByRole('button', { name: 'Import as CSV' }));
    await waitFor(() => expect(api.upload).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('alert')).toHaveTextContent('scan.pdf: No text was found on page 2.');
    expect(uploadedNames()).toEqual(['text.csv']);
  });

  it('cancelling a PDF review uploads nothing and moves on to the next file', async () => {
    const user = await setup();
    vi.mocked(readPdf).mockResolvedValue(onePage([A, ['X-1', '2026-09-01', '100', '40', '30', '30']]));
    await user.upload(fileInput(), [pdf('one.pdf'), pdf('two.pdf')]);
    await user.click(within(await screen.findByRole('dialog', { name: 'Review one.pdf' })).getByRole('button', { name: 'Cancel' }));
    await user.click(within(await screen.findByRole('dialog', { name: 'Review two.pdf' })).getByRole('button', { name: 'Import as CSV' }));
    await waitFor(() => expect(api.upload).toHaveBeenCalledTimes(1));
    expect(uploadedNames()).toEqual(['two.csv']);
  });
});

describe('converting scanned PDFs and images with OCR', () => {
  const pdf = (name = 'scan.pdf') => new File(['not read: the reader is mocked'], name, { type: 'application/pdf' });
  const png = (name = 'table.png') => new File(['not read: the reader is mocked'], name, { type: 'image/png' });
  const rows = [A, ['X-1', '2026-09-01', '100', '40', '30', '30']];

  it('offers images in the file picker', async () => {
    await setup();
    expect(fileInput().accept.split(',')).toEqual(expect.arrayContaining(['.png', '.jpg', '.jpeg', 'image/png', 'image/jpeg']));
    expect(screen.getByText(/Drop CSV, Excel, PDF or image files here/)).toBeInTheDocument();
  });

  it('shows each page as it is read, then warns that the scanned pages were read by OCR', async () => {
    const user = await setup();
    let finish!: (value: ReturnType<typeof onePage>) => void;
    vi.mocked(readPdf).mockImplementation((_file, _signal, onProgress) => {
      onProgress?.({ stage: 'page', page: 1, pages: 3 });
      return new Promise((resolve) => { finish = resolve; });
    });
    await user.upload(fileInput(), pdf());
    expect(await screen.findByText('Reading scan.pdf: page 1 of 3…')).toBeInTheDocument();
    const onProgress = vi.mocked(readPdf).mock.calls[0][2]!;
    act(() => onProgress({ stage: 'preparing' }));
    expect(screen.getByText('Getting OCR ready (the first time downloads about 10 MB)…')).toBeInTheDocument();
    act(() => onProgress({ stage: 'page', page: 2, pages: 3 }));
    // The status line is a live region, so screen readers hear each page.
    expect(screen.getByText('Reading scan.pdf: page 2 of 3…').closest('[aria-live="polite"]')).not.toBeNull();
    await act(async () => finish({ pages: [{ page: 1, ocr: false, rows: placed(rows) }, { page: 2, ocr: true, rows: [] }, { page: 3, ocr: true, rows: [] }] }));

    const review = await screen.findByRole('dialog', { name: 'Review scan.pdf' });
    const warning = within(review).getByRole('region', { name: 'Read by OCR' });
    expect(warning).toHaveTextContent('Read by OCR: check the numbers');
    expect(warning).toHaveTextContent('Text on pages 2 and 3 was read by OCR, so digits and decimal points may be wrong. Compare them with the original before importing.');
    await user.click(within(review).getByRole('button', { name: 'Import as CSV' }));
    await waitFor(() => expect(uploadedNames()).toEqual(['scan.csv']));
  });

  it('reads an image with OCR and says the whole image was read that way', async () => {
    const user = await setup();
    vi.mocked(readImage).mockResolvedValue(placed(rows));
    await user.upload(fileInput(), png());
    const review = await screen.findByRole('dialog', { name: 'Review table.png' });
    expect(within(review).getByRole('region', { name: 'Read by OCR' })).toHaveTextContent('This image was read by OCR, so digits and decimal points may be wrong.');
    await user.click(within(review).getByRole('button', { name: 'Import as CSV' }));
    await waitFor(() => expect(uploadedNames()).toEqual(['table.csv']));
  });

  it('Cancel while reading stops the reader, uploads nothing, ignores its late result and goes on to the next file', async () => {
    const user = await setup();
    let late!: (value: PlacedCell[][]) => void;
    vi.mocked(readImage)
      .mockImplementationOnce(() => new Promise((resolve) => { late = resolve; }))
      .mockResolvedValueOnce(placed(rows));
    await user.upload(fileInput(), [png('slow.png'), png('next.png')]);
    await screen.findByText('Reading slow.png…');
    expect(vi.mocked(readImage).mock.calls[0][1].aborted).toBe(false);
    const cancel = screen.getByRole('button', { name: 'Cancel reading' });
    expect(cancel.closest('[aria-live]')).toBeNull(); // not read out with every progress update
    await user.click(cancel);
    expect(vi.mocked(readImage).mock.calls[0][1].aborted).toBe(true); // the OCR worker is told to stop
    const next = await screen.findByRole('dialog', { name: 'Review next.png' });
    await act(async () => late(placed(rows))); // the cancelled image finishes late: ignored
    expect(screen.queryByRole('dialog', { name: 'Review slow.png' })).not.toBeInTheDocument();
    await user.click(within(next).getByRole('button', { name: 'Import as CSV' }));
    await waitFor(() => expect(uploadedNames()).toEqual(['next.csv']));
    expect(screen.queryByText('Reading slow.png…')).not.toBeInTheDocument();
  });

  it('returns focus to choosing files after Cancel reading', async () => {
    const user = await setup();
    vi.mocked(readImage).mockImplementationOnce(() => new Promise(() => {}));
    await user.upload(fileInput(), png('slow.png'));
    await user.click(await screen.findByRole('button', { name: 'Cancel reading' }));
    expect(screen.queryByRole('button', { name: 'Cancel reading' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'browse files' })).toHaveFocus();
    expect(api.upload).not.toHaveBeenCalled();
  });

  it('names an image OCR could not read, and still converts the next file', async () => {
    const user = await setup();
    vi.mocked(readImage)
      .mockRejectedValueOnce(new ConvertError("The text-reading data couldn't be downloaded. Check your connection and try again."))
      .mockResolvedValueOnce(placed(rows));
    await user.upload(fileInput(), [png('first.png'), png('second.png')]);
    await user.click(within(await screen.findByRole('dialog', { name: 'Review second.png' })).getByRole('button', { name: 'Import as CSV' }));
    await waitFor(() => expect(uploadedNames()).toEqual(['second.csv']));
    expect(await screen.findByRole('alert')).toHaveTextContent("first.png: The text-reading data couldn't be downloaded. Check your connection and try again.");
  });
});

describe('confirming values read from a PDF or image', () => {
  const pdf = () => new File(['not read: the reader is mocked'], 'report.pdf', { type: 'application/pdf' });
  const png = () => new File(['not read: the reader is mocked'], 'table.png', { type: 'image/png' });

  it('keeps Import as CSV disabled until every doubtful value is kept or left blank, then uploads them as decided', async () => {
    const user = await setup();
    vi.mocked(readPdf).mockResolvedValue({ pages: [
      { page: 1, ocr: false, rows: placed([A, ['X-1', '2026-09-01', '12.5-', '40', '30', '30']]) },
      { page: 2, ocr: false, rows: placed([['X-2', '2026-09-02', '—', '40', '30', '30']]) },
    ] });
    await user.upload(fileInput(), pdf());

    const review = await screen.findByRole('dialog', { name: 'Review report.pdf' });
    const section = within(review).getByRole('region', { name: 'Values to confirm' });
    expect(section).toHaveTextContent('0 of 2 decided');
    const first = within(section).getByRole('group', { name: 'Page 1, row 2 · feed_mass_kg: 12.5-' });
    const second = within(section).getByRole('group', { name: 'Page 2, row 1 · feed_mass_kg: —' });
    expect(first).toHaveTextContent('minus sign may be lost or misplaced');
    expect(within(review).getByRole('columnheader', { name: 'Page' })).toBeInTheDocument();
    const importButton = within(review).getByRole('button', { name: 'Import as CSV' });
    expect(importButton).toBeDisabled();
    expect(importButton).toHaveAccessibleDescription('Decide all 2 values to confirm to import.');

    await user.click(within(first).getByRole('radio', { name: 'Keep as read' }));
    expect(section).toHaveTextContent('1 of 2 decided');
    expect(importButton).toBeDisabled();
    await user.click(within(second).getByRole('radio', { name: 'Leave blank' }));
    expect(within(review).getByText('left blank')).toBeInTheDocument();
    expect(importButton).toBeEnabled();
    await user.click(importButton);

    await waitFor(() => expect(api.upload).toHaveBeenCalledTimes(1));
    expect(await vi.mocked(api.upload).mock.calls[0][0].text()).toBe(`${A.join(',')}
X-1,2026-09-01,12.5-,40,30,30
X-2,2026-09-02,,40,30,30
`);
  });

  it('lists a low-confidence value of an image by its row, and cancelling uploads nothing', async () => {
    const user = await setup();
    vi.mocked(readImage).mockResolvedValue(placed([A, ['X-1', '2026-09-01', ['100', 62], '40', '30', '30']]));
    await user.upload(fileInput(), png());
    const review = await screen.findByRole('dialog', { name: 'Review table.png' });
    const group = within(review).getByRole('group', { name: 'Row 2 · feed_mass_kg: 100' });
    expect(group).toHaveTextContent('OCR confidence 62 (below 80)');
    expect(within(review).queryByRole('columnheader', { name: 'Page' })).not.toBeInTheDocument(); // an image has no pages
    expect(within(review).getByRole('button', { name: 'Import as CSV' })).toBeDisabled();
    await user.click(within(review).getByRole('button', { name: 'Cancel' }));
    expect(api.upload).not.toHaveBeenCalled();
  });
});
