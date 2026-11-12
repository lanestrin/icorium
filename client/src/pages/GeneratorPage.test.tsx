import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileMeta, GeneratedFile } from '../../../shared/types';
import App from '../App';
import { GeneratorPage } from './GeneratorPage';
import { api } from '../lib/api';
import generatorStyles from '../components/generator/generator.module.css';

vi.mock('../lib/api', () => ({ api: {
  list: vi.fn(), process: vi.fn(), rows: vi.fn(), upload: vi.fn(), compare: vi.fn(), archive: vi.fn(), generate: vi.fn(),
  downloadUrl: (id: string) => `/api/files/${id}/download`,
} }));

const header = 'batch_id,sample_date,feed_mass_kg,r32_pct,r125_pct,r134a_pct';
const csv = (lines: string[]) => [header, ...lines].join('\r\n');
const clean: GeneratedFile = {
  name: 'partnerA-11092026-001.csv', partner: 'A', rows: 3, errors: [],
  text: csv(['A-001,2026-09-01,120.875,34.71,29.13,36.16', 'A-002,2026-09-02,136.257,38.77,28.19,33.04', 'A-003,2026-09-03,129.838,37.28,32.67,30.05']),
};
const cFile = (n: number, mass: string): GeneratedFile => ({
  name: `partnerC-11092026-00${n}.csv`, partner: 'C', rows: 40,
  errors: [{ row: 2, kind: 'mass missing' }, { row: 5, kind: 'duplicate batch ID' }, { row: 6, kind: 'duplicate batch ID' }],
  text: csv(Array.from({ length: 40 }, (_, i) => `C-${String(i + 1).padStart(3, '0')},2026-09-01,${i === 1 ? '' : mass},0.37633,0.27931,0.34436`)),
});
const batch = [cFile(1, '122720'), cFile(2, '133001')];

const generateButton = () => screen.getByRole('button', { name: /^Generat/ });
const number = (name: string) => screen.getByRole('spinbutton', { name });
const results = () => screen.getByRole('region', { name: 'Generated files' });
const fileTable = () => within(results()).getByRole('table', { name: 'Generated files' });

beforeEach(() => { vi.resetAllMocks(); });

