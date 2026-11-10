import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompareResult, FileMeta } from '../../shared/types';
import App from './App';
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
  const archived = (f: FileMeta, archivedAt = '2026-11-08T10:00:00Z'): FileMeta => ({ ...f, archived: true, archivedAt });
  const tab = (name: RegExp) => screen.getByRole('tab', { name });
  const bar = () => screen.getByRole('toolbar', { name: 'Selected files' });
  const barButton = (name: RegExp) => within(bar()).getByRole('button', { name });
  const toast = () => screen.getByRole('status');
  const openMenu = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
    await user.click(screen.getByRole('button', { name: `Actions for ${name}` }));
    return screen.getByRole('menu', { name: `Actions for ${name}` });
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
    expect(screen.queryByRole('checkbox', { name: 'Select invalid.csv' })).not.toBeInTheDocument();
    expect(tab(/Archived/)).toHaveTextContent('Archived2');

    await user.click(tab(/Archived/));
    expect(screen.getByText('Archived files are excluded from processing and comparison.')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Archived On/ })).toHaveAttribute('aria-sort', 'descending');
    expect(screen.getByRole('columnheader', { name: 'Original Upload' })).toBeInTheDocument();
    // Most recently archived first, with the archive time and the original upload time.
    const names = screen.getAllByRole('checkbox', { name: /^Select (?!all)/ }).map((c) => c.getAttribute('aria-label'));
    expect(names).toEqual(['Select result.csv', 'Select invalid.csv']);
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
      await screen.findByRole('checkbox', { name: 'Select clean.csv' });
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
    expect(screen.queryByRole('checkbox', { name: 'Select invalid.csv' })).not.toBeInTheDocument();
    await user.click(tab(/Active Files/));
    expect(check('invalid.csv')).toBeInTheDocument();
  });

  it('operates the row menu from the keyboard and closes it with Escape or a click outside', async () => {
    vi.mocked(api.list).mockResolvedValue([clean, archived(invalid)]);
    const user = await setup();
    await user.click(tab(/Archived/));
    const trigger = screen.getByRole('button', { name: 'Actions for invalid.csv' });
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
    rows: [{ key: '#1', rowNumbers: [1, 1, 1] }, { key: '#2', rowNumbers: [2, 2, null] }],
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
    await screen.findByRole('checkbox', { name: `Select ${many[0].name}` });
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
    expect(chips.map((c) => c.textContent)).toEqual(['Partner A · Baseline', 'Partner B · Followup', 'Partner C · Baseline']);
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

    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Reference file' }), 'Partner C · Baseline');
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
    await screen.findByRole('checkbox', { name: 'Select a.csv' });
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
