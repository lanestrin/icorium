import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileMeta } from '../../shared/types';
import App from './App';
import { api } from './api';

vi.mock('./api', () => ({ api: {
  list: vi.fn(), process: vi.fn(), rows: vi.fn(), upload: vi.fn(), compare: vi.fn(),
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
  it('selects both input statuses, excludes results, and toggles rows and checkboxes', async () => {
    const user = await setup();
    expect(check('result.csv')).toBeDisabled();
    expect(within(row('clean.csv')).queryByText(/invalid row/)).not.toBeInTheDocument();
    expect(within(row('invalid.csv')).getByText(/2 invalid/)).toHaveTextContent('2 invalid rows');
    expect(within(row('result.csv')).getByText('Processed')).toBeInTheDocument();
    await user.click(check('clean.csv'));
    await user.click(row('invalid.csv'));
    expect(check('clean.csv')).toBeChecked();
    expect(check('invalid.csv')).toBeChecked();
    expect(screen.getByRole('button', { name: 'Run Processing (2)' })).toBeEnabled();
    expect(screen.getByRole('list', { name: 'Selected input files' })).toHaveTextContent('clean.csvinvalid.csv');
    await user.click(screen.getByRole('checkbox', { name: 'Select all input files' }));
    expect(check('clean.csv')).not.toBeChecked();
    expect(check('invalid.csv')).not.toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: 'Select all input files' }));
    expect(check('clean.csv')).toBeChecked();
    expect(check('invalid.csv')).toBeChecked();
    expect(check('result.csv')).not.toBeChecked();
  });

  it('filters Needs Review and toggles only visible inputs while retaining hidden selections', async () => {
    const user = await setup();
    await user.click(check('clean.csv'));
    expect(screen.getByRole('checkbox', { name: 'Select all input files' })).toBePartiallyChecked();
    await user.selectOptions(statusFilter(), 'Needs Review');
    expect(screen.queryByRole('checkbox', { name: 'Select clean.csv' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Select result.csv' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Select all input files' }));
    expect(screen.getByRole('list', { name: 'Selected input files' })).toHaveTextContent('clean.csvinvalid.csv');
    await user.click(screen.getByRole('checkbox', { name: 'Select all input files' }));
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
    expect(check('result.csv')).toBeDisabled();
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
    await user.click(screen.getByRole('checkbox', { name: 'Select all input files' }));
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
    await user.click(screen.getByRole('checkbox', { name: 'Select all input files' }));
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