describe('CSV generator page', () => {
  it('generates one clean Partner A file with the defaults and previews it', async () => {
    const user = userEvent.setup();
    vi.mocked(api.generate).mockResolvedValue({ files: [clean] });
    render(<GeneratorPage />);
    expect(screen.getByRole('link', { name: /Back to CSV Files/ })).toHaveAttribute('href', '/');
    expect(screen.getByRole('radio', { name: /Partner A/ })).toBeChecked();
    expect(number('Rows')).toHaveValue(25);
    expect(number('Number of files')).toHaveValue(1);
    expect(number('Number of files')).toHaveAccessibleDescription('1 to 10 files. No two files have the same data.');
    expect(screen.getByRole('radio', { name: 'No errors' })).toBeChecked();
    expect(screen.queryByRole('spinbutton', { name: 'Rows with errors' })).not.toBeInTheDocument();
    expect(generateButton()).toHaveTextContent('Generate CSV');

    await user.click(generateButton());
    expect(api.generate).toHaveBeenCalledWith({ partner: 'A', rows: 25, errorRows: 0, files: 1 });
    expect(await within(results()).findByText('1 file · Partner A · 3 rows each · no errors')).toBeInTheDocument();
    expect(within(fileTable()).getByRole('textbox', { name: 'File name 1' })).toHaveValue(clean.name);
    expect(within(results()).getByRole('button', { name: 'Add to CSV Files' })).toBeInTheDocument();
    expect(within(results()).queryByRole('list', { name: 'Planted errors' })).not.toBeInTheDocument();
    const preview = within(results()).getByRole('table', { name: 'Preview' });
    expect(within(preview).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Row', ...header.split(',')]);
    expect(within(preview).getAllByRole('row')).toHaveLength(4);
    expect(within(preview).getAllByRole('row')[1]).toHaveTextContent('1A-0012026-09-01120.87534.7129.1336.16');
  });

  it('asks for partner, rows, number of files and error rows, then lists each file', async () => {
    const user = userEvent.setup();
    vi.mocked(api.generate).mockResolvedValue({ files: batch });
    render(<GeneratorPage />);
    await user.click(screen.getByRole('radio', { name: /Partner C/ }));
    await user.clear(number('Rows'));
    await user.type(number('Rows'), '40');
    await user.clear(number('Number of files'));
    await user.type(number('Number of files'), '2');
    expect(generateButton()).toHaveTextContent('Generate 2 CSV files');
    await user.click(screen.getByRole('radio', { name: 'Include errors' }));
    expect(number('Rows with errors')).toHaveValue(2);
    expect(number('Rows with errors')).toHaveAccessibleDescription(/duplicate batch ID \(which marks two rows\)/);
    await user.clear(number('Rows with errors'));
    await user.type(number('Rows with errors'), '3');
    await user.click(generateButton());

    expect(api.generate).toHaveBeenCalledWith({ partner: 'C', rows: 40, errorRows: 3, files: 2 });
    expect(await screen.findByText('2 files · Partner C · 40 rows each · 3 rows with errors each')).toBeInTheDocument();
    const rows = within(fileTable()).getAllByRole('row').slice(1);
    expect(rows.map((r) => within(r).getByRole('textbox').getAttribute('value'))).toEqual(batch.map((f) => f.name));
    expect(rows.map((r) => within(r).getAllByRole('cell')[1].textContent)).toEqual(['3', '3']);
    expect(within(results()).getByRole('button', { name: 'Add all 2 to CSV Files' })).toBeInTheDocument();

    // The first file is previewed, with its planted errors and highlighted error rows.
    expect(within(results()).getByRole('heading', { name: batch[0].name })).toBeInTheDocument();
    expect(within(within(results()).getByRole('list', { name: 'Planted errors' })).getAllByRole('listitem').map((li) => li.textContent))
      .toEqual(['Row 2 · mass missing', 'Row 5 · duplicate batch ID', 'Row 6 · duplicate batch ID']);
    const preview = () => within(results()).getByRole('table', { name: 'Preview' });
    expect(within(preview()).getAllByRole('row')).toHaveLength(11); // header + first 10 rows
    expect(within(preview()).getAllByRole('row')[2]).toHaveClass(generatorStyles.flaggedRow); // highlighted
    expect(within(preview()).getAllByRole('row')[1]).not.toHaveClass(generatorStyles.flaggedRow);
    expect(within(preview()).getAllByRole('row')[1]).toHaveTextContent('122720');

    await user.click(within(fileTable()).getByRole('button', { name: `Preview ${batch[1].name}` }));
    expect(within(fileTable()).getByRole('button', { name: `Preview ${batch[1].name}` })).toHaveAttribute('aria-pressed', 'true');
    expect(within(results()).getByRole('heading', { name: batch[1].name })).toBeInTheDocument();
    expect(within(preview()).getAllByRole('row')[1]).toHaveTextContent('133001');

    // Switching back to No errors sends zero error rows.
    await user.click(screen.getByRole('radio', { name: 'No errors' }));
    await user.click(generateButton());
    expect(api.generate).toHaveBeenLastCalledWith({ partner: 'C', rows: 40, errorRows: 0, files: 2 });
  });

  it('downloads each file under its chosen name', async () => {
    const user = userEvent.setup();
    vi.mocked(api.generate).mockResolvedValue({ files: batch });
    render(<GeneratorPage />);
    await user.click(generateButton());
    const link = await within(results()).findByRole('link', { name: `Download ${batch[1].name}` });
    expect(link).toHaveAttribute('download', batch[1].name);
    expect(decodeURIComponent(link.getAttribute('href')!)).toBe(`data:text/csv;charset=utf-8,${batch[1].text}`);
    const name = within(fileTable()).getByRole('textbox', { name: 'File name 2' });
    await user.clear(name);
    await user.type(name, 'my_second_file');
    expect(within(results()).getByRole('link', { name: 'Download my_second_file.csv' })).toHaveAttribute('download', 'my_second_file.csv'); // .csv is added
    expect(within(results()).getByRole('link', { name: `Download ${batch[0].name}` })).toBeInTheDocument();
  });

  it('adds every file to the file list through the normal upload', async () => {
    const user = userEvent.setup();
    vi.mocked(api.generate).mockResolvedValue({ files: batch });
    vi.mocked(api.upload).mockResolvedValue({} as FileMeta);
    render(<GeneratorPage />);
    await user.click(generateButton());
    await user.click(await within(results()).findByRole('button', { name: 'Add all 2 to CSV Files' }));
    const uploaded = vi.mocked(api.upload).mock.calls.map(([f]) => f);
    expect(uploaded.map((f) => f.name)).toEqual(batch.map((f) => f.name));
    expect(await Promise.all(uploaded.map((f) => f.text()))).toEqual(batch.map((f) => f.text));
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('Added 2 files to CSV Files.');
    expect(within(status).getByRole('link', { name: 'Open CSV Files' })).toHaveAttribute('href', '/');
  });

  it('names a single added file, and reports each file that could not be added', async () => {
    const user = userEvent.setup();
    vi.mocked(api.generate).mockResolvedValue({ files: batch });
    vi.mocked(api.upload).mockResolvedValueOnce({} as FileMeta).mockRejectedValueOnce(new Error('Unrecognized CSV schema'));
    render(<GeneratorPage />);
    await user.click(generateButton());
    await user.click(await within(results()).findByRole('button', { name: 'Add all 2 to CSV Files' }));
    expect(await screen.findByRole('status')).toHaveTextContent(`Added ${batch[0].name} to CSV Files.`);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Could not add to CSV Files');
    expect(alert).toHaveTextContent(`${batch[1].name}: Unrecognized CSV schema`);
    expect(within(results()).getByRole('table', { name: 'Preview' })).toBeInTheDocument();
    expect(within(results()).getByRole('button', { name: 'Add all 2 to CSV Files' })).toBeEnabled();
  });

  it('shows the server message when generating fails, and generates once on a double click', async () => {
    const user = userEvent.setup();
    let reject!: (e: Error) => void;
    vi.mocked(api.generate).mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    render(<GeneratorPage />);
    await user.dblClick(generateButton());
    expect(screen.getByRole('button', { name: /Generating/ })).toBeDisabled();
    reject(new Error('Generate at most 10 files at a time'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not generate: Generate at most 10 files at a time');
    expect(api.generate).toHaveBeenCalledTimes(1);
    expect(generateButton()).toBeEnabled();
  });

  it('generates from the keyboard', async () => {
    const user = userEvent.setup();
    vi.mocked(api.generate).mockResolvedValue({ files: [clean] });
    render(<GeneratorPage />);
    number('Number of files').focus();
    await user.keyboard('{Enter}'); // submits the form
    await waitFor(() => expect(api.generate).toHaveBeenCalledWith({ partner: 'A', rows: 25, errorRows: 0, files: 1 }));
  });
});

describe('page routing', () => {
  afterEach(() => { window.history.pushState({}, '', '/'); });

  it('shows the generator at /generator and the file workspace elsewhere', async () => {
    vi.mocked(api.list).mockResolvedValue([]);
    window.history.pushState({}, '', '/generator');
    const { unmount } = render(<App />);
    expect(screen.getByRole('heading', { name: 'CSV Generator' })).toBeInTheDocument();
    unmount();

    window.history.pushState({}, '', '/');
    render(<App />);
    expect(screen.getByRole('heading', { name: 'CSV Files' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /CSV Generator/ })).toHaveAttribute('href', '/generator');
    await waitFor(() => expect(api.list).toHaveBeenCalled());
  });
});
