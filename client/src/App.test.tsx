import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileMeta } from '../../shared/types';
import App from './App';
import { api } from './api';

vi.mock('./api', () => ({ api: {
  list: vi.fn(), process: vi.fn(), rows: vi.fn(), upload: vi.fn(), compare: vi.fn(), archive: vi.fn(),
  downloadUrl: (id: string) => `/api/files/${id}/download`,
} }));

const base = { rows: 25, columns: 7, uploadedAt: '2026-11-06T12:00:00Z' };
const clean: FileMeta = { ...base, id: 'clean', name: 'clean.csv', status: 'Ready', problemRows: 0 };
const invalid: FileMeta = { ...base, id: 'invalid', name: 'invalid.csv', status: 'Needs Review', problemRows: 2 };
const result: FileMeta = { ...base, id: 'result', name: 'result.csv', status: 'Processed', problemRows: 2, processor: 'mass' };
const row = (name: string) => screen.getByRole('row', { name: new RegExp(name) });
const statusFilter = () => screen.getByRole('combobox', { name: /Status/ });
const check = (name: string) => screen.getByRole('checkbox', { name: `Select ${name}` });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.list).mockResolvedValue([clean, invalid, result]);
  vi.mocked(api.rows).mockResolvedValue({ headers: ['batch_id'], rows: [], offset: 0, totalRows: 0, generatedColumns: [], problems: { total: 0, items: [] } });
});

async function setup() {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole('checkbox', { name: 'Select clean.csv' });
  return user;
}

