import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Explanation } from '../../../../shared/ingestion';
import type { FileMeta, FileRows } from '../../../../shared/types';
import { api } from '../../lib/api';
import { PreviewModal } from './PreviewModal';

vi.mock('../../lib/api', () => ({ api: { rows: vi.fn(), explain: vi.fn(), download: vi.fn() } }));

const trace: NonNullable<FileMeta['trace']> = { inputFileId: '100001', mappings: [], units: [], validation: { approval: 'partner', rows: 2, excludedRows: 0, warnings: [] }, processor: 'mass', processorVersion: 1 };
const result: FileMeta = {
  id: '100001-M', name: 'result_a_mass.csv', status: 'Processed', processor: 'mass', rows: 2, columns: 4, uploadedAt: '2026-11-22T10:00:00Z',
  generatedColumns: ['result_id', 'r32_mass_kg'], trace,
};
const data: FileRows = {
  headers: ['batch_id', 'result_id', 'r32_mass_kg'],
  rows: [{ batch_id: 'A-1', result_id: '100001-M', r32_mass_kg: '45.36' }, { batch_id: 'A-2', result_id: '100001-M', r32_mass_kg: '' }],
  offset: 0, totalRows: 2, generatedColumns: ['result_id', 'r32_mass_kg'], problems: { total: 0, items: [] },
};
const explanation: Explanation = {
  traced: true, fileId: '100001-M', row: 1, column: 'r32_mass_kg', value: '45.36',
  processor: { id: 'mass', label: 'Component Mass Calculation', version: 1 }, rowStatus: 'calculated', reasons: '',
  input: { fileId: '100001', name: 'a.csv', source: { kind: 'excel', name: 'a.xlsx', size: 4, sheet: 'Q3' } },
  fields: [
    { field: 'massKg', label: 'Mass', column: 'Net Mass', origin: 'alias', location: 'Q3!D4', raw: '100', unit: 'lb', factor: 0.45359237, normalized: 45.359237 },
    { field: 'r32', label: 'R-32', column: 'R32 %', origin: 'normalized', location: 'Q3!E4', raw: '', confirmed: { asRead: '5O', reasons: ['letter O in a number'], decision: 'blank' }, unit: '%', factor: 1, normalized: null, problem: 'missing' },
  ],
};
const PANEL = 'How this value was calculated';

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.rows).mockResolvedValue(data);
  vi.mocked(api.explain).mockResolvedValue(explanation);
});
afterEach(cleanup);

describe('explaining a calculated value', () => {
  it('opens only from a generated value of a traced result, never from result_id or an original column', async () => {
    render(<PreviewModal file={result} onClose={() => {}} />);
    await screen.findByText('A-1');
    expect(screen.getAllByRole('button', { name: /^Explain / }).map((b) => b.getAttribute('aria-label'))).toEqual(['Explain r32_mass_kg, row 1', 'Explain r32_mass_kg, row 2']);
  });

  it('shows the explanation with each source cell, its location, raw value, unit and the value used', async () => {
    const user = userEvent.setup();
    render(<PreviewModal file={result} onClose={() => {}} />);
    await user.click(await screen.findByRole('button', { name: 'Explain r32_mass_kg, row 1' }));
    expect(api.explain).toHaveBeenCalledWith({ fileId: '100001-M', row: 1, column: 'r32_mass_kg' });
    const panel = await screen.findByRole('region', { name: PANEL });
    expect(panel).toHaveTextContent('Calculated by Component Mass Calculation (version 1) from file 100001 (a.csv)');
    expect(panel).toHaveTextContent('Original file: a.xlsx (excel, sheet Q3)');
    const [mass, r32] = within(panel).getAllByRole('listitem');
    expect(mass).toHaveTextContent('Source location: Q3!D4');
    expect(mass).toHaveTextContent('Raw value: 100');
    expect(mass).toHaveTextContent('Unit lb, factor 0.45359237, value used 45.359237');
    expect(r32).toHaveTextContent('Raw value: (blank)');
    expect(r32).toHaveTextContent('Read as "5O" (letter O in a number); left blank');
    expect(r32).toHaveTextContent('missing, so nothing was calculated from it (never treated as zero)');
  });

  it('moves focus to the panel heading, and back to the cell when it is closed', async () => {
    const user = userEvent.setup();
    render(<PreviewModal file={result} onClose={() => {}} />);
    const cell = await screen.findByRole('button', { name: 'Explain r32_mass_kg, row 1' });
    await user.click(cell);
    await screen.findByRole('region', { name: PANEL });
    expect(screen.getByRole('heading', { name: PANEL })).toHaveFocus();
    await user.click(within(screen.getByRole('region', { name: PANEL })).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('region', { name: PANEL })).not.toBeInTheDocument();
    expect(cell).toHaveFocus();
  });

  it('shows a loading state and drops the old answer when another cell is chosen', async () => {
    const user = userEvent.setup();
    render(<PreviewModal file={result} onClose={() => {}} />);
    await user.click(await screen.findByRole('button', { name: 'Explain r32_mass_kg, row 1' }));
    await screen.findByText(/Calculated by Component Mass Calculation/);
    vi.mocked(api.explain).mockReturnValue(new Promise(() => {}));
    await user.click(screen.getByRole('button', { name: 'Explain r32_mass_kg, row 2' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Loading…');
    expect(screen.queryByText(/Calculated by Component Mass Calculation/)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: PANEL })).toHaveFocus();
  });

  it('says an excluded row was never set to zero', async () => {
    vi.mocked(api.explain).mockResolvedValue({ ...explanation, row: 2, value: '', rowStatus: 'excluded', reasons: 'mass missing' });
    const user = userEvent.setup();
    render(<PreviewModal file={result} onClose={() => {}} />);
    await user.click(await screen.findByRole('button', { name: 'Explain r32_mass_kg, row 2' }));
    expect(await screen.findByText(/This row was excluded from calculations: mass missing\. No value was calculated from it, and it was never set to zero\./)).toBeInTheDocument();
  });

  it('shows a loading state, then an error inside the panel, announced', async () => {
    let fail!: (e: Error) => void;
    vi.mocked(api.explain).mockReturnValue(new Promise((_, reject) => { fail = reject; }));
    const user = userEvent.setup();
    render(<PreviewModal file={result} onClose={() => {}} />);
    await user.click(await screen.findByRole('button', { name: 'Explain r32_mass_kg, row 1' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Loading…');
    fail(new Error('This result has 2 rows; there is no row 9'));
    expect(await screen.findByRole('alert')).toHaveTextContent('there is no row 9');
    expect(screen.getByRole('region', { name: PANEL })).toBeInTheDocument();
  });

  it('keeps cells plain and says why for an older result or an uploaded one', async () => {
    const { rerender } = render(<PreviewModal file={{ ...result, trace: undefined }} onClose={() => {}} />);
    expect(await screen.findByText(/Run the function again to record one/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Explain / })).not.toBeInTheDocument();
    rerender(<PreviewModal file={{ ...result, id: '100009-M', imported: true }} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/This result was uploaded/)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /^Explain / })).not.toBeInTheDocument();
  });

  it('offers no explanation for an input file', async () => {
    vi.mocked(api.rows).mockResolvedValue({ ...data, generatedColumns: [] });
    render(<PreviewModal file={{ ...result, id: '100001', status: 'Ready', trace: undefined, processor: undefined }} onClose={() => {}} />);
    await screen.findByText('A-1');
    expect(screen.queryByRole('button', { name: /^Explain / })).not.toBeInTheDocument();
    expect(screen.queryByText(/Run the function again/)).not.toBeInTheDocument();
  });
});
