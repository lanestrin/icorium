import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileMeta } from '../../../shared/types';
import { FilesPage } from './FilesPage';
import { api } from '../lib/api';
import { readExcel } from '../lib/convert/excel';
import { readPdf } from '../lib/convert/pdf';
import { ConvertError } from '../lib/convert/table';

vi.mock('../lib/api', () => ({ api: {
  list: vi.fn(), process: vi.fn(), rows: vi.fn(), upload: vi.fn(), compare: vi.fn(), archive: vi.fn(), generate: vi.fn(),
  downloadUrl: (id: string) => `/api/files/${id}/download`,
} }));
// The Excel reader is tested with real workbooks in lib/convert; here it is mocked to control timing.
vi.mock('../lib/convert/excel', () => ({ readExcel: vi.fn() }));
vi.mock('../lib/convert/pdf', () => ({ readPdf: vi.fn() }));

const clean: FileMeta = { id: 'clean', name: 'clean.csv', status: 'Ready', problemRows: 0, rows: 25, columns: 7, uploadedAt: '2026-11-06T12:00:00Z' };
const A = ['batch_id', 'sample_date', 'feed_mass_kg', 'r32_pct', 'r125_pct', 'r134a_pct'];
// A first sheet with a title row above the header, one full row and one short row.
const sheet = [['Partner A export'], A, ['X-1', '2026-09-01', '100', '40', '30', '30'], ['X-2', '2026-09-01', '200', '40']];
const xlsx = (name = 'report.xlsx') => new File(['not read: the reader is mocked'], name);
const fileInput = () => document.querySelector<HTMLInputElement>('input[type="file"]')!;
const uploadedNames = () => vi.mocked(api.upload).mock.calls.map(([f]) => f.name);

/** A reader call that finishes only when the test says so. */
function deferredRead() {
  let resolve!: (rows: string[][]) => void;
  vi.mocked(readExcel).mockReturnValueOnce(new Promise((r) => { resolve = r; }));
  return (rows: string[][]) => act(async () => resolve(rows));
}

beforeEach(() => {
  vi.resetAllMocks();
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
    expect(review).toHaveTextContent('Partner A · header on row 2 · 2 rows');
    const toCheck = within(review).getByRole('region', { name: 'Rows to check' });
    expect(toCheck).toHaveTextContent('1 row need checking');
    expect(toCheck).toHaveTextContent('Row 4: missing 2 cells');
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
    vi.mocked(readExcel).mockResolvedValue([A, ['<b>X-1</b>', '2026-09-01', '1', '2', '3', '4']]);
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
    vi.mocked(readExcel).mockResolvedValueOnce([['name', 'value'], ['a', '1']]);
    const big = new File([new Uint8Array(20 * 1024 * 1024 + 1)], 'big.xlsx');
    // fireEvent, not user.upload, so the input's accept list doesn't filter out the .docx.
    fireEvent.change(fileInput(), { target: { files: [new File(['x'], 'report.docx'), big, xlsx('notes.xlsx'), new File(['a'], 'good.csv')] } });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("report.docx: This file type can't be converted. Upload a CSV, Excel or PDF file.");
    expect(alert).toHaveTextContent('big.xlsx: It is larger than the 20 MB conversion limit.');
    expect(alert).toHaveTextContent("notes.xlsx: No header row with a partner's columns was found in the first sheet.");
    expect(uploadedNames()).toEqual(['good.csv']);
    expect(readExcel).toHaveBeenCalledTimes(1); // the oversized file was never read
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
    vi.mocked(readPdf).mockResolvedValue([A, ['X-1', '2026-09-01', '100', '40', '30', '30'], A, ['X-2', '2026-09-01', '200', '40', '30', '30']]);
    await user.upload(fileInput(), pdf());

    const review = await screen.findByRole('dialog', { name: 'Review report.pdf' });
    expect(review).toHaveTextContent('Partner A · header on row 1 · 2 rows');
    expect(within(review).getByRole('region', { name: 'Rows to check' })).toHaveTextContent('Row 3: repeated header, left out');
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
      .mockRejectedValueOnce(new ConvertError("Page 2 is a scanned image with no text to read. Scanned PDFs can't be converted yet."))
      .mockResolvedValueOnce([A, ['X-1', '2026-09-01', '100', '40', '30', '30']]);
    await user.upload(fileInput(), [pdf('scan.pdf'), pdf('text.pdf')]);
    const review = await screen.findByRole('dialog', { name: 'Review text.pdf' });
    await user.click(within(review).getByRole('button', { name: 'Import as CSV' }));
    await waitFor(() => expect(api.upload).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('alert')).toHaveTextContent("scan.pdf: Page 2 is a scanned image with no text to read. Scanned PDFs can't be converted yet.");
    expect(uploadedNames()).toEqual(['text.csv']);
  });

  it('cancelling a PDF review uploads nothing and moves on to the next file', async () => {
    const user = await setup();
    vi.mocked(readPdf).mockResolvedValue([A, ['X-1', '2026-09-01', '100', '40', '30', '30']]);
    await user.upload(fileInput(), [pdf('one.pdf'), pdf('two.pdf')]);
    await user.click(within(await screen.findByRole('dialog', { name: 'Review one.pdf' })).getByRole('button', { name: 'Cancel' }));
    await user.click(within(await screen.findByRole('dialog', { name: 'Review two.pdf' })).getByRole('button', { name: 'Import as CSV' }));
    await waitFor(() => expect(api.upload).toHaveBeenCalledTimes(1));
    expect(uploadedNames()).toEqual(['two.csv']);
  });
});