describe('input selection and status filtering', () => {
  it('selects every file but processes only the selected inputs', async () => {
    const user = await setup();
    expect(check('result.csv')).toBeEnabled();
    // The status badge is the only status marker; no separate "N invalid" tag on inputs or results.
    for (const name of ['clean.csv', 'invalid.csv', 'result.csv']) expect(within(row(name)).queryByText(/\d+ invalid/)).not.toBeInTheDocument();
    expect(within(row('invalid.csv')).getByText('Needs Review')).toBeInTheDocument();
    expect(within(row('result.csv')).getByText('Processed')).toBeInTheDocument();
    await user.click(check('clean.csv'));
    await user.click(row('invalid.csv'));
    expect(check('clean.csv')).toBeChecked();
    expect(check('invalid.csv')).toBeChecked();
    expect(screen.getByRole('button', { name: 'Run Processing (2)' })).toBeEnabled();
    expect(screen.getByRole('list', { name: 'Selected input files' })).toHaveTextContent('clean.csvinvalid.csv');
    expect(screen.getByRole('checkbox', { name: 'Select all files' })).toBePartiallyChecked();
    await user.click(screen.getByRole('checkbox', { name: 'Select all files' }));
    expect(check('clean.csv')).toBeChecked();
    expect(check('invalid.csv')).toBeChecked();
    expect(check('result.csv')).toBeChecked();
    // A selected result is not processed: the count and list name only the inputs.
    expect(screen.getByRole('button', { name: 'Run Processing (2)' })).toBeEnabled();
    expect(screen.getByRole('list', { name: 'Selected input files' })).toHaveTextContent('clean.csvinvalid.csv');
    await user.click(screen.getByRole('checkbox', { name: 'Select all files' }));
    for (const name of ['clean.csv', 'invalid.csv', 'result.csv']) expect(check(name)).not.toBeChecked();
    await user.click(row('result.csv'));
    expect(check('result.csv')).toBeChecked();
    expect(screen.getByRole('button', { name: 'Run Processing' })).toBeDisabled();
  });

  it('filters Needs Review and toggles only visible inputs while retaining hidden selections', async () => {
    const user = await setup();
    await user.click(check('clean.csv'));
    expect(screen.getByRole('checkbox', { name: 'Select all files' })).toBePartiallyChecked();
    await user.selectOptions(statusFilter(), 'Needs Review');
    expect(screen.queryByRole('checkbox', { name: 'Select clean.csv' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Select result.csv' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Select all files' }));
    expect(screen.getByRole('list', { name: 'Selected input files' })).toHaveTextContent('clean.csvinvalid.csv');
    await user.click(screen.getByRole('checkbox', { name: 'Select all files' }));
    await user.selectOptions(statusFilter(), 'All');
    expect(check('clean.csv')).toBeChecked();
    expect(check('invalid.csv')).not.toBeChecked();
  });

  it('combines status, search and date filters, then clears them', async () => {
    const user = await setup();
    await user.selectOptions(statusFilter(), 'Ready');
    expect(check('clean.csv')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Select invalid.csv' })).not.toBeInTheDocument();
    await user.selectOptions(statusFilter(), 'Processed');
    expect(check('result.csv')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Select clean.csv' })).not.toBeInTheDocument();
    await user.selectOptions(statusFilter(), 'Needs Review');
    await user.type(screen.getByPlaceholderText('Search CSV files...'), 'clean');
    expect(screen.getByText('No CSV files match your filters.')).toBeInTheDocument();
    await user.clear(screen.getByPlaceholderText('Search CSV files...'));
    // Native date inputs do not support user-event typing consistently in jsdom.
    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-11-07' } });
    expect(screen.getByText('No CSV files match your filters.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(check('clean.csv')).toBeInTheDocument();
    expect(check('invalid.csv')).toBeInTheDocument();
    expect(check('result.csv')).toBeInTheDocument();
    expect(screen.getByLabelText('From date')).toHaveValue('');
  });

  it.each(['Component Mass Calculation', 'Batch Classification', 'Composition Validation'])(
    'runs %s on invalid input and clears successful selections', async (label) => {
      const user = await setup();
      vi.mocked(api.process).mockResolvedValue(result);
      await user.click(check('invalid.csv'));
      await user.click(screen.getByRole('radio', { name: new RegExp(label) }));
      await user.click(screen.getByRole('button', { name: 'Run Processing' }));
      const processor = label.startsWith('Component') ? 'mass' : label.startsWith('Batch') ? 'classification' : 'validation';
      if (processor !== 'validation') {
        const warning = screen.getByRole('dialog', { name: 'Data Quality Warning' });
        expect(warning).toHaveTextContent(label);
        expect(api.process).not.toHaveBeenCalled();
        await user.click(within(warning).getByRole('button', { name: 'Process Valid Rows' }));
      } else {
        expect(screen.queryByRole('dialog', { name: 'Data Quality Warning' })).not.toBeInTheDocument();
      }
      await waitFor(() => expect(api.process).toHaveBeenCalledWith('invalid', processor));
      expect(api.process).toHaveBeenCalledTimes(1);
      await screen.findByRole('dialog');
      expect(check('invalid.csv')).not.toBeChecked();
      expect(within(row('invalid.csv')).getByText('Needs Review')).toBeInTheDocument();
    },
  );

  it('supports keyboard selection and restores focus after closing a preview', async () => {
    const user = await setup();
    check('invalid.csv').focus();
    await user.keyboard(' ');
    expect(check('invalid.csv')).toBeChecked();
    const preview = within(row('invalid.csv')).getByRole('button', { name: 'Preview' });
    await user.click(preview);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(preview).toHaveFocus();
  });

  it('processes mixed selections once and retains only failed inputs', async () => {
    const user = await setup();
    vi.mocked(api.process).mockResolvedValueOnce(result).mockRejectedValueOnce(new Error('Retry invalid'));
    await user.click(screen.getByRole('checkbox', { name: 'Select all files' }));
    await user.click(screen.getByRole('button', { name: 'Run Processing (2)' }));
    await screen.findByRole('dialog');
    expect(api.process).toHaveBeenCalledTimes(2);
    expect(api.process).toHaveBeenNthCalledWith(1, 'clean', 'validation');
    expect(api.process).toHaveBeenNthCalledWith(2, 'invalid', 'validation');
    expect(check('clean.csv')).not.toBeChecked();
    expect(check('invalid.csv')).toBeChecked();
    expect(screen.getByRole('alert')).toHaveTextContent('Retry invalid');
  });

  it('locks selection while processing, displays failure, and retains failed inputs for retry', async () => {
    const user = await setup();
    let reject!: (error: Error) => void;
    vi.mocked(api.process).mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    await user.click(check('invalid.csv'));
    await user.click(screen.getByRole('button', { name: 'Run Processing' }));
    expect(check('clean.csv')).toBeDisabled();
    expect(check('invalid.csv')).toBeDisabled();
    await user.selectOptions(statusFilter(), 'Processing');
    expect(check('invalid.csv')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Select clean.csv' })).not.toBeInTheDocument();
    await act(async () => reject(new Error('Try again')));
    await user.selectOptions(statusFilter(), 'Error');
    expect(check('invalid.csv')).toBeChecked();
    expect(screen.getByRole('alert')).toHaveTextContent('Try again');
    vi.mocked(api.process).mockResolvedValueOnce(result);
    await user.click(screen.getByRole('button', { name: 'Run Processing' }));
    await screen.findByRole('dialog');
    expect(api.process).toHaveBeenCalledTimes(2);
    expect(screen.getByText('No CSV files match your filters.')).toBeInTheDocument();
  });
});

describe('data quality warning', () => {
  const runButton = (n?: number) => screen.getByRole('button', { name: n ? `Run Processing (${n})` : 'Run Processing' });
  const warning = () => screen.getByRole('dialog', { name: 'Data Quality Warning' });
  async function warnMixedMass() {
    const user = await setup();
    await user.click(screen.getByRole('checkbox', { name: 'Select all files' }));
    await user.click(screen.getByRole('radio', { name: /Component Mass Calculation/ }));
    await user.click(runButton(2));
    return user;
  }

  it('lists only the files with invalid rows, with valid and invalid counts', async () => {
    await warnMixedMass();
    const files = within(warning()).getByRole('list', { name: 'Files with invalid rows' });
    expect(within(files).getAllByRole('listitem')).toHaveLength(1);
    expect(files).toHaveTextContent('invalid.csv23 valid rows · 2 invalid rows');
    expect(files).not.toHaveTextContent('clean.csv');
    expect(warning()).toHaveTextContent('1 other selected file has no invalid rows and will be processed normally.');
    expect(warning()).toHaveTextContent('Valid rows will be calculated. Invalid rows will remain in the output with error details and no calculated values.');
    expect(warning()).toHaveFocus();
  });

  it.each([
    ['Cancel', (user: ReturnType<typeof userEvent.setup>) => user.click(within(warning()).getByRole('button', { name: 'Cancel' }))],
    ['Escape', (user: ReturnType<typeof userEvent.setup>) => user.keyboard('{Escape}')],
    ['the close button', (user: ReturnType<typeof userEvent.setup>) => user.click(within(warning()).getByRole('button', { name: 'Close' }))],
  ])('%s sends no requests, keeps the selection and returns focus to Run Processing', async (_, cancel) => {
    const user = await warnMixedMass();
    await cancel(user);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.process).not.toHaveBeenCalled();
    expect(check('clean.csv')).toBeChecked();
    expect(check('invalid.csv')).toBeChecked();
    expect(runButton(2)).toHaveFocus();
  });

  it('keeps Tab inside the dialog', async () => {
    const user = await warnMixedMass();
    const buttons = within(warning()).getAllByRole('button');
    buttons[buttons.length - 1].focus();
    await user.tab();
    expect(buttons[0]).toHaveFocus();
    await user.tab({ shift: true });
    expect(buttons[buttons.length - 1]).toHaveFocus();
  });

  it('processes the shown files once each, even on a double click', async () => {
    vi.mocked(api.process).mockResolvedValue(result);
    const user = await warnMixedMass();
    await user.dblClick(within(warning()).getByRole('button', { name: 'Process Valid Rows' }));
    await screen.findByRole('status');
    expect(api.process).toHaveBeenCalledTimes(2);
    expect(api.process).toHaveBeenNthCalledWith(1, 'clean', 'mass');
    expect(api.process).toHaveBeenNthCalledWith(2, 'invalid', 'mass');
    expect(screen.queryByRole('dialog', { name: 'Data Quality Warning' })).not.toBeInTheDocument();
  });

  it('runs clean-only selections without a warning, once on a double click', async () => {
    vi.mocked(api.process).mockResolvedValue(result);
    const user = await setup();
    await user.click(check('clean.csv'));
    await user.click(screen.getByRole('radio', { name: /Batch Classification/ }));
    await user.dblClick(runButton());
    await screen.findByRole('dialog');
    expect(screen.queryByRole('dialog', { name: 'Data Quality Warning' })).not.toBeInTheDocument();
    expect(api.process).toHaveBeenCalledTimes(1);
    expect(api.process).toHaveBeenCalledWith('clean', 'classification');
  });
});

describe('archive and restore', () => {
  const archived = (f: FileMeta): FileMeta => ({ ...f, archived: true });
  const actionButton = (name: RegExp) => screen.getByRole('button', { name });

  it('archives the selected files, hides them, and restores them from the Archived view', async () => {
    const user = await setup();
    expect(actionButton(/^Archive/)).toBeDisabled();
    await user.click(check('invalid.csv'));
    await user.click(check('result.csv'));
    vi.mocked(api.archive).mockResolvedValueOnce([archived(invalid), archived(result)]);
    vi.mocked(api.list).mockResolvedValue([clean, archived(invalid), archived(result)]);
    await user.click(actionButton(/^Archive \(2\)$/));

    expect(api.archive).toHaveBeenCalledWith(['invalid', 'result'], true);
    expect(await screen.findByRole('status')).toHaveTextContent('Archived 2 files. Choose Archived in Status to see or restore them.');
    expect(screen.queryByRole('checkbox', { name: 'Select invalid.csv' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Select result.csv' })).not.toBeInTheDocument();
    expect(check('clean.csv')).toBeInTheDocument();

    await user.selectOptions(statusFilter(), 'Archived');
    expect(screen.queryByRole('checkbox', { name: 'Select clean.csv' })).not.toBeInTheDocument();
    expect(within(row('invalid.csv')).getByText('Needs Review')).toBeInTheDocument(); // status is kept
    expect(check('invalid.csv')).not.toBeChecked(); // archiving cleared the selection
    expect(actionButton(/^Restore/)).toBeDisabled();
    await user.click(check('invalid.csv'));
    vi.mocked(api.archive).mockResolvedValueOnce([{ ...invalid, archived: false }]);
    vi.mocked(api.list).mockResolvedValue([clean, { ...invalid, archived: false }, archived(result)]);
    await user.click(actionButton(/^Restore \(1\)$/));

    expect(api.archive).toHaveBeenLastCalledWith(['invalid'], false);
    expect(await screen.findByRole('status')).toHaveTextContent('Restored 1 file.');
    expect(screen.queryByRole('checkbox', { name: 'Select invalid.csv' })).not.toBeInTheDocument();
    expect(check('result.csv')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(check('invalid.csv')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Select result.csv' })).not.toBeInTheDocument();
  });

  it('acts only on selected files in view, not on selections hidden by a filter', async () => {
    const user = await setup();
    await user.click(check('clean.csv'));
    await user.click(check('invalid.csv'));
    await user.selectOptions(statusFilter(), 'Needs Review');
    vi.mocked(api.archive).mockResolvedValueOnce([archived(invalid)]);
    await user.click(actionButton(/^Archive \(1\)$/));
    expect(api.archive).toHaveBeenCalledWith(['invalid'], true);
  });

  it('keeps the files and selection and explains a failed archive', async () => {
    const user = await setup();
    await user.click(check('clean.csv'));
    vi.mocked(api.archive).mockRejectedValueOnce(new Error('File not found'));
    await user.click(actionButton(/^Archive/));
    expect(await screen.findByRole('alert')).toHaveTextContent('Archive failed: File not found');
    expect(check('clean.csv')).toBeChecked();
    expect(actionButton(/^Archive \(1\)$/)).toBeEnabled();
  });

  it('archives once on a double click and works from the keyboard', async () => {
    const user = await setup();
    let resolve!: (files: FileMeta[]) => void;
    vi.mocked(api.archive).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    await user.click(check('clean.csv'));
    await user.dblClick(actionButton(/^Archive/));
    expect(actionButton(/^Archive/)).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Run Processing/ })).toBeDisabled();
    await act(async () => resolve([archived(clean)]));
    expect(api.archive).toHaveBeenCalledTimes(1);

    await user.click(check('invalid.csv'));
    vi.mocked(api.archive).mockResolvedValueOnce([archived(invalid)]);
    actionButton(/^Archive/).focus();
    await user.keyboard('{Enter}');
    expect(api.archive).toHaveBeenLastCalledWith(['invalid'], true);
  });

  it('keeps archived files out of processing and the compare pickers', async () => {
    const other: FileMeta = { ...result, id: 'other', name: 'other.csv' };
    vi.mocked(api.list).mockResolvedValue([clean, archived(invalid), result, archived(other)]);
    const user = await setup();
    const fileA = () => screen.getByRole('combobox', { name: /File A/ });
    expect(within(fileA()).getAllByRole('option').map((o) => o.getAttribute('value'))).toEqual(['', 'result']);
    await user.selectOptions(statusFilter(), 'Archived');
    await user.click(screen.getByRole('checkbox', { name: 'Select all files' }));
    expect(check('invalid.csv')).toBeChecked();
    expect(screen.getByRole('button', { name: /^Run Processing/ })).toBeDisabled();
  });

  it('clears a compare choice when that result is archived', async () => {
    const user = await setup();
    await user.selectOptions(screen.getByRole('combobox', { name: /File A/ }), 'result');
    await user.click(check('result.csv'));
    vi.mocked(api.archive).mockResolvedValueOnce([archived(result)]);
    vi.mocked(api.list).mockResolvedValue([clean, invalid, archived(result)]);
    await user.click(actionButton(/^Archive/));
    await screen.findByRole('status');
    expect(screen.getByRole('combobox', { name: /File A/ })).toHaveValue('');
  });
});

describe('upload', () => {
  const fileInput = () => document.querySelector<HTMLInputElement>('input[type="file"]')!;

  it('uploads each chosen file and refreshes the list', async () => {
    const user = await setup();
    vi.mocked(api.upload).mockResolvedValue(clean);
    const added: FileMeta = { ...clean, id: 'added', name: 'added.csv' };
    vi.mocked(api.list).mockResolvedValue([clean, invalid, result, added]);
    await user.upload(fileInput(), [new File(['a'], 'added.csv', { type: 'text/csv' })]);
    expect(api.upload).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('checkbox', { name: 'Select added.csv' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('names each failed file and still uploads the others', async () => {
    const user = await setup();
    vi.mocked(api.upload).mockResolvedValueOnce(clean).mockRejectedValueOnce(new Error('Unrecognized CSV schema'));
    await user.upload(fileInput(), [new File(['a'], 'good.csv'), new File(['b'], 'bad.csv')]);
    expect(api.upload).toHaveBeenCalledTimes(2);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Upload failed');
    expect(alert).toHaveTextContent('bad.csv: Unrecognized CSV schema');
    expect(alert).not.toHaveTextContent('good.csv');
    expect(api.list).toHaveBeenCalledTimes(2); // initial load + refresh after upload
  });
});

describe('preview', () => {
  const page = (offset: number, count: number) => ({
    headers: ['batch_id'], rows: Array.from({ length: count }, (_, i) => ({ batch_id: `A-${offset + i + 1}` })),
    offset, totalRows: 150, generatedColumns: [], problems: { total: 0, items: [] },
  });

  it('loads further pages on request and offers the download', async () => {
    const user = await setup();
    vi.mocked(api.rows).mockResolvedValueOnce(page(0, 100)).mockResolvedValueOnce(page(100, 50));
    await user.click(within(row('clean.csv')).getByRole('button', { name: 'Preview' }));
    const dialog = await screen.findByRole('dialog', { name: 'clean.csv' });
    expect(await within(dialog).findByText('Showing 100 of 150 rows')).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Download CSV' })).toHaveAttribute('href', '/api/files/clean/download');
    await user.click(within(dialog).getByRole('button', { name: 'Show 50 more' }));
    expect(await within(dialog).findByText('Showing 150 of 150 rows')).toBeInTheDocument();
    expect(api.rows).toHaveBeenLastCalledWith('clean', 100, 100);
    expect(within(dialog).getByText('A-150')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /more/ })).not.toBeInTheDocument();
  });

  it('shows the error when rows cannot be loaded', async () => {
    const user = await setup();
    vi.mocked(api.rows).mockRejectedValueOnce(new Error('File not found'));
    await user.click(within(row('clean.csv')).getByRole('button', { name: 'Preview' }));
    expect(await within(await screen.findByRole('dialog')).findByText('File not found')).toBeInTheDocument();
  });
});

describe('comparing results', () => {
  const massA: FileMeta = { ...result, id: 'mass-a', name: 'result_a_mass.csv' };
  const massB: FileMeta = { ...result, id: 'mass-b', name: 'result_b_mass.csv', problemRows: 0 };
  const validation: FileMeta = { ...result, id: 'val-a', name: 'result_a_validation.csv', processor: 'validation' };
  const fileA = () => screen.getByRole('combobox', { name: /File A/ });
  const fileB = () => screen.getByRole('combobox', { name: /File B/ });
  const compareButton = () => screen.getByRole('button', { name: 'Compare Selected' });
  const optionLabels = (select: HTMLElement) => within(select).getAllByRole('option').map((o) => o.textContent);

  beforeEach(() => {
    vi.mocked(api.list).mockResolvedValue([clean, massA, massB, validation]);
    // Recharts' ResponsiveContainer needs ResizeObserver, which jsdom lacks.
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('enables Compare only for two different results from the same function', async () => {
    const user = await setup();
    expect(optionLabels(fileA())).toEqual(['Select result file…', 'a · Mass', 'b · Mass', 'a · Validation']);
    expect(compareButton()).toBeDisabled();
    await user.selectOptions(fileA(), 'mass-a');
    expect(optionLabels(fileB())).toEqual(['Select result file…', 'b · Mass']);
    expect(compareButton()).toBeDisabled();
    await user.selectOptions(fileB(), 'mass-b');
    expect(compareButton()).toBeEnabled();
    await user.selectOptions(fileA(), 'val-a'); // another function clears File B
    expect(fileB()).toHaveValue('');
    expect(compareButton()).toBeDisabled();
  });

  it('opens the comparison with both names, problem cards and the summary', async () => {
    const user = await setup();
    vi.mocked(api.compare).mockResolvedValue({
      processor: 'mass', fileA: massA.name, fileB: massB.name,
      columns: [{ name: 'r32_mass_kg', kind: 'numeric', unit: 'kg', measure: 'total',
        data: [{ label: '#1', a: 1, b: 2 }], valueA: 10, valueB: 12.5, rowsDiffering: 3, rowsCompared: 25 }],
      problemsA: { total: 1, items: [{ row: 8, batchId: 'A-008', message: 'mass missing' }] },
      problemsB: { total: 0, items: [] },
    });
    await user.selectOptions(fileA(), 'mass-a');
    await user.selectOptions(fileB(), 'mass-b');
    await user.click(compareButton());
    expect(api.compare).toHaveBeenCalledWith('mass-a', 'mass-b');
    const dialog = await screen.findByRole('dialog', { name: `${massA.name} vs ${massB.name}` });
    expect(within(dialog).getByRole('region', { name: `Problems in A · ${massA.name}` })).toHaveTextContent('Row 8 · A-008: mass missing');
    expect(within(dialog).getByRole('region', { name: `Problems in B · ${massB.name}` })).toHaveTextContent('No problems');
    const summary = within(dialog).getAllByRole('row').find((r) => r.textContent?.startsWith('r32_mass_kg'))!;
    expect(summary).toHaveTextContent('Total across rows (kg)');
    expect(summary).toHaveTextContent('2.5'); // B − A
    expect(summary).toHaveTextContent('3 / 25');
  });

  it('explains a failed comparison', async () => {
    const user = await setup();
    vi.mocked(api.compare).mockRejectedValue(new Error("These files can't be compared"));
    await user.selectOptions(fileA(), 'mass-a');
    await user.selectOptions(fileB(), 'mass-b');
    await user.click(compareButton());
    expect(await screen.findByRole('alert')).toHaveTextContent("Comparison failed: These files can't be compared");
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
