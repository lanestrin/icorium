import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompareResult, FileMeta, FileRows } from '../../shared/types';
import App from './App';
import { Modal, PreviewModal } from './components/Modals';
import { api } from './api';

vi.mock('./api', () => ({ api: {
  list: vi.fn(), process: vi.fn(), rows: vi.fn(), upload: vi.fn(), compare: vi.fn(), archive: vi.fn(), generate: vi.fn(),
  downloadUrl: (id: string) => `/api/files/${id}/download`,
} }));

const base = { rows: 25, columns: 7, uploadedAt: '2026-11-06T12:00:00Z' };
const clean: FileMeta = { ...base, id: 'clean', name: 'clean.csv', status: 'Ready', problemRows: 0 };
const invalid: FileMeta = { ...base, id: 'invalid', name: 'invalid.csv', status: 'Needs Review', problemRows: 2 };
const result: FileMeta = { ...base, id: 'result', name: 'result.csv', status: 'Processed', problemRows: 2, processor: 'mass' };
const row = (name: string) => screen.getByRole('row', { name: new RegExp(name) });
const statusFilter = () => screen.getByRole('combobox', { name: /Status/ });
/** Row controls are labelled with the File ID, then the filename: "Select 101010 data.csv". */
const withId = (prefix: string, name: string) => new RegExp(`^${prefix} \\S+ ${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
const check = (name: string) => screen.getByRole('checkbox', { name: withId('Select', name) });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.list).mockResolvedValue([clean, invalid, result]);
  vi.mocked(api.rows).mockResolvedValue({ headers: ['batch_id'], rows: [], offset: 0, totalRows: 0, generatedColumns: [], problems: { total: 0, items: [] } });
});

async function setup() {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole('checkbox', { name: 'Select clean clean.csv' });
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
    expect(screen.getByRole('list', { name: 'Selected input files' })).toHaveTextContent('clean · clean.csvinvalid · invalid.csv');
    expect(screen.getByRole('checkbox', { name: 'Select all files' })).toBePartiallyChecked();
    await user.click(screen.getByRole('checkbox', { name: 'Select all files' }));
    expect(check('clean.csv')).toBeChecked();
    expect(check('invalid.csv')).toBeChecked();
    expect(check('result.csv')).toBeChecked();
    // A selected result is not processed: the count and list name only the inputs.
    expect(screen.getByRole('button', { name: 'Run Processing (2)' })).toBeEnabled();
    expect(screen.getByRole('list', { name: 'Selected input files' })).toHaveTextContent('clean · clean.csvinvalid · invalid.csv');
    await user.click(screen.getByRole('checkbox', { name: 'Select all files' }));
    for (const name of ['clean.csv', 'invalid.csv', 'result.csv']) expect(check(name)).not.toBeChecked();
    await user.click(row('result.csv'));
    expect(check('result.csv')).toBeChecked();
    expect(screen.getByRole('button', { name: 'Run Processing' })).toBeDisabled();
  });

  it('shows which processing function made each file, in both tabs', async () => {
    const classified: FileMeta = { ...result, id: 'cls', name: 'classified.csv', processor: 'classification', archived: true, archivedAt: '2026-11-08T10:00:00Z' };
    vi.mocked(api.list).mockResolvedValue([clean, invalid, result, classified]);
    const user = await setup();
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers.indexOf('Processing function')).toBe(headers.indexOf('Status') - 1);
    expect(row('clean.csv')).toHaveTextContent('OriginalReady');
    expect(row('invalid.csv')).toHaveTextContent('OriginalNeeds Review');
    expect(row('result.csv')).toHaveTextContent('Mass CalculationProcessed');
    await user.click(screen.getByRole('tab', { name: /Archived/ }));
    expect(screen.getByRole('columnheader', { name: 'Processing function' })).toBeInTheDocument();
    expect(row('classified.csv')).toHaveTextContent('ClassificationProcessed');
  });

  it('filters by processing function, together with the other filters and in both tabs', async () => {
    const classified: FileMeta = { ...result, id: 'cls', name: 'classified.csv', processor: 'classification', archived: true, archivedAt: '2026-11-08T10:00:00Z' };
    vi.mocked(api.list).mockResolvedValue([clean, invalid, result, classified]);
    const user = await setup();
    const fnFilter = screen.getByRole('combobox', { name: 'Processing Function' });
    expect(within(screen.getByRole('search', { name: 'Filter files' })).getByRole('combobox', { name: 'Processing Function' })).toBe(fnFilter);
    expect(within(fnFilter).getAllByRole('option').map((o) => o.textContent))
      .toEqual(['All functions', 'Original', 'Validation', 'Mass Calculation', 'Classification']);
    const shown = () => screen.queryAllByRole('checkbox', { name: /^Select (?!all)/ }).map((c) => c.getAttribute('aria-label'));

    await user.selectOptions(fnFilter, 'Original');
    expect(shown()).toEqual(['Select clean clean.csv', 'Select invalid invalid.csv']);
    await user.selectOptions(fnFilter, 'Mass Calculation');
    expect(shown()).toEqual(['Select result result.csv']);
    await user.selectOptions(fnFilter, 'Validation');
    expect(screen.getByText('No CSV files match your filters.')).toBeInTheDocument();

    await user.selectOptions(fnFilter, 'Original');
    await user.selectOptions(statusFilter(), 'Needs Review');
    expect(shown()).toEqual(['Select invalid invalid.csv']);
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(fnFilter).toHaveValue('All');
    expect(shown()).toEqual(['Select clean clean.csv', 'Select invalid invalid.csv', 'Select result result.csv']);

    await user.selectOptions(fnFilter, 'Classification');
    await user.click(screen.getByRole('tab', { name: /Archived/ }));
    expect(shown()).toEqual(['Select cls classified.csv']);
    await user.selectOptions(fnFilter, 'Original');
    expect(shown()).toEqual([]);
  });

  it('groups the filters in one card, and only enables Clear filters once a filter is set', async () => {
    const user = await setup();
    const card = screen.getByRole('search', { name: 'Filter files' });
    expect(within(card).getByRole('textbox', { name: 'Search file ID or name' })).toHaveAttribute('placeholder', 'Search file ID or name...');
    expect(within(card).getByRole('group', { name: 'Date Range' })).toContainElement(screen.getByLabelText('From date'));
    expect(within(card).getByRole('combobox', { name: 'Processing Function' })).toHaveDisplayValue('All functions');
    expect(within(card).getByRole('combobox', { name: 'Status' })).toHaveDisplayValue('All statuses');
    // The filter and Sort by dropdowns opt into the styled open list (index.css, Chrome and Edge).
    for (const name of ['Processing Function', 'Status', 'Sort by']) expect(screen.getByRole('combobox', { name })).toHaveClass('menu-select');
    const clear = within(card).getByRole('button', { name: 'Clear filters' });
    expect(clear).toBeDisabled();
    await user.type(within(card).getByRole('textbox', { name: 'Search file ID or name' }), 'x');
    expect(clear).toBeEnabled();
    await user.click(clear);
    expect(within(card).getByRole('textbox', { name: 'Search file ID or name' })).toHaveValue('');
    expect(clear).toBeDisabled();
  });

  it('sorts each tab on its own, newest uploads and latest archives first', async () => {
    const older: FileMeta = { ...clean, id: 'older', name: 'b_older.csv', uploadedAt: '2026-11-01T09:00:00Z' };
    const newer: FileMeta = { ...invalid, id: 'newer', name: 'C_newer.csv', uploadedAt: '2026-11-07T09:00:00Z' };
    const middle: FileMeta = { ...result, id: 'middle', name: 'a_middle.csv', uploadedAt: '2026-11-04T09:00:00Z' };
    const archivedEarly: FileMeta = { ...clean, id: 'ae', name: 'z_early.csv', archived: true, archivedAt: '2026-11-02T09:00:00Z' };
    const archivedLate: FileMeta = { ...clean, id: 'al', name: 'y_late.csv', archived: true, archivedAt: '2026-11-08T09:00:00Z' };
    vi.mocked(api.list).mockResolvedValue([older, newer, middle, archivedEarly, archivedLate]);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('checkbox', { name: 'Select older b_older.csv' });
    const order = () => screen.getAllByRole('checkbox', { name: /^Select (?!all)/ }).map((c) => c.getAttribute('aria-label')!.replace(/^Select \S+ /, ''));
    const sortBy = () => screen.getByRole('combobox', { name: 'Sort by' });

    expect(sortBy()).toHaveDisplayValue('Uploaded (newest)');
    expect(within(sortBy()).getAllByRole('option').map((o) => o.textContent)).toEqual(['Uploaded (newest)', 'Uploaded (oldest)', 'Name (A–Z)', 'Name (Z–A)', 'File ID (low–high)', 'File ID (high–low)']);
    expect(order()).toEqual(['C_newer.csv', 'a_middle.csv', 'b_older.csv']);
    expect(screen.getByRole('columnheader', { name: 'Uploaded' })).toHaveAttribute('aria-sort', 'descending');
    await user.selectOptions(sortBy(), 'Uploaded (oldest)');
    expect(order()).toEqual(['b_older.csv', 'a_middle.csv', 'C_newer.csv']);
    expect(screen.getByRole('columnheader', { name: 'Uploaded' })).toHaveAttribute('aria-sort', 'ascending');
    await user.selectOptions(sortBy(), 'Name (A–Z)');
    expect(order()).toEqual(['a_middle.csv', 'b_older.csv', 'C_newer.csv']); // ignores case
    expect(screen.getByRole('columnheader', { name: 'File Name' })).toHaveAttribute('aria-sort', 'ascending');
    expect(screen.getByRole('columnheader', { name: 'Uploaded' })).not.toHaveAttribute('aria-sort');
    await user.selectOptions(sortBy(), 'Name (Z–A)');
    expect(order()).toEqual(['C_newer.csv', 'b_older.csv', 'a_middle.csv']);

    await user.click(screen.getByRole('tab', { name: /Archived/ }));
    expect(sortBy()).toHaveDisplayValue('Archived (newest)');
    expect(within(sortBy()).getAllByRole('option')[0]).toHaveTextContent('Archived (newest)');
    expect(order()).toEqual(['y_late.csv', 'z_early.csv']);
    await user.selectOptions(sortBy(), 'Name (Z–A)');
    expect(order()).toEqual(['z_early.csv', 'y_late.csv']);
    await user.click(screen.getByRole('tab', { name: /Active Files/ }));
    expect(sortBy()).toHaveDisplayValue('Name (Z–A)'); // each tab keeps its own choice
    expect(order()).toEqual(['C_newer.csv', 'b_older.csv', 'a_middle.csv']);
  });

  it('filters Needs Review and toggles only visible inputs while retaining hidden selections', async () => {
    const user = await setup();
    await user.click(check('clean.csv'));
    expect(screen.getByRole('checkbox', { name: 'Select all files' })).toBePartiallyChecked();
    await user.selectOptions(statusFilter(), 'Needs Review');
    expect(screen.queryByRole('checkbox', { name: 'Select clean clean.csv' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Select result result.csv' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Select all files' }));
    expect(screen.getByRole('list', { name: 'Selected input files' })).toHaveTextContent('clean · clean.csvinvalid · invalid.csv');
    await user.click(screen.getByRole('checkbox', { name: 'Select all files' }));
    await user.selectOptions(statusFilter(), 'All');
    expect(check('clean.csv')).toBeChecked();
    expect(check('invalid.csv')).not.toBeChecked();
  });

  it('combines status, search and date filters, then clears them', async () => {
    const user = await setup();
    await user.selectOptions(statusFilter(), 'Ready');
    expect(check('clean.csv')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Select invalid invalid.csv' })).not.toBeInTheDocument();
    await user.selectOptions(statusFilter(), 'Processed');
    expect(check('result.csv')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Select clean clean.csv' })).not.toBeInTheDocument();
    await user.selectOptions(statusFilter(), 'Needs Review');
    await user.type(screen.getByRole('textbox', { name: 'Search file ID or name' }), 'clean');
    expect(screen.getByText('No CSV files match your filters.')).toBeInTheDocument();
    await user.clear(screen.getByRole('textbox', { name: 'Search file ID or name' }));
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
    expect(screen.queryByRole('checkbox', { name: 'Select clean clean.csv' })).not.toBeInTheDocument();
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

describe('replacing an existing result', () => {
  const runButton = (n?: number) => screen.getByRole('button', { name: n ? `Run Processing (${n})` : 'Run Processing' });
  const dialog = () => screen.getByRole('dialog', { name: 'Replace existing result?' });
  const replaceButton = () => within(dialog()).getByRole('button', { name: 'Run & Replace' });
  const cleanV: FileMeta = { ...base, id: 'clean-V', name: 'result_clean_validation.csv', status: 'Processed', processor: 'validation', sourceId: 'clean' };
  const invalidM: FileMeta = { ...base, id: 'invalid-M', name: 'result_invalid_mass.csv', status: 'Processed', processor: 'mass', sourceId: 'invalid', archived: true };
  const conflictError = (existing: FileMeta) => Object.assign(new Error(`Already run. Confirm to replace the existing result ${existing.id}.`),
    { conflict: { message: `Already run. Confirm to replace the existing result ${existing.id}.`, existing: { id: existing.id, name: existing.name, archived: existing.archived } } });

  async function rerun(files: FileMeta[], select: string[], fn: RegExp) {
    vi.mocked(api.list).mockResolvedValue(files);
    const user = await setup();
    for (const name of select) await user.click(check(name));
    await user.click(screen.getByRole('radio', { name: fn }));
    await user.click(runButton(select.length > 1 ? select.length : undefined));
    return user;
  }

  it('asks before a single re-run, naming the input and the result it replaces, and sends nothing', async () => {
    await rerun([clean, invalid, cleanV], ['clean.csv'], /Composition Validation/);
    expect(dialog()).toHaveTextContent('Composition Validation has already been run for file clean. Running it again will replace the existing result clean-V. This action cannot be undone.');
    expect(within(dialog()).getByText('clean-V').tagName).toBe('STRONG');
    expect(dialog()).not.toHaveTextContent('Archived');
    expect(dialog()).toHaveFocus();
    expect(screen.queryByRole('dialog', { name: 'Data Quality Warning' })).not.toBeInTheDocument();
    expect(api.process).not.toHaveBeenCalled();
  });

  it('Run & Replace sends replace: true once, even on a double click', async () => {
    vi.mocked(api.process).mockResolvedValue(cleanV);
    const user = await rerun([clean, invalid, cleanV], ['clean.csv'], /Composition Validation/);
    await user.dblClick(replaceButton());
    await screen.findByRole('dialog', { name: /result_clean_validation/ });
    expect(api.process).toHaveBeenCalledTimes(1);
    expect(api.process).toHaveBeenCalledWith('clean', 'validation', true);
  });

  it('lists only the files with a result in a mixed batch and replaces only those', async () => {
    const other: FileMeta = { ...clean, id: 'other', name: 'other.csv' };
    vi.mocked(api.process).mockResolvedValue(cleanV);
    const user = await rerun([clean, other, cleanV], ['clean.csv', 'other.csv'], /Composition Validation/);
    expect(dialog()).toHaveTextContent('clean-V');
    expect(dialog()).not.toHaveTextContent('other-V');
    expect(dialog()).toHaveTextContent('1 other selected file will be processed normally.');
    await user.click(replaceButton());
    await waitFor(() => expect(api.process).toHaveBeenCalledTimes(2));
    expect(api.process).toHaveBeenNthCalledWith(1, 'clean', 'validation', true);
    expect(api.process).toHaveBeenNthCalledWith(2, 'other', 'validation');
  });

  it('lists every result for several re-runs and notes an archived one', async () => {
    const cleanM: FileMeta = { ...cleanV, id: 'clean-M', name: 'result_clean_mass.csv', processor: 'mass' };
    await rerun([clean, invalid, cleanM, invalidM], ['clean.csv', 'invalid.csv'], /Component Mass Calculation/);
    expect(dialog()).toHaveTextContent('Component Mass Calculation has already been run for 2 selected files. Running it again will replace these existing results. This action cannot be undone.');
    const items = within(within(dialog()).getByRole('list', { name: 'Results to replace' })).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([
      'clean-Mresult_clean_mass.csv',
      'invalid-Mresult_invalid_mass.csvArchived: replacing it returns it to Active Files.',
    ]);
  });

  it('shows the data quality warning inside the same dialog, so one confirmation runs everything', async () => {
    vi.mocked(api.process).mockResolvedValue(invalidM);
    const user = await rerun([clean, invalid, invalidM], ['invalid.csv'], /Component Mass Calculation/);
    expect(dialog()).toHaveTextContent('Running it again will replace the existing result invalid-M.');
    expect(dialog()).toHaveTextContent('Archived: replacing it returns it to Active Files.');
    expect(within(dialog()).getByRole('list', { name: 'Files with invalid rows' })).toHaveTextContent('invalid.csv23 valid rows · 2 invalid rows');
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    await user.click(replaceButton());
    await waitFor(() => expect(api.process).toHaveBeenCalledWith('invalid', 'mass', true));
    expect(screen.queryByRole('dialog', { name: 'Data Quality Warning' })).not.toBeInTheDocument();
  });

  it.each([
    ['Cancel', (user: ReturnType<typeof userEvent.setup>) => user.click(within(dialog()).getByRole('button', { name: 'Cancel' }))],
    ['Escape', (user: ReturnType<typeof userEvent.setup>) => user.keyboard('{Escape}')],
    ['the close button', (user: ReturnType<typeof userEvent.setup>) => user.click(within(dialog()).getByRole('button', { name: 'Close' }))],
  ])('%s sends nothing, keeps the selection and returns focus to Run Processing', async (_, cancel) => {
    const user = await rerun([clean, invalid, cleanV], ['clean.csv'], /Composition Validation/);
    await cancel(user);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.process).not.toHaveBeenCalled();
    expect(check('clean.csv')).toBeChecked();
    expect(runButton()).toHaveFocus();
  });

  it('keeps Tab inside the dialog', async () => {
    const user = await rerun([clean, invalid, cleanV], ['clean.csv'], /Composition Validation/);
    const buttons = within(dialog()).getAllByRole('button');
    buttons[buttons.length - 1].focus();
    await user.tab();
    expect(buttons[0]).toHaveFocus();
    await user.tab({ shift: true });
    expect(buttons[buttons.length - 1]).toHaveFocus();
  });

  it('asks about a result the stale list did not show, instead of reporting an error, then replaces it once', async () => {
    const other: FileMeta = { ...clean, id: 'other', name: 'other.csv' };
    const otherV: FileMeta = { ...cleanV, id: 'other-V', name: 'result_other_validation.csv', sourceId: 'other' };
    vi.mocked(api.process)
      .mockRejectedValueOnce(conflictError(cleanV)) // clean already has a result the list did not show
      .mockResolvedValueOnce(otherV)
      .mockResolvedValueOnce(cleanV);
    const user = await rerun([clean, other], ['clean.csv', 'other.csv'], /Composition Validation/);
    await screen.findByRole('dialog', { name: 'Replace existing result?' });
    expect(dialog()).toHaveTextContent('Composition Validation has already been run for file clean. Running it again will replace the existing result clean-V.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Processed 1 file.');
    expect(check('clean.csv')).toBeChecked();
    expect(api.process).toHaveBeenNthCalledWith(1, 'clean', 'validation');
    await user.dblClick(replaceButton());
    await waitFor(() => expect(api.process).toHaveBeenCalledTimes(3));
    expect(api.process).toHaveBeenNthCalledWith(3, 'clean', 'validation', true);
  });
});

describe('archive and restore', () => {
  const archived = (f: FileMeta, archivedAt = '2026-11-08T10:00:00Z'): FileMeta => ({ ...f, archived: true, archivedAt });
  const tab = (name: RegExp) => screen.getByRole('tab', { name });
  const bar = () => screen.getByRole('toolbar', { name: 'Selected files' });
  const barButton = (name: RegExp) => within(bar()).getByRole('button', { name });
  const toast = () => screen.getByRole('status');
  const openMenu = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
    await user.click(screen.getByRole('button', { name: withId('Actions for', name) }));
    return screen.getByRole('menu', { name: withId('Actions for', name) });
  };

  it('shows Active Files and Archived tabs with counts, and a selection bar only while rows are selected', async () => {
    vi.mocked(api.list).mockResolvedValue([clean, invalid, archived(result)]);
    const user = await setup();
    expect(tab(/Active Files/)).toHaveAttribute('aria-selected', 'true');
    expect(tab(/Active Files/)).toHaveTextContent('Active Files2');
    expect(tab(/Archived/)).toHaveTextContent('Archived1');
    expect(screen.queryByRole('toolbar', { name: 'Selected files' })).not.toBeInTheDocument();
    expect(within(statusFilter()).queryByRole('option', { name: 'Archived' })).not.toBeInTheDocument();
    await user.click(check('clean.csv'));
    await user.click(check('invalid.csv'));
    expect(bar()).toHaveTextContent('2 selected');
    expect(barButton(/^Archive 2 files$/)).toBeEnabled();
    await user.click(barButton(/Clear selection/));
    expect(check('clean.csv')).not.toBeChecked();
    expect(screen.queryByRole('toolbar', { name: 'Selected files' })).not.toBeInTheDocument();
  });

  it('archives the selected files, confirms in a toast and lists them in the Archived tab', async () => {
    const user = await setup();
    await user.click(check('invalid.csv'));
    await user.click(check('result.csv'));
    vi.mocked(api.archive).mockResolvedValueOnce([archived(invalid), archived(result)]);
    vi.mocked(api.list).mockResolvedValue([clean, archived(invalid, '2026-11-08T09:00:00Z'), archived(result, '2026-11-08T11:00:00Z')]);
    await user.click(barButton(/^Archive 2 files$/));

    expect(api.archive).toHaveBeenCalledWith(['invalid', 'result'], true);
    expect(await screen.findByRole('status')).toHaveTextContent('2 files archived');
    expect(toast()).toHaveTextContent('Moved out of Active Files.');
    expect(screen.queryByRole('checkbox', { name: 'Select invalid invalid.csv' })).not.toBeInTheDocument();
    expect(tab(/Archived/)).toHaveTextContent('Archived2');

    await user.click(tab(/Archived/));
    expect(screen.getByText('Archived files are excluded from processing and comparison.')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Archived On/ })).toHaveAttribute('aria-sort', 'descending');
    expect(screen.getByRole('columnheader', { name: 'Original Upload' })).toBeInTheDocument();
    // Most recently archived first, with the archive time and the original upload time.
    const names = screen.getAllByRole('checkbox', { name: /^Select (?!all)/ }).map((c) => c.getAttribute('aria-label'));
    expect(names).toEqual(['Select result result.csv', 'Select invalid invalid.csv']);
    expect(row('result.csv')).toHaveTextContent(/Nov 8, 2026.*Nov 6, 2026/);
    expect(within(row('invalid.csv')).getByText('Needs Review')).toBeInTheDocument(); // status is kept
    expect(check('invalid.csv')).not.toBeChecked(); // archiving cleared the selection
  });

  it('undoes an archive from the toast', async () => {
    const user = await setup();
    await user.click(check('clean.csv'));
    vi.mocked(api.archive).mockResolvedValueOnce([archived(clean)]);
    await user.click(barButton(/^Archive 1 file$/));
    await screen.findByRole('status');
    vi.mocked(api.archive).mockResolvedValueOnce([clean]);
    await user.click(within(toast()).getByRole('button', { name: 'Undo' }));
    expect(api.archive).toHaveBeenLastCalledWith(['clean'], false);
    await waitFor(() => expect(toast()).toHaveTextContent('1 file restored'));
    expect(within(toast()).queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument(); // an undo cannot be undone
    await user.click(within(toast()).getByRole('button', { name: 'Dismiss notification' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('hides the toast on its own after a few seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<App />);
      await screen.findByRole('checkbox', { name: 'Select clean clean.csv' });
      await user.click(check('clean.csv'));
      vi.mocked(api.archive).mockResolvedValueOnce([archived(clean)]);
      await user.click(barButton(/^Archive 1 file$/));
      await screen.findByRole('status');
      await act(async () => { vi.advanceTimersByTime(8000); });
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('restores one file from its row menu, and previews from it', async () => {
    vi.mocked(api.list).mockResolvedValue([clean, archived(invalid), archived(result)]);
    const user = await setup();
    await user.click(tab(/Archived/));
    let menu = await openMenu(user, 'invalid.csv');
    expect(within(menu).getByRole('menuitem', { name: 'Download file' })).toHaveAttribute('href', '/api/files/invalid/download');
    await user.click(within(menu).getByRole('menuitem', { name: 'Preview file' }));
    expect(await screen.findByRole('dialog', { name: 'invalid.csv' })).toBeInTheDocument();
    await user.keyboard('{Escape}');

    vi.mocked(api.archive).mockResolvedValueOnce([invalid]);
    vi.mocked(api.list).mockResolvedValue([clean, { ...invalid, archived: false }, archived(result)]);
    menu = await openMenu(user, 'invalid.csv');
    await user.click(within(menu).getByRole('menuitem', { name: 'Restore file' }));
    expect(api.archive).toHaveBeenCalledWith(['invalid'], false);
    expect(await screen.findByRole('status')).toHaveTextContent('1 file restored');
    expect(toast()).toHaveTextContent('Back in Active Files.');
    expect(screen.queryByRole('checkbox', { name: 'Select invalid invalid.csv' })).not.toBeInTheDocument();
    await user.click(tab(/Active Files/));
    expect(check('invalid.csv')).toBeInTheDocument();
  });

  it('operates the row menu from the keyboard and closes it with Escape or a click outside', async () => {
    vi.mocked(api.list).mockResolvedValue([clean, archived(invalid)]);
    const user = await setup();
    await user.click(tab(/Archived/));
    const trigger = screen.getByRole('button', { name: 'Actions for invalid invalid.csv' });
    trigger.focus();
    await user.keyboard('{Enter}');
    const menu = screen.getByRole('menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(within(menu).getByRole('menuitem', { name: 'Preview file' })).toHaveFocus();
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(within(menu).getByRole('menuitem', { name: 'Restore file' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(within(menu).getByRole('menuitem', { name: 'Preview file' })).toHaveFocus(); // wraps around
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(check('invalid.csv')).not.toBeChecked(); // menu clicks never toggle the row

    await user.click(trigger);
    await user.click(screen.getByRole('heading', { name: 'CSV Files' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(api.archive).not.toHaveBeenCalled();
  });

  it('restores several files from the selection bar', async () => {
    vi.mocked(api.list).mockResolvedValue([clean, archived(invalid), archived(result)]);
    const user = await setup();
    await user.click(tab(/Archived/));
    await user.click(screen.getByRole('checkbox', { name: 'Select all files' }));
    vi.mocked(api.archive).mockResolvedValueOnce([invalid, result]);
    await user.click(barButton(/^Restore 2 files$/));
    expect(api.archive).toHaveBeenCalledWith(expect.arrayContaining(['invalid', 'result']), false);
  });

  it('explains an empty Archived tab', async () => {
    const user = await setup();
    await user.click(tab(/Archived/));
    expect(screen.getByText('No archived files. Select files in Active Files and click Archive to move them here.')).toBeInTheDocument();
  });

  it('switches tabs with the arrow keys', async () => {
    const user = await setup();
    tab(/Active Files/).focus();
    await user.keyboard('{ArrowRight}');
    expect(tab(/Archived/)).toHaveFocus();
    expect(tab(/Archived/)).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowLeft}');
    expect(tab(/Active Files/)).toHaveFocus();
    expect(check('clean.csv')).toBeInTheDocument();
  });

  it('acts only on selected files in view, not on selections hidden by a filter', async () => {
    const user = await setup();
    await user.click(check('clean.csv'));
    await user.click(check('invalid.csv'));
    await user.selectOptions(statusFilter(), 'Needs Review');
    expect(bar()).toHaveTextContent('1 selected');
    vi.mocked(api.archive).mockResolvedValueOnce([archived(invalid)]);
    await user.click(barButton(/^Archive 1 file$/));
    expect(api.archive).toHaveBeenCalledWith(['invalid'], true);
  });

  it('keeps the files and selection and explains a failed archive', async () => {
    const user = await setup();
    await user.click(check('clean.csv'));
    vi.mocked(api.archive).mockRejectedValueOnce(new Error('File not found'));
    await user.click(barButton(/^Archive/));
    expect(await screen.findByRole('alert')).toHaveTextContent('Archive failed: File not found');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(check('clean.csv')).toBeChecked();
    expect(barButton(/^Archive 1 file$/)).toBeEnabled();
  });

  it('explains a failed restore and keeps the file archived', async () => {
    vi.mocked(api.list).mockResolvedValue([clean, archived(invalid)]);
    const user = await setup();
    await user.click(tab(/Archived/));
    vi.mocked(api.archive).mockRejectedValueOnce(new Error('File changed'));
    await user.click(within(await openMenu(user, 'invalid.csv')).getByRole('menuitem', { name: 'Restore file' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Restore failed: File changed');
    expect(check('invalid.csv')).toBeInTheDocument();
  });

  it('archives once on a double click and works from the keyboard', async () => {
    const user = await setup();
    let resolve!: (files: FileMeta[]) => void;
    vi.mocked(api.archive).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    await user.click(check('clean.csv'));
    await user.dblClick(barButton(/^Archive/));
    expect(barButton(/^Archive/)).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Run Processing/ })).toBeDisabled();
    await act(async () => resolve([archived(clean)]));
    expect(api.archive).toHaveBeenCalledTimes(1);

    await user.click(check('invalid.csv'));
    vi.mocked(api.archive).mockResolvedValueOnce([archived(invalid)]);
    barButton(/^Archive/).focus();
    await user.keyboard('{Enter}');
    expect(api.archive).toHaveBeenLastCalledWith(['invalid'], true);
  });

  it('keeps archived files out of processing and comparison', async () => {
    const other: FileMeta = { ...result, id: 'other', name: 'other.csv' };
    vi.mocked(api.list).mockResolvedValue([clean, archived(invalid), archived(result), archived(other)]);
    const user = await setup();
    await user.click(tab(/Archived/));
    await user.click(screen.getByRole('checkbox', { name: 'Select all files' }));
    expect(check('invalid.csv')).toBeChecked();
    expect(screen.getByRole('button', { name: /^Run Processing/ })).toBeDisabled();
    // Two archived results are selected, but the Archived tab offers no Compare.
    expect(within(bar()).queryByRole('button', { name: /^Compare/ })).not.toBeInTheDocument();
    expect(barButton(/^Restore 3 files$/)).toBeEnabled();
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
    expect(await screen.findByRole('checkbox', { name: 'Select added added.csv' })).toBeInTheDocument();
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

describe('file IDs', () => {
  // Two inputs share a filename; only their File IDs tell them apart.
  const input: FileMeta = { ...base, id: '101010', name: 'data.csv', status: 'Ready', problemRows: 0, uploadedAt: '2026-11-06T12:00:00Z' };
  const twin: FileMeta = { ...input, id: '101011', uploadedAt: '2026-11-07T12:00:00Z' };
  const inputV: FileMeta = { ...base, id: '101010-V', name: 'result_data_validation.csv', status: 'Processed', processor: 'validation', sourceId: '101010', uploadedAt: '2026-11-08T12:00:00Z' };
  const inputM: FileMeta = { ...inputV, id: '101010-M', name: 'result_data_mass.csv', processor: 'mass', uploadedAt: '2026-11-05T12:00:00Z' };
  const imported: FileMeta = { ...base, id: '101012-C', name: 'my_copy.csv', status: 'Processed', processor: 'classification', imported: true, uploadedAt: '2026-11-09T12:00:00Z' };
  const archived: FileMeta = { ...input, id: '101013', name: 'old.csv', archived: true, archivedAt: '2026-11-09T12:00:00Z' };
  const ids = () => screen.getAllByRole('checkbox', { name: /^Select (?!all)/ }).map((c) => c.getAttribute('aria-label')!.split(' ')[1]);
  const search = () => screen.getByRole('textbox', { name: 'Search file ID or name' });

  async function open() {
    vi.mocked(api.list).mockResolvedValue([input, twin, inputV, inputM, imported, archived]);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('checkbox', { name: 'Select 101010 data.csv' });
    return user;
  }

  it('shows File ID and File Name as separate columns in both tabs, and marks imported results', async () => {
    const user = await open();
    expect(screen.getByRole('columnheader', { name: 'File ID' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'File Name' })).toBeInTheDocument();
    const cells = within(screen.getByRole('row', { name: /101010-V/ })).getAllByRole('cell');
    expect(cells[1]).toHaveTextContent(/^101010-V$/);
    expect(cells[2]).toHaveTextContent(/^result_data_validation\.csv$/);
    const marker = within(screen.getByRole('row', { name: /101012-C/ })).getByText('Imported');
    expect(marker).toHaveAttribute('title', 'Uploaded result file. Its original input is not linked in this workspace.');
    expect(screen.getAllByText('Imported')).toHaveLength(1); // only the imported result
    await user.click(screen.getByRole('tab', { name: /Archived/ }));
    expect(screen.getByRole('columnheader', { name: 'File ID' })).toBeInTheDocument();
    expect(within(screen.getByRole('row', { name: /old\.csv/ })).getAllByRole('cell')[1]).toHaveTextContent(/^101013$/);
    expect(screen.getByRole('button', { name: 'Actions for 101013 old.csv' })).toBeInTheDocument();
  });

  it('tells files with the same name apart by ID, in the list and the processing panel', async () => {
    const user = await open();
    expect(screen.getByRole('link', { name: 'Download 101010 data.csv' })).toHaveAttribute('href', '/api/files/101010/download');
    expect(screen.getByRole('link', { name: 'Download 101011 data.csv' })).toHaveAttribute('href', '/api/files/101011/download');
    await user.click(screen.getByRole('checkbox', { name: 'Select 101011 data.csv' }));
    expect(screen.getByRole('checkbox', { name: 'Select 101010 data.csv' })).not.toBeChecked();
    expect(screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === 'Input: 101011 · data.csv')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Select 101010 data.csv' }));
    const listed = within(screen.getByRole('list', { name: 'Selected input files' })).getAllByRole('listitem');
    expect(listed.map((li) => li.textContent)).toEqual(['101010 · data.csv', '101011 · data.csv']);
  });

  it('searches by File ID or filename, and Clear filters resets the search', async () => {
    const user = await open();
    await user.type(search(), '101010');
    expect(ids().sort()).toEqual(['101010', '101010-M', '101010-V']); // the input and its results
    await user.clear(search());
    await user.type(search(), '101012-c'); // case does not matter
    expect(ids()).toEqual(['101012-C']);
    await user.clear(search());
    await user.type(search(), 'COPY');
    expect(ids()).toEqual(['101012-C']);
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(search()).toHaveValue('');
    expect(ids()).toHaveLength(5);
  });

  it('sorts by File ID, keeping each original with its results', async () => {
    const user = await open();
    const sortBy = screen.getByRole('combobox', { name: 'Sort by' });
    await user.selectOptions(sortBy, 'File ID (low–high)');
    expect(ids()).toEqual(['101010', '101010-V', '101010-M', '101011', '101012-C']);
    expect(screen.getByRole('columnheader', { name: 'File ID' })).toHaveAttribute('aria-sort', 'ascending');
    expect(screen.getByRole('columnheader', { name: 'Uploaded' })).not.toHaveAttribute('aria-sort');
    await user.selectOptions(sortBy, 'File ID (high–low)');
    expect(ids()).toEqual(['101012-C', '101011', '101010', '101010-V', '101010-M']);
    expect(screen.getByRole('columnheader', { name: 'File ID' })).toHaveAttribute('aria-sort', 'descending');
  });

  it('says whether an imported result is linked to its original, in the marker and the preview', async () => {
    const linked: FileMeta = { ...imported, id: '101014-V', name: 'linked_copy.csv', processor: 'validation', sourceId: '101010', importedFrom: '101010' };
    const claimed: FileMeta = { ...imported, id: '101015-V', name: 'edited_copy.csv', processor: 'validation', importedFrom: '101011' };
    vi.mocked(api.list).mockResolvedValue([input, twin, linked, claimed, imported]);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('checkbox', { name: 'Select 101010 data.csv' });
    const marker = (id: string) => within(screen.getByRole('row', { name: new RegExp(id) })).getByText('Imported');
    expect(marker('101014-V')).toHaveAttribute('title', 'Uploaded result file, linked to original input 101010.');
    expect(marker('101015-V')).toHaveAttribute('title',
      'Uploaded result file. It names 101011 as its source, but that original input is not in this workspace or its data differs, so it is not linked.');
    expect(marker('101012-C')).toHaveAttribute('title', 'Uploaded result file. Its original input is not linked in this workspace.');

    const preview = async (id: string) => {
      await user.click(within(screen.getByRole('row', { name: new RegExp(id) })).getByRole('button', { name: 'Preview' }));
      const dialog = await screen.findByRole('dialog');
      const text = dialog.textContent;
      await user.click(within(dialog).getByRole('button', { name: /Close/ }));
      return text;
    };
    expect(await preview('101014-V')).toContain('· Imported from 101010');
    const unlinked = await preview('101015-V');
    expect(unlinked).toContain('· Imported: not linked to 101011');
    expect(unlinked).not.toContain('Imported from');
    expect(await preview('101012-C')).toContain('· Imported: original input not linked');
  });

  it('shows the File ID in the preview, and explains an imported result', async () => {
    const user = await open();
    await user.click(within(screen.getByRole('row', { name: /101012-C/ })).getByRole('button', { name: 'Preview' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('File ID 101012-C · ');
    expect(dialog).toHaveTextContent('Imported: original input not linked');
    await user.click(within(dialog).getByRole('button', { name: /Close/ }));
    await user.click(within(screen.getByRole('row', { name: /101010-V/ })).getByRole('button', { name: 'Preview' }));
    const result = await screen.findByRole('dialog');
    expect(result).toHaveTextContent('File ID 101010-V · ');
    expect(result).not.toHaveTextContent('Imported');
  });
});

describe('dialog focus trap', () => {
  it('skips disabled fields when Tab wraps around the dialog', async () => {
    const user = userEvent.setup();
    render(
      <Modal title="Choices" onClose={() => {}}>
        <button>One</button>
        <button>Two</button>
        <input aria-label="Disabled field" disabled />
        <select aria-label="Disabled choice" disabled><option>x</option></select>
      </Modal>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Choices' });
    const focusable = within(dialog).getAllByRole('button');
    const [first, last] = [focusable[0], screen.getByRole('button', { name: 'Two' })];
    last.focus();
    await user.tab();
    expect(first).toHaveFocus(); // wraps to the start instead of stopping at the disabled fields
    await user.tab({ shift: true });
    expect(last).toHaveFocus(); // and back to the last enabled control
  });
});

describe('file identity regression', () => {
  // Two inputs and their results share filenames; only the File IDs tell them apart.
  const inputA: FileMeta = { ...base, id: '101010', name: 'data.csv', status: 'Ready', problemRows: 0 };
  const inputB: FileMeta = { ...inputA, id: '101011' };
  const resultA: FileMeta = { ...base, id: '101010-V', name: 'result_data_validation.csv', status: 'Processed', processor: 'validation', sourceId: '101010', problemRows: 0 };
  const resultB: FileMeta = { ...resultA, id: '101011-V', sourceId: '101011' };
  const dialog = () => screen.getByRole('dialog', { name: 'Replace existing result?' });
  const bar = () => screen.getByRole('toolbar', { name: 'Selected files' });

  async function open() {
    vi.mocked(api.list).mockResolvedValue([inputA, inputB, resultA, resultB]);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('checkbox', { name: 'Select 101010 data.csv' });
    return user;
  }
  async function rerunA(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('checkbox', { name: 'Select 101010 data.csv' }));
    await user.click(screen.getByRole('button', { name: 'Run Processing' }));
  }

  it('asks only about the chosen input\'s result, and Cancel sends nothing', async () => {
    const user = await open();
    await rerunA(user);
    expect(dialog()).toHaveTextContent('file 101010');
    expect(dialog()).toHaveTextContent('101010-V');
    expect(dialog()).not.toHaveTextContent('101011');
    await user.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog', { name: 'Replace existing result?' })).not.toBeInTheDocument();
    expect(api.process).not.toHaveBeenCalled();
  });

  it('Run & Replace replaces only that result, by its input\'s File ID', async () => {
    vi.mocked(api.process).mockResolvedValue(resultA);
    const user = await open();
    await rerunA(user);
    await user.click(within(dialog()).getByRole('button', { name: 'Run & Replace' }));
    await waitFor(() => expect(api.process).toHaveBeenCalledTimes(1));
    expect(api.process).toHaveBeenCalledWith('101010', 'validation', true);
  });

  it('archives one of two same-named results by its File ID', async () => {
    vi.mocked(api.archive).mockResolvedValueOnce([{ ...resultB, archived: true }]);
    const user = await open();
    await user.click(screen.getByRole('checkbox', { name: 'Select 101011-V result_data_validation.csv' }));
    await user.click(within(bar()).getByRole('button', { name: 'Archive 1 file' }));
    await waitFor(() => expect(api.archive).toHaveBeenCalledTimes(1));
    expect(api.archive).toHaveBeenCalledWith(['101011-V'], true);
  });

  it('compares two same-named results by their File IDs and shows both IDs', async () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    try {
      vi.mocked(api.compare).mockResolvedValue({
        processor: 'validation',
        rowMatch: 'batch_id',
        files: [resultA, resultB].map((f) => ({ id: f.id, name: f.name, source: 'Partner A', rows: 1, problems: { total: 0, items: [] } })),
        rows: [{ key: 'A-001', label: 'A-001', rowNumbers: [1, 1] }],
        columns: [{ name: 'composition_total_pct', kind: 'numeric', unit: '%', measure: 'mean', summary: [100, 100], values: [[100, 100]], rowsDiffering: 0, rowsCompared: 1 }],
      });
      const user = await open();
      await user.click(screen.getByRole('checkbox', { name: 'Select 101010-V result_data_validation.csv' }));
      await user.click(screen.getByRole('checkbox', { name: 'Select 101011-V result_data_validation.csv' }));
      await user.click(within(bar()).getByRole('button', { name: 'Compare 2 files' }));
      expect(api.compare).toHaveBeenCalledWith(['101010-V', '101011-V']);
      const chips = within(within(await screen.findByRole('dialog', { name: 'Compare Files' })).getByRole('list', { name: 'Compared files' })).getAllByRole('listitem');
      expect(chips.map((c) => within(c).getByText(/^1010\d\d-V$/).textContent)).toEqual(['101010-V', '101011-V']);
    } finally { vi.unstubAllGlobals(); }
  });
});

describe('compact file table', () => {
  const headers = () => screen.getAllByRole('columnheader').map((h) => h.textContent);
  const subtitle = (dialog: HTMLElement) => within(dialog).getByText(/^File ID /).textContent;

  it('shows no Rows or Columns in either tab, keeping File ID and the dates', async () => {
    const archivedFile: FileMeta = { ...clean, id: 'old', name: 'old.csv', archived: true, archivedAt: '2026-11-08T10:00:00Z' };
    vi.mocked(api.list).mockResolvedValue([clean, invalid, result, archivedFile]);
    const user = await setup();
    expect(screen.getAllByRole('columnheader')[0]).toContainElement(screen.getByRole('checkbox', { name: 'Select all files' }));
    expect(headers().slice(1)).toEqual(['File ID', 'File Name', 'Uploaded', 'Processing function', 'Status', 'Actions']);
    // 25 rows and 7 columns are no longer shown as cells of their own.
    expect(within(row('clean.csv')).getAllByRole('cell').map((c) => c.textContent)).not.toContain('25');
    expect(within(row('clean.csv')).getAllByRole('cell').map((c) => c.textContent)).not.toContain('7');
    await user.click(screen.getByRole('tab', { name: /Archived/ }));
    expect(headers().slice(1)).toEqual(['File ID', 'File Name', 'Archived On', 'Original Upload', 'Processing function', 'Status', 'Actions']);
    expect(within(row('old.csv')).getAllByRole('cell')).toHaveLength(8);
  });

  it('spans the empty-state message across the remaining columns', async () => {
    const user = await setup();
    await user.type(screen.getByRole('textbox', { name: 'Search file ID or name' }), 'nothing matches');
    expect(screen.getByText('No CSV files match your filters.')).toHaveAttribute('colspan', '7');
    await user.click(screen.getByRole('tab', { name: /Archived/ }));
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByText(/^No archived files/)).toHaveAttribute('colspan', '8');
  });

  it('keeps the row and column counts in the preview header, for inputs and results', async () => {
    const imported: FileMeta = { ...result, id: '101012-M', name: 'copy.csv', imported: true };
    vi.mocked(api.list).mockResolvedValue([clean, result, imported]);
    const user = await setup();
    const preview = async (name: string) => {
      await user.click(within(row(name)).getByRole('button', { name: 'Preview' }));
      const dialog = await screen.findByRole('dialog');
      const text = subtitle(dialog);
      await user.click(within(dialog).getByRole('button', { name: /Close/ }));
      return text;
    };
    expect(await preview('clean.csv')).toBe('File ID clean · 25 rows · 7 columns');
    expect(await preview('result.csv')).toBe('File ID result · Component Mass Calculation result · 25 rows · 7 columns · generated columns highlighted');
    expect(await preview('copy.csv')).toBe('File ID 101012-M · Component Mass Calculation result · 25 rows · 7 columns · generated columns highlighted · Imported: original input not linked');
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
  const val = (id: string, name: string, extra: Partial<FileMeta> = {}): FileMeta =>
    ({ ...result, id, name, processor: 'validation', ...extra });
  const valA = val('val-a', 'result_partner_a_baseline_validation.csv');
  const valB = val('val-b', 'result_partner_b_followup_validation.csv');
  const valC = val('val-c', 'result_partner_c_baseline_validation.csv');
  const massA: FileMeta = { ...result, id: 'mass-a', name: 'result_partner_a_baseline_mass.csv' };
  const bar = () => screen.getByRole('toolbar', { name: 'Selected files' });
  const compareButton = () => within(bar()).getByRole('button', { name: /^Compare/ });
  const workspace = () => screen.getByRole('dialog', { name: 'Compare Files' });

  const comparison: CompareResult = {
    processor: 'validation',
    rowMatch: 'position',
    files: [
      { id: 'val-a', name: valA.name, source: 'Partner A', rows: 2, problems: { total: 1, items: [{ row: 2, batchId: 'A-002', message: 'mass missing' }] } },
      { id: 'val-b', name: valB.name, source: 'Partner B', rows: 2, problems: { total: 2, items: [] } },
      { id: 'val-c', name: valC.name, source: 'Partner C', rows: 1, problems: { total: 0, items: [] } },
    ],
    rows: [{ key: '#1', label: '#1', rowNumbers: [1, 1, 1] }, { key: '#2', label: '#2', rowNumbers: [2, 2, null] }],
    columns: [
      { name: 'composition_total_pct', kind: 'numeric', unit: '%', measure: 'mean', summary: [100, 98.73, 99.5],
        values: [[100, 100, 100], [100, 97.46, null]], rowsDiffering: 1, rowsCompared: 2 },
      { name: 'processing_status', kind: 'category', measure: 'count',
        categories: [{ label: 'Valid', counts: [2, 1, 1] }, { label: 'Invalid', counts: [0, 1, 0] }],
        values: [['Valid', 'Valid', 'Valid'], ['Valid', 'Invalid', null]], rowsDiffering: 1, rowsCompared: 2 },
    ],
  };

  beforeEach(() => {
    vi.mocked(api.list).mockResolvedValue([clean, valA, valB, valC, massA]);
    // Recharts' ResponsiveContainer needs ResizeObserver, which jsdom lacks.
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('has no compare footer', async () => {
    await setup();
    expect(screen.queryByRole('combobox', { name: /File A/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Compare Files')).not.toBeInTheDocument();
  });

  it('offers Compare in the selection bar and explains when it cannot run', async () => {
    const user = await setup();
    await user.click(check('clean.csv'));
    expect(within(bar()).queryByRole('button', { name: /^Compare/ })).not.toBeInTheDocument(); // inputs only
    await user.click(check('clean.csv'));

    await user.click(check(valA.name));
    expect(compareButton()).toBeDisabled();
    expect(compareButton()).toHaveAccessibleDescription('Select at least 2 results to compare.');
    await user.click(check(valB.name));
    expect(compareButton()).toHaveAccessibleName('Compare 2 files');
    expect(compareButton()).toBeEnabled();
    await user.click(check(massA.name));
    expect(compareButton()).toHaveAccessibleDescription('Pick results from the same function.');
    await user.click(check(massA.name));
    await user.click(check('clean.csv'));
    expect(compareButton()).toHaveAccessibleDescription('Comparison uses result files only. Unselect input files to compare.');
    expect(api.compare).not.toHaveBeenCalled();
  });

  it('refuses more than five results', async () => {
    const many = Array.from({ length: 6 }, (_, i) => val(`v${i}`, `result_extra_${i}_validation.csv`));
    vi.mocked(api.list).mockResolvedValue(many);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('checkbox', { name: withId('Select', many[0].name) });
    await user.click(screen.getByRole('checkbox', { name: 'Select all files' }));
    expect(compareButton()).toHaveAccessibleDescription('Compare up to 5 results at a time.');
  });

  it('opens the dashboard with file chips, the row chart, summary by file and the at-a-glance figures', async () => {
    const user = await setup();
    vi.mocked(api.compare).mockResolvedValue(comparison);
    for (const f of [valA, valB, valC]) await user.click(check(f.name));
    await user.click(compareButton());
    expect(api.compare).toHaveBeenCalledWith(['val-a', 'val-b', 'val-c']);

    const dialog = await screen.findByRole('dialog', { name: 'Compare Files' });
    expect(dialog).toHaveTextContent('3 files · Composition Validation');
    expect(dialog).toHaveTextContent('Selected files (3)');
    const chips = within(within(dialog).getByRole('list', { name: 'Compared files' })).getAllByRole('listitem');
    // Each chip shows the short label and, separately, the File ID, so files with the same name stay distinct.
    expect(chips.map((c) => c.textContent)).toEqual(['Partner A · Baselineval-a', 'Partner B · Followupval-b', 'Partner C · Baselineval-c']);
    expect(within(chips[0]).getByText('val-a')).toBeInTheDocument();
    expect(within(within(dialog).getByRole('combobox', { name: 'Reference file' })).getAllByRole('option').map((o) => o.textContent))
      .toEqual(['Partner A · Baseline · val-a', 'Partner B · Followup · val-b', 'Partner C · Baseline · val-c']);
    expect(within(chips[0]).getByLabelText('1 flagged')).toBeInTheDocument();
    expect(within(chips[2]).getByLabelText('0 flagged')).toBeInTheDocument();
    expect(dialog).toHaveTextContent('Rows matched by position: these files share no batch IDs');
    expect(within(dialog).getByRole('button', { name: 'Composition total (%)' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(dialog).getByRole('button', { name: 'Overview' })).toHaveAttribute('aria-pressed', 'true');
    expect(dialog).toHaveTextContent('Composition total (%) by row');

    const summary = within(dialog).getByRole('table', { name: 'Summary by file' });
    const summaryRow = (label: string) => within(summary).getAllByRole('row').find((r) => r.textContent?.startsWith(label))!;
    expect(summaryRow('Partner A · Baseline')).toHaveTextContent('Partner A · Baseline(ref)100.00—1');
    expect(summaryRow('Partner B · Followup')).toHaveTextContent('98.73-1.27 pp2');
    expect(summaryRow('Partner C · Baseline')).toHaveTextContent('99.50-0.50 pp0');

    const glance = within(dialog).getByText('Comparison at a glance').parentElement!;
    expect(glance).toHaveTextContent('Reference filePartner A · Baseline');
    expect(glance).toHaveTextContent('Rows differing1 / 2 (50%)');
    expect(glance).toHaveTextContent('Flagged files2 / 3');
    const top = within(dialog).getByRole('table', { name: 'Top differences' });
    expect(within(top).getAllByRole('row').slice(1).map((r) => r.textContent))
      .toEqual(['#2Composition total 97.46% (Δ -2.54 pp)Partner B · FollowupPartner C · Baseline']);

    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Reference file' }), 'Partner C · Baseline · val-c');
    expect(summaryRow('Partner A · Baseline')).toHaveTextContent('100.00+0.50 pp');
    expect(summaryRow('Partner C · Baseline')).toHaveTextContent('(ref)99.50—');
    expect(glance).toHaveTextContent('Reference filePartner C · Baseline');

    await user.click(within(dialog).getByRole('checkbox', { name: 'Show deviation from 100%' }));
    expect(dialog).toHaveTextContent('Composition total (%) by row, deviation from 100%');
  });

  it('switches to a category metric and to the row differences view', async () => {
    const user = await setup();
    vi.mocked(api.compare).mockResolvedValue(comparison);
    for (const f of [valA, valB, valC]) await user.click(check(f.name));
    await user.click(compareButton());
    const dialog = await screen.findByRole('dialog', { name: 'Compare Files' });

    await user.click(within(dialog).getByRole('button', { name: 'Processing status' }));
    expect(dialog).toHaveTextContent('Processing status: rows per category');
    const counts = within(dialog).getByRole('table', { name: 'Rows per category' });
    expect(within(counts).getAllByRole('row').find((r) => r.textContent?.startsWith('Invalid'))).toHaveTextContent('Invalid010');
    const summary = within(dialog).getByRole('table', { name: 'Summary by file' });
    expect(within(summary).getAllByRole('row').slice(1).map((r) => r.textContent))
      .toEqual(['Partner A · Baseline(ref)—1', 'Partner B · Followup12', 'Partner C · Baseline10']);
    expect(within(within(dialog).getByRole('table', { name: 'Top differences' })).getAllByRole('row')[1]).toHaveTextContent('#2Invalid (reference: Valid)');

    await user.click(within(dialog).getByRole('button', { name: 'Composition total (%)' }));
    await user.click(within(dialog).getByRole('button', { name: /View all row details/ }));
    expect(within(dialog).getByRole('button', { name: 'Row differences' })).toHaveAttribute('aria-pressed', 'true');
    const details = within(dialog).getByRole('region', { name: 'Row differences' });
    expect(details).toHaveTextContent('1 of 2 rows differ between files');
    // Only differing rows are listed at first.
    expect(within(details).getByRole('checkbox', { name: 'Only rows that differ' })).toBeChecked();
    expect(within(details).queryByRole('row', { name: /^#1/ })).not.toBeInTheDocument();
    const cells = within(within(details).getByRole('row', { name: /^#2/ })).getAllByRole('cell');
    expect(cells.map((c) => c.textContent)).toEqual(['100.00%', '97.46%', 'not in file']);
    expect(cells[1]).toHaveAttribute('data-differs', 'true');
    expect(cells[0]).not.toHaveAttribute('data-differs');
    await user.click(within(details).getByRole('checkbox', { name: 'Only rows that differ' }));
    expect(within(details).getByRole('row', { name: /^#1/ })).toBeInTheDocument();
  });

  it('shows row labels, never the internal row keys', async () => {
    // Batch-ID rows: the second "A-001" has its own key but is shown as "A-001 (2)".
    vi.mocked(api.compare).mockResolvedValue({
      ...comparison,
      rowMatch: 'batch_id',
      rows: [{ key: 'id:1:A-001', label: 'A-001', rowNumbers: [1, 1, 1] }, { key: 'id:2:A-001', label: 'A-001 (2)', rowNumbers: [2, 2, null] }],
    });
    const user = await setup();
    for (const f of [valA, valB, valC]) await user.click(check(f.name));
    await user.click(compareButton());
    const dialog = await screen.findByRole('dialog', { name: 'Compare Files' });
    const top = within(dialog).getByRole('table', { name: 'Top differences' });
    expect(top).toHaveTextContent('A-001 (2)');
    expect(dialog).not.toHaveTextContent('id:');
    await user.click(within(dialog).getByRole('button', { name: /View all row details/ }));
    const details = within(dialog).getByRole('region', { name: 'Row differences' });
    expect(within(details).getByRole('row', { name: /^A-001 \(2\)/ })).toBeInTheDocument();
    expect(details).not.toHaveTextContent('id:');
  });

  it('closes with Escape and returns focus to the Compare button', async () => {
    const user = await setup();
    vi.mocked(api.compare).mockResolvedValue(comparison);
    await user.click(check(valA.name));
    await user.click(check(valB.name));
    compareButton().focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('dialog', { name: 'Compare Files' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(compareButton()).toHaveFocus();
  });

  it('explains a failed comparison', async () => {
    const user = await setup();
    vi.mocked(api.compare).mockRejectedValue(new Error("These files can't be compared"));
    await user.click(check(valA.name));
    await user.click(check(valB.name));
    await user.click(compareButton());
    expect(await screen.findByRole('alert')).toHaveTextContent("Comparison failed: These files can't be compared");
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(compareButton()).toBeEnabled();
  });

  it('selects the new results after a clean batch so they can be compared', async () => {
    const inputA: FileMeta = { ...clean, id: 'in-a', name: 'a.csv' };
    const inputB: FileMeta = { ...clean, id: 'in-b', name: 'b.csv' };
    vi.mocked(api.list).mockResolvedValue([inputA, inputB, valA, valB]);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('checkbox', { name: 'Select in-a a.csv' });
    vi.mocked(api.process).mockResolvedValueOnce(valA).mockResolvedValueOnce(valB);
    await user.click(check('a.csv'));
    await user.click(check('b.csv'));
    await user.click(screen.getByRole('button', { name: 'Run Processing (2)' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Processed 2 files. Their results are selected, so you can compare them.');
    expect(check(valA.name)).toBeChecked();
    expect(check(valB.name)).toBeChecked();
    expect(check('a.csv')).not.toBeChecked();
    expect(compareButton()).toBeEnabled();
  });
});

describe('request ordering', () => {
  /** A promise the test resolves or rejects when it chooses, to control the order responses arrive. */
  const deferred = <T,>() => {
    let resolve!: (v: T) => void;
    let reject!: (e: Error) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };
  const page = (batchId: string): FileRows =>
    ({ headers: ['batch_id'], rows: [{ batch_id: batchId }], offset: 0, totalRows: 1, generatedColumns: [], problems: { total: 0, items: [] } });

  it('keeps the newest file list when an older list request answers last', async () => {
    const first = deferred<FileMeta[]>();
    const second = deferred<FileMeta[]>();
    vi.mocked(api.list).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    vi.mocked(api.upload).mockResolvedValue(clean);
    const added: FileMeta = { ...clean, id: 'added', name: 'added.csv' };
    const user = userEvent.setup();
    render(<App />);
    await user.upload(document.querySelector<HTMLInputElement>('input[type="file"]')!, [new File(['a'], 'added.csv')]);
    await act(async () => second.resolve([clean, added])); // the upload's refresh answers first
    expect(await screen.findByRole('checkbox', { name: 'Select added added.csv' })).toBeInTheDocument();
    await act(async () => first.resolve([clean])); // the initial load answers last, with older data
    expect(screen.getByRole('checkbox', { name: 'Select added added.csv' })).toBeInTheDocument();
    await act(async () => {});
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('ignores a failure from an older list request', async () => {
    const first = deferred<FileMeta[]>();
    vi.mocked(api.list).mockReturnValueOnce(first.promise).mockResolvedValueOnce([clean]);
    vi.mocked(api.upload).mockResolvedValue(clean);
    const user = userEvent.setup();
    render(<App />);
    await user.upload(document.querySelector<HTMLInputElement>('input[type="file"]')!, [new File(['a'], 'clean.csv')]);
    expect(await screen.findByRole('checkbox', { name: 'Select clean clean.csv' })).toBeInTheDocument();
    await act(async () => first.reject(new Error('Network error')));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the preview of the file now open, even when an earlier file answers last', async () => {
    const forClean = deferred<FileRows>();
    const forInvalid = deferred<FileRows>();
    vi.mocked(api.rows).mockReturnValueOnce(forClean.promise).mockReturnValueOnce(forInvalid.promise);
    const { rerender } = render(<PreviewModal file={clean} onClose={() => {}} />);
    rerender(<PreviewModal file={invalid} onClose={() => {}} />);
    await act(async () => forInvalid.resolve(page('row-of-invalid')));
    expect(await screen.findByText('row-of-invalid')).toBeInTheDocument();
    await act(async () => forClean.resolve(page('row-of-clean')));
    expect(screen.queryByText('row-of-clean')).not.toBeInTheDocument();
    expect(screen.getByText('row-of-invalid')).toBeInTheDocument();
  });

  it('does not show an error from a file that is no longer open', async () => {
    const forClean = deferred<FileRows>();
    vi.mocked(api.rows).mockReturnValueOnce(forClean.promise).mockResolvedValueOnce(page('row-of-invalid'));
    const { rerender } = render(<PreviewModal file={clean} onClose={() => {}} />);
    rerender(<PreviewModal file={invalid} onClose={() => {}} />);
    expect(await screen.findByText('row-of-invalid')).toBeInTheDocument();
    await act(async () => forClean.reject(new Error('File not found')));
    expect(screen.queryByText('File not found')).not.toBeInTheDocument();
  });

  it('explains that Undo waits while a batch is processing, then allows it', async () => {
    const user = await setup();
    await user.click(check('result.csv'));
    vi.mocked(api.archive).mockResolvedValue([{ ...result, archived: true }]);
    await user.click(within(screen.getByRole('toolbar', { name: 'Selected files' })).getByRole('button', { name: /^Archive/ }));
    const toast = await screen.findByRole('status');
    const undo = () => within(toast).getByRole('button', { name: 'Undo' });
    expect(undo()).toBeEnabled();

    let finish!: (m: FileMeta) => void;
    vi.mocked(api.process).mockImplementationOnce(() => new Promise((done) => { finish = done; }));
    await user.click(check('clean.csv'));
    await user.click(screen.getByRole('button', { name: /^Run Processing/ }));
    expect(undo()).toBeDisabled();
    expect(undo()).toHaveAccessibleDescription('Available when processing finishes');

    await act(async () => finish(result));
    expect(undo()).toBeEnabled();
    expect(within(toast).queryByText('Available when processing finishes')).not.toBeInTheDocument();
  });
});
